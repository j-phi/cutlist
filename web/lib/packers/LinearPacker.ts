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
  return { pack, createBinState, tryPlaceInBinState };

  function pack(
    bin: Rectangle<unknown>,
    rects: Rectangle<T>[],
    options: PackOptions<T>,
  ): PackResult<T> {
    const state = createBinState(bin);
    const leftovers: T[] = [];
    for (const rect of [...rects].sort((a, b) => b.height - a.height)) {
      if (!tryPlaceInBinState(state, rect, options)) leftovers.push(rect.data);
    }
    return { placements: state.placements, leftovers };
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
