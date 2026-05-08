import { isNearlyEqual, type Rectangle } from '../geometry';
import { createGenericPacker } from './GenericPacker';
import type { PackOptions, Packer } from './Packer';
import { getAllPossiblePlacements, isValidPlacement } from './utils';

/**
 * Per-bin state for `tryPlaceInBinState`. The tight packer doesn't track
 * free rects — possible placements are derived from the existing placements
 * each call, so all we need is the bin and an accumulating placement list.
 */
interface TightBinState<T> {
  bin: Rectangle<unknown>;
  placements: Rectangle<T>[];
}

export function createTightPacker<T>(): Packer<T> {
  const packer = createGenericPacker<T>({
    getPossiblePlacements: getAllPossiblePlacements,
    sortPlacements(a, b, options) {
      // sort bottom most first, leftmost second
      if (!isNearlyEqual(a.y, b.y, options.precision)) return a.y - b.y;
      return a.x - b.x;
    },
  });

  return {
    ...packer,
    createBinState(bin) {
      return { bin, placements: [] } satisfies TightBinState<T>;
    },
    tryPlaceInBinState(rawState, rect, options) {
      const state = rawState as TightBinState<T>;
      return tryPlaceInTightState(state, rect, options);
    },
  };
}

function tryPlaceInTightState<T>(
  state: TightBinState<T>,
  rect: Rectangle<T>,
  options: PackOptions<T>,
): Rectangle<T> | null {
  const points = getAllPossiblePlacements(
    state.bin,
    state.placements,
    options.gap,
  );
  // Match the sortPlacements above so single-rect placement is consistent
  // with batch packing.
  points.sort((a, b) =>
    isNearlyEqual(a.y, b.y, options.precision) ? a.x - b.x : a.y - b.y,
  );

  for (const point of points) {
    const moved = rect.moveTo(point);
    const canRotate =
      options.allowRotations &&
      (options.canRotateRect == null || options.canRotateRect(moved.data));
    const candidates = canRotate ? [moved, moved.flipOrientation()] : [moved];
    for (const placement of candidates) {
      if (
        isValidPlacement(
          state.bin,
          state.placements,
          placement,
          options.precision,
          options.gap,
        )
      ) {
        state.placements.push(placement);
        return placement;
      }
    }
  }
  return null;
}
