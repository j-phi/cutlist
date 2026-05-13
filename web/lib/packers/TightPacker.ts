import type { Rectangle } from '../geometry';
import { createGenericPacker } from './GenericPacker';
import type { PackOptions, Packer } from './Packer';
import { getAllPossiblePlacements, isValidPlacement } from './utils';

interface TightBinState<T> {
  bin: Rectangle<unknown>;
  placements: Rectangle<T>[];
}

export function createTightPacker<T>(): Packer<T> {
  const packer = createGenericPacker<T>({
    getPossiblePlacements: getAllPossiblePlacements,
    sortPlacements(a, b) {
      // Bottom-most first, then left-most.
      return a.y === b.y ? a.x - b.x : a.y - b.y;
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
  points.sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));

  for (const point of points) {
    const moved = rect.moveTo(point);
    const canRotate =
      options.allowRotations &&
      (options.canRotateRect == null || options.canRotateRect(moved.data));
    const candidates = canRotate ? [moved, moved.flipOrientation()] : [moved];
    for (const placement of candidates) {
      if (
        isValidPlacement(state.bin, state.placements, placement, options.gap)
      ) {
        state.placements.push(placement);
        return placement;
      }
    }
  }
  return null;
}
