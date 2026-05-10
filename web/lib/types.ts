import { z } from 'zod';
import type { Rectangle } from './geometry';

/**
 * A distance in millimetres. Storage and library inputs are mm-only —
 * UI components convert at the display boundary via `convertUnits`.
 */
const Distance = z.number();
type Distance = z.infer<typeof Distance>;

/**
 * Per-material packing algorithm choice.
 * - `auto`: Run all guillotine variants (Tidy + Compact passes), score picks.
 * - `tidy`: Two-stage guillotine (rip-first / crosscut-first). Aligns
 *   parts of similar widths into columns. Easiest to cut on a table saw.
 * - `compact`: Free-rect n-stage guillotine. Maximum yield within a
 *   guillotine constraint, at the cost of a zigzag cut sequence.
 * - `cnc`: Non-guillotine bottom-left. Maximum yield, requires a CNC router.
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
 * A board size — width × length plus the thicknesses available in that size.
 */
export const StockSize = z.object({
  width: Distance,
  length: Distance,
  thickness: z.array(Distance),
});
export type StockSize = z.infer<typeof StockSize>;

/**
 * For a material, define board sizes and the thicknesses available in each.
 *
 * All numeric dimensions are millimetres. The user's display preference
 * (`distanceUnit`) is applied in the UI only.
 */
export const StockMatrix = z.object({
  material: z.string(),
  /**
   * Available board sizes. Each entry is a width × length pair with its
   * own set of available thicknesses.
   */
  sizes: z.array(StockSize),
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
export type StockMatrix = z.infer<typeof StockMatrix>;

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

/**
 * Intermediate type for storing the board layout with the rectangle class. Not
 * JSON friendly. This gets converted into `BoardLayout`, which doesn't contain
 * any classes, and is safe to convert to and from JSON.
 */
export interface PotentialBoardLayout {
  stock: Stock;
  placements: Rectangle<PartToCut>[];
  algorithm: Exclude<Algorithm, 'auto'>;
}
