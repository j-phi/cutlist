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
 * - `linear`: 1D first-fit-decreasing for linear timber stock (sticks). Only
 *   valid for `LinearStock` materials; ignored for sheet stock.
 */
export const Algorithm = z.enum(['auto', 'tidy', 'compact', 'cnc', 'linear']);
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
  // Linear (1D timber) pass — first-fit-decreasing on length.
  z.literal('linear-ffd'),
]);
export type SearchPass = z.infer<typeof SearchPass>;

/**
 * Contains the material and dimensions for a single panel or board.
 */
export interface Stock {
  /** The material name, matching what is set in Onshape. */
  material: string;
  /** In meters. */
  thickness: number;
  /** In meters. */
  width: number;
  /** In meters. */
  length: number;
  /** Display color for board previews (hex string). */
  color?: string;
  /**
   * Per-(material, thickness) algorithm override, set via
   * `StockMatrix.thicknessAlgorithms`. Falls back to `Config.defaultAlgorithm`.
   */
  algorithm?: Algorithm;
}

/**
 * Engine-side linear stock: a single stick at a single length.
 *
 * Cross-section dimensions distinguish this from `Stock`'s panel `width` /
 * `thickness` pair so callers can't accidentally feed a linear stick into a
 * 2D packer. All numbers are meters (engine internal unit).
 */
export interface LinearStock {
  kind: 'linear';
  material: string;
  /** Cross-section width in METERS. */
  crossSectionWidth: number;
  /** Cross-section thickness in METERS. */
  crossSectionThickness: number;
  /** Stick length in METERS. */
  length: number;
  color?: string;
  algorithm?: Algorithm;
}

/** Engine-side stock union — sheet panels or linear sticks. */
export type AnyStock = Stock | LinearStock;

export const isLinearStock = (s: AnyStock): s is LinearStock =>
  'kind' in s && s.kind === 'linear';

/**
 * Sheet stock matrix: a material sold as 2D panels (plywood, MDF, melamine).
 *
 * The discriminator defaults to `'sheet'` so freshly-authored literals (UI
 * forms, presets) round-trip without callers having to type the field. By
 * the time YAML reaches `parseStock`, the v4 migration has stamped explicit
 * `kind: 'sheet'` on every legacy row.
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
      width: z.number(),
      length: z.number(),
      thickness: z.array(z.number()),
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
});

/**
 * A linear stock cross-section: a single fixed width × thickness sold in
 * one or more standard lengths (e.g. a 2×4 in 8 ft / 10 ft / 12 ft).
 */
export const LinearStockSize = z.object({
  /** Cross-section width in millimetres (the wider face). */
  crossSectionWidth: z.number(),
  /** Cross-section thickness in millimetres (the narrower face). */
  crossSectionThickness: z.number(),
  /** Available stock lengths in millimetres. */
  lengths: z.array(z.number()),
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
  /**
   * Optional per-material algorithm override. Falls back to
   * `Config.defaultAlgorithm` when omitted; only `'linear'` is meaningful
   * for this kind.
   */
  algorithm: Algorithm.optional(),
});

/**
 * For a material, define stock dimensions. A material is *either* sheet
 * *or* linear — never both. The packer routes per material based on the
 * `kind` discriminator.
 *
 * Modeled as `z.union` rather than `z.discriminatedUnion` so the sheet
 * variant's `kind` default fills in for legacy YAML rows authored before
 * v4. The v4 migration also stamps `kind: 'sheet'` explicitly, but the
 * default keeps `parseStock` forgiving of any path that bypasses migration
 * (e.g. seed presets defined in code).
 *
 * All numeric dimensions are millimetres. The user's display preference
 * (`distanceUnit`) is applied in the UI only.
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

/**
 * JSON friendly object containing boards and part placements.
 */
export interface BoardLayout {
  stock: BoardLayoutStock;
  placements: BoardLayoutPlacement[];
  /** Board margin in meters (inset from all edges). 0 when no margin is set. */
  marginM: number;
  /** The concrete algorithm that produced this board (never `'auto'`). */
  algorithm: Exclude<Algorithm, 'auto'>;
}

export interface BoardLayoutStock {
  material: string;
  widthM: number;
  lengthM: number;
  thicknessM: number;
  color?: string;
}

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

export interface BoardLayoutPlacement extends BoardLayoutLeftover {
  leftM: number;
  rightM: number;
  topM: number;
  bottomM: number;
}

export interface LinearBoardLayoutStock {
  material: string;
  crossSectionWidthM: number;
  crossSectionThicknessM: number;
  lengthM: number;
  color?: string;
}

export interface LinearBoardLayoutPlacement {
  partNumber: number;
  instanceNumber: number;
  name: string;
  material: string;
  /** Part's authored width in METERS. Equals the stock's cross-section width
   *  in whichever orientation the part matched. Carried so BOM consumers and
   *  hover info can resolve dimensions without joining back to the source part. */
  widthM: number;
  /** Part's authored thickness in METERS. See `widthM`. */
  thicknessM: number;
  /** Cut length in METERS — the only dimension that varies along the stick. */
  lengthM: number;
  /** Offset from the start of the stick in METERS. */
  offsetM: number;
}

/**
 * Engine output for a single linear stick. The stick view in the UI and the
 * shopping-list aggregator both consume this shape directly.
 */
export interface LinearBoardLayout {
  kind: 'linear';
  stock: LinearBoardLayoutStock;
  placements: LinearBoardLayoutPlacement[];
  marginM: number;
  /** Trailing waste left over after the last cut, in METERS. */
  wasteEndM: number;
  algorithm: 'linear';
}

/** Engine output union — sheet board layouts or linear stick layouts. */
export type AnyBoardLayout = BoardLayout | LinearBoardLayout;

export const isLinearBoardLayout = (
  l: AnyBoardLayout,
): l is LinearBoardLayout => 'kind' in l && l.kind === 'linear';

/**
 * Intermediate type for storing the board layout with the rectangle class. Not
 * JSON friendly. This gets converted into `BoardLayout`, which doesn't contain
 * any classes, and is safe to convert to and from JSON.
 */
export interface PotentialBoardLayout {
  stock: AnyStock;
  placements: Rectangle<PartToCut>[];
  algorithm: Exclude<Algorithm, 'auto'>;
}
