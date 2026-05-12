import { Rectangle } from '../geometry';
import type { PackOptions, PackResult, Packer } from './Packer';

/**
 * Axis along which stage-1 (rip) cuts run.
 *
 * - `rip-first`: vertical strips, parts stack bottom-up (table-saw default).
 * - `crosscut-first`: horizontal strips, parts stack left-to-right (track-saw).
 */
export type TidyAxis = 'rip-first' | 'crosscut-first';

interface FreeRect {
  left: number;
  bottom: number;
  width: number;
  height: number;
}

/**
 * One rip-axis-aligned strip. Parts stack along the cross axis from
 * `cursor`. `freeRects` collects side residuals from parts narrower than
 * the strip — those gaps stay reusable for smaller parts via a stage-3
 * cut (level-with-residual relaxation).
 */
interface Strip {
  origin: number;
  span: number;
  cursor: number;
  crossSpan: number;
  freeRects: FreeRect[];
}

interface TidyBinState {
  binLeft: number;
  binBottom: number;
  binWidth: number;
  binHeight: number;
  /** Next rip-axis position for opening a new strip. */
  cursor: number;
  strips: Strip[];
}

/**
 * Two-stage guillotine packer with within-strip residual reuse and
 * multi-board lookback. Stage 1 partitions the bin into rip-axis strips
 * whose widths are set by the first part dropped into them, so parts of
 * similar widths cluster into the same column. Stage 2 stacks within each
 * strip via Best-Fit Decreasing.
 *
 * For `crosscut-first`, all input rects and the bin are transposed so the
 * same algorithm produces horizontal rows.
 *
 * References: Wu (2021) — 2SGP / 3SHP balance; Coffman et al. — FFDH/BFD
 * shelf-packing performance bounds.
 */
export function createTidyPacker<T>(
  config: { axis?: TidyAxis } = {},
): Packer<T> {
  const transpose = (config.axis ?? 'rip-first') === 'crosscut-first';

  // Transpose is involutional: same function rotates input rects on entry
  // and output rects on exit when `axis === 'crosscut-first'`.
  function maybeTranspose<U>(r: Rectangle<U>): Rectangle<U> {
    return transpose
      ? new Rectangle(r.data, r.bottom, r.left, r.height, r.width)
      : r;
  }

  function createInitialState(bin: Rectangle<unknown>): TidyBinState {
    return {
      binLeft: bin.left,
      binBottom: bin.bottom,
      binWidth: bin.width,
      binHeight: bin.height,
      cursor: bin.left,
      strips: [],
    };
  }

  /**
   * Orientations to try, in preference order. The narrower-width orientation
   * comes first; only `openNewStrip` (phase 3) reads the order, since phase 1
   * scores all orientations against all strips and picks the best side-fit
   * regardless of position.
   */
  function orientationsFor(
    rect: Rectangle<T>,
    options: PackOptions<T>,
  ): Rectangle<T>[] {
    const canRotate =
      options.allowRotations &&
      (options.canRotateRect == null || options.canRotateRect(rect.data));
    if (!canRotate) return [rect];
    const flipped = rect.flipOrientation();
    return rect.width <= flipped.width ? [rect, flipped] : [flipped, rect];
  }

  function placeOnStripStack(
    strip: Strip,
    rect: Rectangle<T>,
    options: PackOptions<T>,
  ): Rectangle<T> {
    const left = strip.origin;
    const bottom = strip.cursor;

    // Stash a side residual when this part is narrower than the strip.
    // The strip's stage-1 cut stays intact; the residual costs one extra
    // (stage-3) rip to recover later.
    const sideWaste = strip.span - rect.width;
    if (sideWaste > options.gap + options.placementEpsilon) {
      strip.freeRects.push({
        left: left + rect.width + options.gap,
        bottom,
        width: sideWaste - options.gap,
        height: rect.height,
      });
    }

    strip.cursor = bottom + rect.height + options.gap;
    return rect.clone({ left, bottom });
  }

  /** Mirror CompactPacker's SAS heuristic: split along the shorter leftover. */
  function placeInResidual(
    strip: Strip,
    residualIndex: number,
    rect: Rectangle<T>,
    options: PackOptions<T>,
  ): Rectangle<T> {
    const fr = strip.freeRects[residualIndex];
    const leftoverW = fr.width - rect.width;
    const leftoverH = fr.height - rect.height;
    const replacements: FreeRect[] = [];
    const splitHorizontal = leftoverW <= leftoverH;

    if (splitHorizontal) {
      const rightW = leftoverW - options.gap;
      if (rightW > options.placementEpsilon) {
        replacements.push({
          left: fr.left + rect.width + options.gap,
          bottom: fr.bottom,
          width: rightW,
          height: rect.height,
        });
      }
      const topH = leftoverH - options.gap;
      if (topH > options.placementEpsilon) {
        replacements.push({
          left: fr.left,
          bottom: fr.bottom + rect.height + options.gap,
          width: fr.width,
          height: topH,
        });
      }
    } else {
      const topH = leftoverH - options.gap;
      if (topH > options.placementEpsilon) {
        replacements.push({
          left: fr.left,
          bottom: fr.bottom + rect.height + options.gap,
          width: rect.width,
          height: topH,
        });
      }
      const rightW = leftoverW - options.gap;
      if (rightW > options.placementEpsilon) {
        replacements.push({
          left: fr.left + rect.width + options.gap,
          bottom: fr.bottom,
          width: rightW,
          height: fr.height,
        });
      }
    }

    strip.freeRects.splice(residualIndex, 1, ...replacements);
    return rect.clone({ left: fr.left, bottom: fr.bottom });
  }

  function openNewStrip(
    state: TidyBinState,
    rect: Rectangle<T>,
    options: PackOptions<T>,
  ): Rectangle<T> | null {
    const isFirst = state.strips.length === 0;
    const start = isFirst ? state.binLeft : state.cursor + options.gap;
    if (
      start + rect.width >
        state.binLeft + state.binWidth + options.placementEpsilon ||
      rect.height > state.binHeight + options.placementEpsilon
    ) {
      return null;
    }
    const strip: Strip = {
      origin: start,
      span: rect.width,
      cursor: state.binBottom,
      crossSpan: state.binHeight,
      freeRects: [],
    };
    state.strips.push(strip);
    state.cursor = start + rect.width;
    return placeOnStripStack(strip, rect, options);
  }

  function placeRect(
    state: TidyBinState,
    rect: Rectangle<T>,
    options: PackOptions<T>,
  ): Rectangle<T> | null {
    const orientations = orientationsFor(rect, options);

    // 1) Bottom-of-stack on an existing strip, picking the tightest side-fit
    // so columns stay narrow and similar-width parts cluster.
    let bestStripFit: {
      strip: Strip;
      oriented: Rectangle<T>;
      sideWaste: number;
    } | null = null;
    for (const oriented of orientations) {
      for (const strip of state.strips) {
        if (oriented.width > strip.span + options.placementEpsilon) continue;
        const remaining = strip.crossSpan - (strip.cursor - state.binBottom);
        if (oriented.height > remaining + options.placementEpsilon) continue;
        const sideWaste = strip.span - oriented.width;
        if (!bestStripFit || sideWaste < bestStripFit.sideWaste) {
          bestStripFit = { strip, oriented, sideWaste };
        }
      }
    }
    if (bestStripFit) {
      return placeOnStripStack(
        bestStripFit.strip,
        bestStripFit.oriented,
        options,
      );
    }

    // 2) Walk all strips' residuals before opening a new one. First-fit (vs.
    // phase 1's best-fit) — residuals are typically few and narrow, and any
    // re-scoring overhead doesn't pay back vs. the cost of opening a new
    // strip. Without this sweep, small parts that arrive late strand new boards.
    for (const oriented of orientations) {
      for (const strip of state.strips) {
        for (let i = 0; i < strip.freeRects.length; i++) {
          const fr = strip.freeRects[i];
          if (oriented.width > fr.width + options.placementEpsilon) continue;
          if (oriented.height > fr.height + options.placementEpsilon) continue;
          return placeInResidual(strip, i, oriented, options);
        }
      }
    }

    // 3) Open a new strip — first orientation that fits wins.
    for (const oriented of orientations) {
      const placement = openNewStrip(state, oriented, options);
      if (placement) return placement;
    }
    return null;
  }

  return {
    pack(bin, rects, options) {
      const state = createInitialState(maybeTranspose(bin));
      const res: PackResult<T> = { placements: [], leftovers: [] };
      for (const rect of rects) {
        const placement = placeRect(state, maybeTranspose(rect), options);
        if (placement) res.placements.push(maybeTranspose(placement));
        else res.leftovers.push(rect.data);
      }
      return res;
    },
    addToPack() {
      throw Error('Not supported');
    },
    createBinState(bin) {
      return createInitialState(maybeTranspose(bin));
    },
    tryPlaceInBinState(state, rect, options) {
      const placement = placeRect(
        state as TidyBinState,
        maybeTranspose(rect),
        options,
      );
      return placement ? maybeTranspose(placement) : null;
    },
  };
}
