import { Rectangle } from '../geometry';
import type { Micrometres } from '../utils/units';
import type { PackOptions, PackResult, Packer } from './Packer';

/**
 * Heuristic used to score candidate placements (which free rectangle to pick).
 * - `bssf` Best Short Side Fit: minimize the shorter leftover side.
 * - `baf`  Best Area Fit: minimize leftover area.
 * - `blsf` Best Long Side Fit: minimize the longer leftover side.
 */
export type CompactFitMode = 'bssf' | 'baf' | 'blsf';

/**
 * Heuristic used to choose the split axis after placing a rectangle.
 * - `sas` Shorter Axis Split: split along the shorter leftover side, keeping
 *   the longer leftover intact.
 * - `las` Longer Axis Split: opposite of `sas`.
 * - `min-area` Pick the split that produces the larger contiguous free
 *   rectangle (lower area on the smaller fragment).
 */
export type CompactSplitMode = 'sas' | 'las' | 'min-area';

interface FreeRect {
  left: Micrometres;
  bottom: Micrometres;
  width: Micrometres;
  height: Micrometres;
}

interface CompactBinState {
  freeRects: FreeRect[];
}

interface FitCandidate<T> {
  rect: Rectangle<T>;
  freeIndex: number;
  score: number;
  tieBreakBottom: Micrometres;
  tieBreakLeft: Micrometres;
}

/**
 * Compact n-stage guillotine bin packer. Tracks free rectangles, picks
 * placements via `fitMode`, splits remainders via `splitMode`, and (when
 * `rectMerge` is on) re-fuses adjacent free rects to recover slivers.
 *
 * Layouts are strictly guillotine-cuttable but the cut sequence may zigzag
 * — pair with `TidyPacker` when shop-floor cut clarity matters.
 *
 * Reference: J. Jylänki, "A Thousand Ways to Pack the Bin"; secnot/rectpack.
 */
export function createCompactPacker<T>(
  config: {
    fitMode?: CompactFitMode;
    splitMode?: CompactSplitMode;
    rectMerge?: boolean;
  } = {},
): Packer<T> {
  const fitMode = config.fitMode ?? 'bssf';
  const splitMode = config.splitMode ?? 'sas';
  const rectMerge = config.rectMerge ?? true;

  function placeRect(
    state: CompactBinState,
    rect: Rectangle<T>,
    options: PackOptions<T>,
  ): Rectangle<T> | null {
    const candidate = pickBestPlacement(
      rect,
      state.freeRects,
      options,
      fitMode,
    );
    if (!candidate) return null;

    const free = state.freeRects[candidate.freeIndex];
    const placement = candidate.rect.clone({
      left: free.left,
      bottom: free.bottom,
    });

    const splits = splitFreeRect(free, placement, options, splitMode);
    state.freeRects.splice(candidate.freeIndex, 1, ...splits);

    if (rectMerge) mergeFreeRects(state.freeRects);

    return placement;
  }

  return {
    pack(bin, rects, options) {
      const res: PackResult<T> = { placements: [], leftovers: [] };
      const state = createInitialState(bin);

      for (const rect of rects) {
        const placement = placeRect(state, rect, options);
        if (placement) res.placements.push(placement);
        else res.leftovers.push(rect.data);
      }

      return res;
    },
    createBinState(bin) {
      return createInitialState(bin);
    },
    tryPlaceInBinState(state, rect, options) {
      return placeRect(state as CompactBinState, rect, options);
    },
  };
}

function createInitialState(bin: Rectangle<unknown>): CompactBinState {
  return {
    freeRects: [
      {
        left: bin.left,
        bottom: bin.bottom,
        width: bin.width,
        height: bin.height,
      },
    ],
  };
}

function pickBestPlacement<T>(
  rect: Rectangle<T>,
  freeRects: FreeRect[],
  options: PackOptions<T>,
  fitMode: CompactFitMode,
): FitCandidate<T> | undefined {
  let best: FitCandidate<T> | undefined;

  for (let i = 0; i < freeRects.length; i++) {
    const free = freeRects[i];
    const canRotate =
      options.allowRotations &&
      (options.canRotateRect == null || options.canRotateRect(rect.data));
    const orientations = canRotate ? [rect, rect.flipOrientation()] : [rect];

    for (const candidateRect of orientations) {
      if (
        candidateRect.width > free.width ||
        candidateRect.height > free.height
      ) {
        continue;
      }

      const leftoverW = (free.width - candidateRect.width) as Micrometres;
      const leftoverH = (free.height - candidateRect.height) as Micrometres;
      const score = scoreFit(fitMode, leftoverW, leftoverH, candidateRect);

      // Lexicographic (bottom, left) tie-break — exact integer compare.
      const ties =
        best != null &&
        (score === best.score
          ? free.bottom < best.tieBreakBottom ||
            (free.bottom === best.tieBreakBottom &&
              free.left < best.tieBreakLeft)
          : false);
      if (best == null || score < best.score || ties) {
        best = {
          rect: candidateRect,
          freeIndex: i,
          score,
          tieBreakBottom: free.bottom,
          tieBreakLeft: free.left,
        };
      }
    }
  }

  return best;
}

function scoreFit<T>(
  mode: CompactFitMode,
  leftoverW: Micrometres,
  leftoverH: Micrometres,
  rect: Rectangle<T>,
): number {
  if (mode === 'bssf') return Math.min(leftoverW, leftoverH);
  if (mode === 'blsf') return Math.max(leftoverW, leftoverH);
  // baf: leftover area, expressed in the leftover dims so we don't need
  // to thread the free rect through.
  return (
    leftoverW * leftoverH + leftoverW * rect.height + leftoverH * rect.width
  );
}

function splitFreeRect<T>(
  free: FreeRect,
  placement: Rectangle<T>,
  options: PackOptions<T>,
  splitMode: CompactSplitMode,
): FreeRect[] {
  const leftoverW = free.width - placement.width;
  const leftoverH = free.height - placement.height;
  const splitHorizontal = chooseSplitAxis(
    splitMode,
    leftoverW,
    leftoverH,
    placement,
    free,
  );

  const splits: FreeRect[] = [];

  if (splitHorizontal) {
    const rightWidth = leftoverW - options.gap;
    if (rightWidth > 0) {
      splits.push({
        left: (free.left + placement.width + options.gap) as Micrometres,
        bottom: free.bottom,
        width: rightWidth as Micrometres,
        height: placement.height,
      });
    }
    const topHeight = leftoverH - options.gap;
    if (topHeight > 0) {
      splits.push({
        left: free.left,
        bottom: (free.bottom + placement.height + options.gap) as Micrometres,
        width: free.width,
        height: topHeight as Micrometres,
      });
    }
  } else {
    const topHeight = leftoverH - options.gap;
    if (topHeight > 0) {
      splits.push({
        left: free.left,
        bottom: (free.bottom + placement.height + options.gap) as Micrometres,
        width: placement.width,
        height: topHeight as Micrometres,
      });
    }
    const rightWidth = leftoverW - options.gap;
    if (rightWidth > 0) {
      splits.push({
        left: (free.left + placement.width + options.gap) as Micrometres,
        bottom: free.bottom,
        width: rightWidth as Micrometres,
        height: free.height,
      });
    }
  }

  return splits;
}

function chooseSplitAxis<T>(
  mode: CompactSplitMode,
  leftoverW: number,
  leftoverH: number,
  placement: Rectangle<T>,
  free: FreeRect,
): boolean {
  if (mode === 'sas') return leftoverW <= leftoverH;
  if (mode === 'las') return leftoverW > leftoverH;
  const horizontalSmall = Math.min(
    leftoverW * placement.height,
    free.width * leftoverH,
  );
  const verticalSmall = Math.min(
    leftoverW * free.height,
    placement.width * leftoverH,
  );
  return horizontalSmall <= verticalSmall;
}

function mergeFreeRects(freeRects: FreeRect[]): void {
  // Merge pairs of free rects that share a full edge. With integer
  // coordinates, edges are bit-exact — no tolerance needed.
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < freeRects.length; i++) {
      const a = freeRects[i];
      for (let j = i + 1; j < freeRects.length; j++) {
        const b = freeRects[j];

        if (a.left === b.left && a.width === b.width) {
          if (a.bottom + a.height === b.bottom) {
            a.height = (a.height + b.height) as Micrometres;
            freeRects.splice(j, 1);
            merged = true;
            break outer;
          }
          if (b.bottom + b.height === a.bottom) {
            a.bottom = b.bottom;
            a.height = (a.height + b.height) as Micrometres;
            freeRects.splice(j, 1);
            merged = true;
            break outer;
          }
        }

        if (a.bottom === b.bottom && a.height === b.height) {
          if (a.left + a.width === b.left) {
            a.width = (a.width + b.width) as Micrometres;
            freeRects.splice(j, 1);
            merged = true;
            break outer;
          }
          if (b.left + b.width === a.left) {
            a.left = b.left;
            a.width = (a.width + b.width) as Micrometres;
            freeRects.splice(j, 1);
            merged = true;
            break outer;
          }
        }
      }
    }
  }
}
