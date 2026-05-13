import type { Point, Rectangle } from '../geometry';
import type { PackOptions, PackResult, Packer } from './Packer';
import { isValidPlacement } from './utils';
import type { Micrometres } from '../utils/units';

/**
 * Building block for packers that share the `pack` walk. Callers
 * (e.g. `TightPacker`) supply the bin-state methods to complete the
 * `Packer<T>` contract.
 */
export type GenericPackerCore<T> = Pick<Packer<T>, 'pack'>;

export function createGenericPacker<T>({
  sortPlacements,
  getPossiblePlacements,
}: {
  sortPlacements?: (a: Point, b: Point, options: PackOptions<T>) => number;
  getPossiblePlacements: (
    bin: Rectangle<unknown>,
    placements: Rectangle<T>[],
    gap: Micrometres,
  ) => Point[];
}): GenericPackerCore<T> {
  return {
    pack(bin, rects, options) {
      const res: PackResult<T> = { leftovers: [], placements: [] };
      for (const rect of rects) {
        const possiblePoints = getPossiblePlacements(
          bin,
          res.placements,
          options.gap,
        );
        if (sortPlacements)
          possiblePoints.sort((a, b) => sortPlacements(a, b, options));
        const possiblePlacements = possiblePoints.flatMap((point) => {
          const moved = rect.moveTo(point);
          const canRotate =
            options.allowRotations &&
            (options.canRotateRect == null ||
              options.canRotateRect(moved.data));
          if (canRotate) return [moved, moved.flipOrientation()];
          return [moved];
        });

        const valid = possiblePlacements.find((placement) =>
          isValidPlacement(bin, res.placements, placement, options.gap),
        );
        if (valid) res.placements.push(valid);
        else res.leftovers.push(rect.data);
      }
      return res;
    },
  };
}
