import { Rectangle } from '../geometry';
import type { Micrometres } from '../utils/units';
import type { PackOptions, PackResult, Packer } from './Packer';

interface LinearBinState<T> {
  bin: Rectangle<unknown>;
  cursor: Micrometres;
  placements: Rectangle<T>[];
}

/**
 * 1D first-fit-decreasing packer for linear stock (timber sticks).
 * Length axis is Y (rect.height); cross-section is X (rect.width).
 * Kerf is consumed between cuts only — never at the leading edge.
 * Rotation is ignored: cross-section is fixed, so `allowRotations` is a no-op.
 */
export function createLinearPacker<T>(): Packer<T> {
  return { pack, addToPack, createBinState, tryPlaceInBinState };

  function pack(
    bin: Rectangle<unknown>,
    rects: Rectangle<T>[],
    options: PackOptions<T>,
  ): PackResult<T> {
    const res: PackResult<T> = { placements: [], leftovers: [] };
    addToPack(res, bin, rects, options);
    return res;
  }

  function addToPack(
    res: PackResult<T>,
    bin: Rectangle<unknown>,
    rects: Rectangle<T>[],
    options: PackOptions<T>,
  ): void {
    const sorted = [...rects].sort((a, b) => b.height - a.height);
    const cursor = res.placements.reduce<Micrometres>(
      (top, p) => Math.max(top, p.top) as Micrometres,
      bin.bottom,
    );
    const state: LinearBinState<T> = {
      bin,
      cursor,
      placements: res.placements,
    };
    for (const rect of sorted) {
      const placed = tryPlaceInBinState(state, rect, options);
      if (!placed) res.leftovers.push(rect.data);
    }
  }

  function createBinState(bin: Rectangle<unknown>): LinearBinState<T> {
    return { bin, cursor: bin.bottom, placements: [] };
  }

  function tryPlaceInBinState(
    rawState: unknown,
    rect: Rectangle<T>,
    options: PackOptions<T>,
  ): Rectangle<T> | null {
    const state = rawState as LinearBinState<T>;
    if (rect.width !== state.bin.width) return null;
    const gap = (
      state.placements.length === 0 ? 0 : options.gap
    ) as Micrometres;
    const start = (state.cursor + gap) as Micrometres;
    if (start + rect.height > state.bin.top) return null;
    const placed = new Rectangle(
      rect.data,
      state.bin.left,
      start,
      rect.width,
      rect.height,
    );
    state.placements.push(placed);
    state.cursor = (start + rect.height) as Micrometres;
    return placed;
  }
}
