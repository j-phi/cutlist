import { z } from 'zod';
import type { Rectangle } from './geometry';

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
  // Tidy passes — two-stage guillotine, column-aligned strips.
  z.literal('tidy-rip-long-side'),
  z.literal('tidy-rip-area'),
  z.literal('tidy-crosscut-long-side'),
  // Compact passes — free-rect n-stage guillotine.
  z.literal('compact-bssf-area'),
  z.literal('compact-bssf-long-side'),
  // Tight (CNC) passes — non-guillotine, max density.
  z.literal('cnc-area'),
  z.literal('cnc-perimeter'),
  z.literal('cnc-random'),
]);
export type SearchPass = z.infer<typeof SearchPass>;

/**
 * Per-part allowances. `crossSection` is applied to both cross-section
 * axes for linear stock (S4S removes material on all four faces) and to
 * the width axis only for sheet stock. Engine values are meters; matrix
 * values are millimetres (see `OversizeSchema`).
 */
export interface Oversize {
  length: number;
  crossSection: number;
}

/**
 * Engine-side sheet stock: a 2D panel (plywood, MDF, hardboard, …).
 * All numbers are meters (engine internal unit).
 */
export interface SheetStock {
  kind: 'sheet';
  /** The material name, matching what is set in Onshape. */
  material: string;
  thickness: number;
  width: number;
  length: number;
  /** Display color for board previews (hex string). */
  color?: string;
  /**
   * Per-(material, thickness) algorithm override, set via
   * `StockMatrix.thicknessAlgorithms`. Falls back to `Config.defaultAlgorithm`.
   */
  algorithm?: Algorithm;
  /** Allowances added to the part footprint at placement time. */
  oversize?: Oversize;
}

/**
 * Engine-side linear stock: a 1D stick at a single length.
 * All numbers are meters (engine internal unit).
 *
 * No `algorithm` override here — `kind: 'linear'` forces the linear
 * packer; per-material algorithm choice only applies to sheet stock.
 */
export interface LinearStock {
  kind: 'linear';
  material: string;
  /** Wider face of the cross-section (e.g. 3.5" / 89mm on a 2×4). */
  crossSectionWidth: number;
  /** Narrower face of the cross-section (e.g. 1.5" / 38mm on a 2×4). */
  crossSectionThickness: number;
  length: number;
  color?: string;
  /** Allowances added to the part's effective length on the stick. */
  oversize?: Oversize;
}

const ZERO_OVERSIZE: Oversize = Object.freeze({ length: 0, crossSection: 0 });

/** Read `stock.oversize` with a zero default — never returns undefined. */
export const effectiveOversize = (s: SheetStock | LinearStock): Oversize =>
  s.oversize ?? ZERO_OVERSIZE;

/**
 * Engine-side stock. A material has a `kind` (sheet, linear, …) which
 * determines its form. Add new kinds as new variants in this union.
 */
export type Stock = SheetStock | LinearStock;

export const isLinearStock = (s: Stock): s is LinearStock =>
  s.kind === 'linear';
export const isSheetStock = (s: Stock): s is SheetStock => s.kind === 'sheet';

// Reject 0, negatives, NaN, infinity at the schema boundary — they
// propagate as silent bugs or blow up layout math downstream.
const PositiveDimension = z.number().positive().finite();

const NonNegativeMm = z.number().nonnegative().finite();

export const OversizeSchema = z.object({
  length: NonNegativeMm.default(0),
  crossSection: NonNegativeMm.default(0),
});

/**
 * Sheet stock matrix: a material sold as 2D panels (plywood, MDF, …).
 * `kind` defaults to `'sheet'` so freshly-authored literals can omit it.
 */
const SheetStockMatrixSchema = z.object({
  kind: z.literal('sheet').default('sheet'),
  material: z.string(),
  /**
   * Available board sizes. Each entry is a width × length pair with its
   * own set of available thicknesses.
   */
  sizes: z.array(
    z.object({
      width: PositiveDimension,
      length: PositiveDimension,
      thickness: z.array(PositiveDimension),
    }),
  ),
  /** Display color for board previews (hex string, e.g. `"#d2b996"`). */
  color: z.string().optional(),
  /**
   * Per-thickness packing algorithm overrides. Keys are the thickness as it
   * appears in `sizes[].thickness` — numbers stringified, strings as-is
   * (e.g. `"18"` for `18mm` or `"0.75"` for `0.75in`). Falls back to
   * `Config.defaultAlgorithm` when omitted.
   */
  thicknessAlgorithms: z.record(z.string(), Algorithm).optional(),
  /** Rough-cut allowance applied to each part's footprint (mm). */
  oversize: OversizeSchema.optional(),
});

/**
 * A linear stock cross-section: a single fixed width × thickness sold in
 * one or more standard lengths (e.g. a 2×4 in 8 ft / 10 ft / 12 ft).
 */
export const LinearStockSize = z.object({
  /** Cross-section width in millimetres (the wider face). */
  crossSectionWidth: PositiveDimension,
  /** Cross-section thickness in millimetres (the narrower face). */
  crossSectionThickness: PositiveDimension,
  /** Available stock lengths in millimetres. */
  lengths: z.array(PositiveDimension),
});
export type LinearStockSize = z.infer<typeof LinearStockSize>;

/**
 * Linear stock matrix: a material sold as 1D sticks (dimensional lumber,
 * trim, dowels). Cross-section is fixed; only length varies.
 */
const LinearStockMatrixSchema = z.object({
  kind: z.literal('linear'),
  material: z.string(),
  size: LinearStockSize,
  /** Display color for board previews (hex string). */
  color: z.string().optional(),
  /** Rough-cut allowance applied to length and cross-section (mm). */
  oversize: OversizeSchema.optional(),
});

/**
 * For a material, define stock dimensions. A material is sheet OR linear,
 * never both — the packer routes per material on `kind`. All numeric
 * dimensions are millimetres; display unit is applied in the UI only.
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
 * Part info, material, and size. Everything needed to know how to layout the board on stock.
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
    /**
     * In meters
     */
    width: number;
    /**
     * In meters
     */
    length: number;
    /**
     * In meters
     */
    thickness: number;
  };
}

/**
 * Options for generating the board layouts.
 */
export const Config = z.object({
  /**
   * The blade kerf in millimetres. Defaults to ≈1/8" (3.175mm).
   */
  bladeWidth: z.number().default(3.175),
  /**
   * Default packing algorithm used for any material that doesn't specify its
   * own. See `Algorithm` for variant descriptions.
   */
  defaultAlgorithm: Algorithm.default('auto'),
  /**
   * Board margin in millimetres — inset from all edges where parts will not
   * be placed. Useful for clamping area, trimming damaged edges, or
   * out-of-square stock.
   */
  margin: z.number().default(0),
  /**
   * Optional cap on the number of search passes run per stock group in
   * `auto` mode. When unset, every pass in `DEFAULT_SEARCH_PASSES` (or the
   * caller-provided `searchPasses` list) runs to completion. Replaces the
   * previous wall-clock budget, which made the "winning" layout depend on
   * the machine's speed.
   */
  maxSearchPasses: z.number().int().positive().optional(),
  /**
   * Optional pass override for the multi-pass optimizer.
   */
  searchPasses: z.array(SearchPass).optional(),
  precision: z.number().default(1e-5),
});
export type Config = z.infer<typeof Config>;
export type ConfigInput = z.input<typeof Config>;

/** Per-board info attached to a sheet layout (output side). */
export interface SheetBoardLayoutStock {
  material: string;
  widthM: number;
  lengthM: number;
  thicknessM: number;
  color?: string;
}

/** Per-board info attached to a linear layout (output side). */
export interface LinearBoardLayoutStock {
  material: string;
  crossSectionWidthM: number;
  crossSectionThicknessM: number;
  lengthM: number;
  color?: string;
}

/**
 * A part that wasn't placed (or a placement viewed as a leftover-shaped
 * record — same field set). Shared between sheet placements and linear
 * placements so BOM aggregation can treat both uniformly.
 */
export interface BoardLayoutLeftover {
  partNumber: number;
  instanceNumber: number;
  name: string;
  material: string;
  widthM: number;
  lengthM: number;
  thicknessM: number;
  grainLock?: 'length' | 'width';
}

/** Sheet placement: leftover shape + 2D bounding rectangle on the board. */
export interface SheetBoardLayoutPlacement extends BoardLayoutLeftover {
  leftM: number;
  rightM: number;
  topM: number;
  bottomM: number;
}

/** Linear placement: leftover shape + 1D offset along the stick. */
export interface LinearBoardLayoutPlacement extends BoardLayoutLeftover {
  /** Offset from the start of the stick in METERS. */
  offsetM: number;
}

/** Engine output for a single sheet. */
export interface SheetBoardLayout {
  kind: 'sheet';
  stock: SheetBoardLayoutStock;
  placements: SheetBoardLayoutPlacement[];
  /** Board margin in meters (inset from all edges). 0 when no margin is set. */
  marginM: number;
  /** The concrete algorithm that produced this board (never `'auto'`). */
  algorithm: Exclude<Algorithm, 'auto'>;
}

/**
 * Engine output for a single linear stick. Linear stock has no margin
 * concept — you don't trim the rip face of a 2×4 — so offsets are absolute
 * along the stick (`offsetM` measured from the leading end).
 */
export interface LinearBoardLayout {
  kind: 'linear';
  stock: LinearBoardLayoutStock;
  placements: LinearBoardLayoutPlacement[];
  /** Trailing waste left over after the last cut, in METERS. */
  wasteEndM: number;
}

/**
 * Engine output. A layout has a `kind` matching its stock's `kind`.
 * Add new layout variants when adding new stock kinds.
 */
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
 * Intermediate type for storing the board layout with the rectangle class.
 * Not JSON friendly. This gets converted into `BoardLayout`, which doesn't
 * contain any classes, and is safe to convert to and from JSON.
 *
 * Discriminated on `kind` mirroring `BoardLayout`, so the sheet branch
 * carries `algorithm` and the linear branch doesn't — no runtime guard
 * required at serialize time.
 */
export type PotentialBoardLayout =
  | PotentialSheetBoardLayout
  | PotentialLinearBoardLayout;
