import { z } from 'zod';
import type { Rectangle } from './geometry';
import { type Micrometres, mmToUm, um } from './utils/units';

export const MicrometresSchema = z
  .number()
  .int()
  .nonnegative()
  .transform((n) => n as Micrometres);

/**
 * Per-material packing algorithm choice.
 * - `auto`: Run all guillotine variants (Tidy + Compact passes), score picks.
 * - `tidy`: Two-stage guillotine (rip-first / crosscut-first). Aligns
 *   parts of similar widths into columns. Easiest to cut on a table saw.
 * - `compact`: Free-rect n-stage guillotine. Maximum yield within a
 *   guillotine constraint, at the cost of a zigzag cut sequence.
 * - `cnc`: Non-guillotine bottom-left. Maximum yield, requires a CNC router.
 *
 * Linear (1D) stock is not represented here — it has only one strategy
 * (first-fit-decreasing) and is routed outside the algorithm tournament.
 */
export const Algorithm = z.enum(['auto', 'tidy', 'compact', 'cnc']);
export type Algorithm = z.infer<typeof Algorithm>;

export const SearchPass = z.union([
  z.literal('tidy-rip-long-side'),
  z.literal('tidy-rip-area'),
  z.literal('tidy-crosscut-long-side'),
  z.literal('compact-bssf-area'),
  z.literal('compact-bssf-long-side'),
  z.literal('cnc-area'),
  z.literal('cnc-perimeter'),
  z.literal('cnc-random'),
]);
export type SearchPass = z.infer<typeof SearchPass>;

/**
 * Per-part allowances. `crossSection` applies to both cross-section axes for
 * linear stock and to the width axis only for sheet stock. Integer
 * micrometres throughout; matrix values arrive as mm and are converted at
 * the schema seam (see `reduceStockMatrix`).
 */
export interface Oversize {
  length: Micrometres;
  crossSection: Micrometres;
}

/**
 * Stock tier. `'offcut'` is finite inventory the user already owns and wants
 * consumed first; `'general'` is infinite buyable stock (the default). The
 * engine packs offcuts before general within each (material, thickness) group.
 */
export type StockRole = 'offcut' | 'general';

/** Engine-side sheet stock. All dimensions are integer micrometres. */
export interface SheetStock {
  kind: 'sheet';
  /**
   * Human label for this specific stock item (e.g. "Cabinet door offcut").
   * Shown on the Layout page so cuts can be assigned to a physical board.
   * Falls back to `material` when unset (legacy / YAML presets).
   */
  name?: string;
  /** Category the part's material must match (e.g. "Plywood"). */
  material: string;
  thickness: Micrometres;
  width: Micrometres;
  length: Micrometres;
  color?: string;
  algorithm?: Algorithm;
  oversize?: Oversize;
  /** Stock tier — defaults to `'general'` (infinite). */
  role: StockRole;
  /**
   * For offcuts: how many physical boards of this exact size exist. `undefined`
   * (always the case for `'general'`) means infinite supply.
   */
  quantity?: number;
  /**
   * Optional, currency-agnostic per-board cost. Drives material-cost reporting
   * (F2). `undefined` ≡ unpriced — the shopping list omits cost for the group.
   */
  cost?: number;
}

/** Engine-side linear stock. All dimensions are integer micrometres. */
export interface LinearStock {
  kind: 'linear';
  /**
   * Human label for this specific stock item. Shown on the Layout page.
   * Falls back to `material` when unset (legacy / YAML presets).
   */
  name?: string;
  /** Category the part's material must match (e.g. "Pine"). */
  material: string;
  crossSectionWidth: Micrometres;
  crossSectionThickness: Micrometres;
  length: Micrometres;
  color?: string;
  oversize?: Oversize;
  /** Stock tier — defaults to `'general'` (infinite). */
  role: StockRole;
  /** For offcuts: finite stick count. `undefined` means infinite supply. */
  quantity?: number;
  /**
   * Optional, currency-agnostic per-stick cost. Drives material-cost reporting
   * (F2). `undefined` ≡ unpriced.
   */
  cost?: number;
}

const ZERO_OVERSIZE: Oversize = Object.freeze({
  length: um(0),
  crossSection: um(0),
});

export const effectiveOversize = (s: SheetStock | LinearStock): Oversize =>
  s.oversize ?? ZERO_OVERSIZE;

export type Stock = SheetStock | LinearStock;

export const isLinearStock = (s: Stock): s is LinearStock =>
  s.kind === 'linear';
export const isSheetStock = (s: Stock): s is SheetStock => s.kind === 'sheet';

const PositiveDimension = z.number().positive().finite();
const NonNegativeMm = z.number().nonnegative().finite();
const PositiveCount = z.number().int().positive();
/** Currency-agnostic cost: rejects negative and non-finite values (FR-COST-4). */
const PositiveCost = z.number().positive().finite();

export const OversizeSchema = z.object({
  length: NonNegativeMm.default(0),
  crossSection: NonNegativeMm.default(0),
});

/**
 * Stock tier. Stored per matrix entry; `'offcut'` rows carry a per-size
 * `quantity` and are consumed before general stock. Absent ≡ `'general'`
 * (infinite) — the engine fills the default in `reduceStockMatrix`, so legacy
 * rows and the preset/manual UI never need to set it.
 */
export const StockRoleSchema = z.enum(['offcut', 'general']).optional();

const SheetStockMatrixSchema = z.object({
  kind: z.literal('sheet').default('sheet'),
  /**
   * Per-item display name (Layout page). Optional for legacy YAML presets;
   * `reduceStockMatrix` falls back to `material` when absent.
   */
  name: z.string().optional(),
  /** Material category — what a part's material matches against. */
  material: z.string(),
  sizes: z.array(
    z.object({
      /**
       * Per-board display label (e.g. "Board 1", "Garage offcut"). Shown on
       * the Layout page so each physical board can be identified. Absent ≡ a
       * generated "Board N" label in the UI; `reduceStockMatrix` falls back to
       * the matrix-level `name` (then `material`) when absent.
       */
      name: z.string().optional(),
      width: PositiveDimension,
      length: PositiveDimension,
      thickness: z.array(PositiveDimension),
      /**
       * Offcut-only: how many physical sheets of this size exist. Ignored for
       * `'general'` stock (infinite). Absent ≡ 1 for offcuts.
       */
      quantity: PositiveCount.optional(),
      /**
       * Optional, currency-agnostic per-board cost for material-cost reporting
       * (F2). Must be positive and finite; absent ≡ unpriced.
       */
      cost: PositiveCost.optional(),
    }),
  ),
  role: StockRoleSchema,
  color: z.string().optional(),
  /**
   * Per-thickness packing algorithm overrides. Keys are the thickness as it
   * appears in `sizes[].thickness` — numbers stringified, strings as-is
   * (e.g. `"18"` for `18mm` or `"0.75"` for `0.75in`). Falls back to
   * `Config.defaultAlgorithm` when omitted.
   */
  thicknessAlgorithms: z.record(z.string(), Algorithm).optional(),
  oversize: OversizeSchema.optional(),
});

export const LinearStockSize = z.object({
  crossSectionWidth: PositiveDimension,
  crossSectionThickness: PositiveDimension,
  lengths: z.array(PositiveDimension),
  /**
   * Optional, currency-agnostic per-stick cost for material-cost reporting
   * (F2). Must be positive and finite; absent ≡ unpriced.
   */
  cost: PositiveCost.optional(),
});
export type LinearStockSize = z.infer<typeof LinearStockSize>;

const LinearStockMatrixSchema = z.object({
  kind: z.literal('linear'),
  /**
   * Per-item display name (Layout page). Optional for legacy YAML presets;
   * `reduceStockMatrix` falls back to `material` when absent.
   */
  name: z.string().optional(),
  /** Material category — what a part's material matches against. */
  material: z.string(),
  size: LinearStockSize,
  role: StockRoleSchema,
  color: z.string().optional(),
  oversize: OversizeSchema.optional(),
});

/**
 * For a material, define stock dimensions. A material is sheet OR linear,
 * never both — the packer routes per material on `kind`. All numeric
 * dimensions are millimetres; the display unit is applied in the UI only.
 *
 * Modelled as `z.union` rather than `z.discriminatedUnion` so the sheet
 * variant's `kind` default fills in for legacy YAML and in-code presets
 * that bypass the v3 migration — kind-less rows still parse as sheet.
 */
export const StockMatrix = z.union([
  SheetStockMatrixSchema,
  LinearStockMatrixSchema,
]);
export type StockMatrix = z.infer<typeof StockMatrix>;
export type SheetStockMatrix = z.infer<typeof SheetStockMatrixSchema>;
export type LinearStockMatrix = z.infer<typeof LinearStockMatrixSchema>;

/**
 * Part info, material, and size. Everything needed to know how to lay out
 * the part on stock. All dimensions are integer micrometres.
 */
export interface PartToCut {
  partNumber: number;
  instanceNumber: number;
  name: string;
  material: string;
  sourcePartId?: string;
  sourceElementId?: string;
  /**
   * Locks the part to a specific grain orientation, preventing the packer
   * from rotating it.
   * - `'length'`: part's length dimension runs with the grain (↕ in layout)
   * - `'width'`: part's width dimension runs with the grain (↔ in layout)
   * - `undefined`: free rotation — optimizer chooses best orientation
   */
  grainLock?: 'length' | 'width';
  size: {
    width: Micrometres;
    length: Micrometres;
    thickness: Micrometres;
  };
}

/**
 * Options for generating board layouts. `bladeWidth` and `margin` arrive
 * as integer micrometres — the storage domain. Schema-side defaults are
 * a 1/8″ kerf (3175 µm) and no margin.
 */
export const Config = z.object({
  bladeWidth: MicrometresSchema.default(mmToUm(3.175)),
  defaultAlgorithm: Algorithm.default('auto'),
  margin: MicrometresSchema.default(um(0)),
  /**
   * Optional cap on the number of search passes run per stock group in
   * `auto` mode. When unset, every pass in the default list (or the
   * caller-provided `searchPasses` list) runs to completion.
   */
  maxSearchPasses: z.number().int().positive().optional(),
  searchPasses: z.array(SearchPass).optional(),
});
export type Config = z.infer<typeof Config>;
export type ConfigInput = z.input<typeof Config>;

/** Per-board info attached to a sheet layout (output side). */
export interface SheetBoardLayoutStock {
  /** Display name of the stock item this board came from (Layout page). */
  name: string;
  material: string;
  widthUm: Micrometres;
  lengthUm: Micrometres;
  thicknessUm: Micrometres;
  color?: string;
  /** Which tier this board came from — lets the UI tally offcuts vs buys. */
  role: StockRole;
  /** Currency-agnostic per-board cost (F2). `undefined` ≡ unpriced. */
  cost?: number;
}

/** Per-board info attached to a linear layout (output side). */
export interface LinearBoardLayoutStock {
  /** Display name of the stock item this board came from (Layout page). */
  name: string;
  material: string;
  crossSectionWidthUm: Micrometres;
  crossSectionThicknessUm: Micrometres;
  lengthUm: Micrometres;
  color?: string;
  /** Which tier this board came from — lets the UI tally offcuts vs buys. */
  role: StockRole;
  /** Currency-agnostic per-stick cost (F2). `undefined` ≡ unpriced. */
  cost?: number;
}

/**
 * A part that wasn't placed (or a placement viewed as a leftover-shaped
 * record). Shared between sheet and linear so BOM aggregation can treat
 * both uniformly.
 */
export interface BoardLayoutLeftover {
  partNumber: number;
  instanceNumber: number;
  name: string;
  material: string;
  widthUm: Micrometres;
  lengthUm: Micrometres;
  thicknessUm: Micrometres;
  grainLock?: 'length' | 'width';
}

/**
 * Sheet placement. Inherits intrinsic `widthUm` / `lengthUm` (identical
 * across instances); the on-board footprint is the corner rectangle, which
 * may swap those when the packer rotates the part to fit.
 */
export interface SheetBoardLayoutPlacement extends BoardLayoutLeftover {
  leftUm: Micrometres;
  rightUm: Micrometres;
  topUm: Micrometres;
  bottomUm: Micrometres;
  /** Allowance slice along the +X edge of the placed rectangle. */
  allowanceWidthUm: Micrometres;
  /** Allowance slice along the +Y edge of the placed rectangle. */
  allowanceLengthUm: Micrometres;
}

/** Linear placement: leftover shape + 1D offset along the stick. */
export interface LinearBoardLayoutPlacement extends BoardLayoutLeftover {
  /** Offset from the start of the stick. */
  offsetUm: Micrometres;
  /**
   * Slice of `lengthUm` consumed by the length allowance (crosscut waste)
   * at the trailing end. Zero when no stock allowance is set.
   */
  allowanceLengthUm: Micrometres;
}

/** Engine output for a single sheet. */
export interface SheetBoardLayout {
  kind: 'sheet';
  stock: SheetBoardLayoutStock;
  placements: SheetBoardLayoutPlacement[];
  /** Board margin inset on all edges. 0 when unset. */
  marginUm: Micrometres;
  /** The concrete algorithm that produced this board (never `'auto'`). */
  algorithm: Exclude<Algorithm, 'auto'>;
}

/**
 * Engine output for a single linear stick. Linear stock has no margin
 * concept; offsets are absolute along the stick.
 */
export interface LinearBoardLayout {
  kind: 'linear';
  stock: LinearBoardLayoutStock;
  placements: LinearBoardLayoutPlacement[];
  /** Trailing waste left over after the last cut. */
  wasteEndUm: Micrometres;
}

export type BoardLayout = SheetBoardLayout | LinearBoardLayout;

export const isLinearBoardLayout = (l: BoardLayout): l is LinearBoardLayout =>
  l.kind === 'linear';
export const isSheetBoardLayout = (l: BoardLayout): l is SheetBoardLayout =>
  l.kind === 'sheet';

/**
 * Intermediate sheet layout — board + rectangles before serialization.
 * Carries the sheet algorithm that produced it.
 */
export interface PotentialSheetBoardLayout {
  kind: 'sheet';
  stock: SheetStock;
  placements: Rectangle<PartToCut>[];
  algorithm: Exclude<Algorithm, 'auto'>;
}

/**
 * Intermediate linear layout — stick + rectangles before serialization.
 * Linear stock has no algorithm choice (FFD only).
 */
export interface PotentialLinearBoardLayout {
  kind: 'linear';
  stock: LinearStock;
  placements: Rectangle<PartToCut>[];
}

/**
 * Intermediate board layout, discriminated on `kind` to mirror
 * `BoardLayout`. Holds `Rectangle` instances; converted to JSON-friendly
 * `BoardLayout` at the engine's serialization boundary.
 */
export type PotentialBoardLayout =
  | PotentialSheetBoardLayout
  | PotentialLinearBoardLayout;
