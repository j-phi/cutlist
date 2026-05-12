import type { Rectangle } from '../geometry/Rectangle';

/**
 * Interface responsible for implementing the bin packing algorithm.
 *
 * Optional `createBinState` / `tryPlaceInBinState` give a packer multi-board
 * lookback support: callers can keep per-board state and try fitting a part
 * on previously-opened boards before opening a new one. Packers that omit
 * these fall back to single-board pack-and-move-on.
 */
export interface Packer<T> {
  pack(
    bin: Rectangle<unknown>,
    rects: Rectangle<T>[],
    options: PackOptions<T>,
  ): PackResult<T>;
  addToPack(
    res: PackResult<T>,
    bin: Rectangle<unknown>,
    rects: Rectangle<T>[],
    options: PackOptions<T>,
  ): void;
  /**
   * Build the per-bin state used by `tryPlaceInBinState`. Opaque to callers —
   * only this packer interprets the value.
   */
  createBinState?(bin: Rectangle<unknown>): unknown;
  /**
   * Attempt to place a single rect using the bin state. Mutates `state` and
   * returns the translated placement on success, or `null` when the rect
   * doesn't fit (state is unchanged in that case).
   */
  tryPlaceInBinState?(
    state: unknown,
    rect: Rectangle<T>,
    options: PackOptions<T>,
  ): Rectangle<T> | null;
}

export interface PackOptions<T = unknown> {
  gap: number;
  /** Placement-geometry tolerance — see `Config.placementEpsilon`. */
  placementEpsilon: number;
  allowRotations: boolean;
  /** Optional per-rect override. When provided, a rect can only be rotated if both
   * `allowRotations` is true AND this function returns true for that rect's data. */
  canRotateRect?: (data: T) => boolean;
}

export interface PackResult<T> {
  /**
   * List of rectangles that fit, translated to their packed location.
   */
  placements: Rectangle<T>[];
  /**
   * Any rectangles that didn't fit are returned here. Their positions are left untouched.
   */
  leftovers: T[];
}
