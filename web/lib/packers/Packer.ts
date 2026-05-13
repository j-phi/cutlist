import type { Rectangle } from '../geometry/Rectangle';
import type { Micrometres } from '../utils/units';

/**
 * Bin-packing interface. `createBinState` / `tryPlaceInBinState` give the
 * engine multi-board lookback: it keeps per-board state and tries fitting a
 * part on previously-opened boards before opening a new one. `addToPack` is
 * a building block exposed for `GenericPacker`-based composition; most
 * packers stub it.
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
  /** Build the per-bin state used by `tryPlaceInBinState`. Opaque to callers. */
  createBinState(bin: Rectangle<unknown>): unknown;
  /**
   * Place a single rect using the bin state. Mutates `state` and returns
   * the translated placement on success, or `null` when the rect doesn't
   * fit (state is unchanged in that case).
   */
  tryPlaceInBinState(
    state: unknown,
    rect: Rectangle<T>,
    options: PackOptions<T>,
  ): Rectangle<T> | null;
}

export interface PackOptions<T = unknown> {
  /** Kerf consumed between adjacent placements. Integer micrometres. */
  gap: Micrometres;
  allowRotations: boolean;
  /** Optional per-rect override. Both flags must be true to rotate. */
  canRotateRect?: (data: T) => boolean;
}

export interface PackResult<T> {
  placements: Rectangle<T>[];
  leftovers: T[];
}
