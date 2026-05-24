import { type Micrometres } from 'cutlist';
import { MM } from './constants';
import {
  DIMENSION_COLOR,
  type DimensionEmit,
  type RgbColor,
} from './dimensions';

/**
 * F20 Part B — `outside` measurement mode: waterfall / stacked dimensioning.
 *
 * Every placed part's WIDTH and HEIGHT is dimensioned in the margin OUTSIDE the
 * board outline (widths below, heights to the left), so the piece faces stay
 * clean. Pieces that share an extent (a column of equal-width parts, a row of
 * equal-height parts) collapse to ONE dimension. Overlapping / nested extents
 * stack outward at increasing offsets — the classic engineering "waterfall":
 *
 *   - Smallest extent sits CLOSEST to the object; the largest sits furthest
 *     out, so dimension lines never cross (drafting Best Practice 9).
 *   - First dimension line ~1/2" (12.7 mm) off the object; each stacked line
 *     ~3/8" (9.6 mm) beyond the previous (Best Practice 25).
 *   - Extension lines start ~1/16" (1.6 mm) off the object and overshoot the
 *     dimension line by ~1/8" (3.2 mm); they may cross without a break (BP 14).
 *   - When a value won't fit between its extension lines the arrows flip to the
 *     outside and the text moves clear of the gap (crowded-condition handling).
 *
 * Like {@link drawPartDimensions} this module is PURE: it emits typed
 * primitives through a {@link DimensionEmit} sink and never touches pdf-lib.
 */

/** BP14 — gap between the object outline and the start of an extension line. */
export const OUT_EXT_GAP_PT = 1.6 * MM;
/** BP14 — how far an extension line overshoots past the dimension line. */
export const OUT_EXT_OVERSHOOT_PT = 3.2 * MM;
/** BP25 — offset of the innermost (level-0) dimension line from the object. */
export const OUT_FIRST_GAP_PT = 12.7 * MM;
/** BP25 — spacing between successive stacked dimension lines. */
export const OUT_LEVEL_STEP_PT = 9.6 * MM;
/** Preferred / minimum value-text size, in points. */
export const OUT_TEXT_PT = 7;
export const OUT_MIN_TEXT_PT = 5;
/** Arrowhead length, in points. */
export const OUT_ARROW_PT = 3;
/** Padding either side of inline value-text inside the dimension-line break. */
export const OUT_TEXT_PADDING = 2;
/** Extension-line stroke weight (fine, per BP14). */
const EXT_THICKNESS = 0.3;
/** Dimension-line stroke weight. */
const DIM_THICKNESS = 0.6;

export interface Span {
  /** Extent start along the measured axis, in µm (board space). */
  startUm: number;
  /** Extent end along the measured axis, in µm. */
  endUm: number;
}

export interface LeveledSpan extends Span {
  /** Stack offset: 0 = closest to the object, increasing outward. */
  level: number;
}

export interface OutsidePlacementExtent {
  leftUm: Micrometres;
  rightUm: Micrometres;
  bottomUm: Micrometres;
  topUm: Micrometres;
}

/**
 * Assign waterfall levels to a set of 1-D extents. Identical extents collapse
 * to one. Shorter extents are placed on lower levels (closer to the object) so
 * that a containing extent always lands strictly outside everything it
 * contains — dimension lines therefore never cross (BP 9).
 *
 * Two extents may share a level iff they don't overlap; abutting extents
 * (shared endpoint) are NOT an overlap, so a clean row of adjacent parts forms
 * a single chain on level 0.
 */
export function assignWaterfallLevels(spans: Span[]): LeveledSpan[] {
  // Collapse exact-duplicate extents (a column of equal-width parts, etc.).
  const seen = new Set<string>();
  const uniq: Span[] = [];
  for (const s of spans) {
    if (s.endUm <= s.startUm) continue;
    const key = `${s.startUm}:${s.endUm}`;
    if (seen.has(key)) continue;
    seen.add(key);
    uniq.push({ startUm: s.startUm, endUm: s.endUm });
  }

  // Shortest first; ties broken by start so the layout is deterministic.
  uniq.sort(
    (a, b) =>
      a.endUm - a.startUm - (b.endUm - b.startUm) || a.startUm - b.startUm,
  );

  const levels: Span[][] = [];
  const out: LeveledSpan[] = [];
  for (const s of uniq) {
    let level = 0;
    for (;;) {
      const occupied = levels[level] ?? (levels[level] = []);
      const overlaps = occupied.some(
        (o) => s.startUm < o.endUm && o.startUm < s.endUm,
      );
      if (!overlaps) {
        occupied.push(s);
        break;
      }
      level++;
    }
    out.push({ ...s, level });
  }
  return out;
}

export interface OutsideWaterfallPlan {
  width: LeveledSpan[];
  height: LeveledSpan[];
  widthLevelCount: number;
  heightLevelCount: number;
}

/**
 * Pure planning step — derives the leveled width / height extents from a set of
 * placements. The level counts are scale-independent (they depend only on µm
 * overlap), so the caller can size the annotation margin BEFORE choosing a
 * board scale and reuse the same plan for rendering.
 */
export function planOutsideWaterfall(
  placements: OutsidePlacementExtent[],
): OutsideWaterfallPlan {
  const width = assignWaterfallLevels(
    placements.map((p) => ({ startUm: p.leftUm, endUm: p.rightUm })),
  );
  const height = assignWaterfallLevels(
    placements.map((p) => ({ startUm: p.bottomUm, endUm: p.topUm })),
  );
  const levelCount = (s: LeveledSpan[]) =>
    s.reduce((m, x) => Math.max(m, x.level + 1), 0);
  return {
    width,
    height,
    widthLevelCount: levelCount(width),
    heightLevelCount: levelCount(height),
  };
}

/** Distance (pt) from the object edge to the dimension line at `level`. */
export function levelOffsetPt(level: number): number {
  return OUT_FIRST_GAP_PT + level * OUT_LEVEL_STEP_PT;
}

/**
 * Total margin (pt) the waterfall needs beyond the object edge: the outermost
 * dimension line + its extension overshoot + room for value-text. `0` when
 * there are no levels.
 */
export function waterfallStripPt(levelCount: number): number {
  if (levelCount <= 0) return 0;
  return (
    levelOffsetPt(levelCount - 1) +
    OUT_EXT_OVERSHOOT_PT +
    OUT_TEXT_PT +
    OUT_TEXT_PADDING
  );
}

export interface OutsideGeom {
  /** Board outline on the page, in PDF points (lower-left origin). */
  boardX: number;
  boardY: number;
  boardWpt: number;
  boardHpt: number;
  /** Map a board-space µm X / Y to a page-point X / Y. */
  toPageX: (um: number) => number;
  toPageY: (um: number) => number;
  plan: OutsideWaterfallPlan;
  formatSize: (um: Micrometres) => string | undefined;
  widthOf: (text: string, size: number) => number;
}

/** Fit the value-text between the extension lines, shrinking toward the min. */
function fitInline(
  geom: OutsideGeom,
  label: string,
  spanLen: number,
): { pt: number; textW: number; fits: boolean } {
  const available = spanLen - 2 * OUT_ARROW_PT;
  let pt = OUT_TEXT_PT;
  let textW = geom.widthOf(label, pt);
  if (textW + 2 * OUT_TEXT_PADDING > available && available > 0) {
    pt = Math.max(
      OUT_MIN_TEXT_PT,
      (pt * available) / (textW + 2 * OUT_TEXT_PADDING),
    );
    textW = geom.widthOf(label, pt);
  }
  const fits =
    textW + 2 * OUT_TEXT_PADDING <= available && pt >= OUT_MIN_TEXT_PT;
  return { pt, textW, fits };
}

const COLOR: RgbColor = DIMENSION_COLOR;

/**
 * Emit one width dimension (horizontal extent, drawn below the board).
 * `a1`/`a2` are the page-X endpoints; `dimY` is the dimension-line height.
 */
function emitWidthDim(
  emit: DimensionEmit,
  geom: OutsideGeom,
  a1: number,
  a2: number,
  dimY: number,
  label: string,
): void {
  const extTop = geom.boardY - OUT_EXT_GAP_PT;
  const extBottom = dimY - OUT_EXT_OVERSHOOT_PT;
  // Extension lines (fine), from just off the board down past the dim line.
  emit.line({
    x1: a1,
    y1: extTop,
    x2: a1,
    y2: extBottom,
    thickness: EXT_THICKNESS,
    color: COLOR,
  });
  emit.line({
    x1: a2,
    y1: extTop,
    x2: a2,
    y2: extBottom,
    thickness: EXT_THICKNESS,
    color: COLOR,
  });

  const mid = (a1 + a2) / 2;
  const fit = fitInline(geom, label, a2 - a1);

  if (fit.fits) {
    // Standard: outward arrows touching the extension lines, text breaking the
    // dimension line, centred on the span.
    emit.arrow({
      axis: 'h',
      tipX: a1,
      tipY: dimY,
      dir: 1,
      size: OUT_ARROW_PT,
      color: COLOR,
    });
    emit.arrow({
      axis: 'h',
      tipX: a2,
      tipY: dimY,
      dir: -1,
      size: OUT_ARROW_PT,
      color: COLOR,
    });
    const half = fit.textW / 2 + OUT_TEXT_PADDING;
    emit.line({
      x1: a1,
      y1: dimY,
      x2: mid - half,
      y2: dimY,
      thickness: DIM_THICKNESS,
      color: COLOR,
    });
    emit.line({
      x1: mid + half,
      y1: dimY,
      x2: a2,
      y2: dimY,
      thickness: DIM_THICKNESS,
      color: COLOR,
    });
    const originX = mid - fit.textW / 2;
    const originY = dimY - fit.pt / 3;
    emit.text({
      text: label,
      x: originX,
      y: originY,
      size: fit.pt,
      rotate: 0,
      color: COLOR,
      bbox: { x: originX, y: originY, w: fit.textW, h: fit.pt },
    });
  } else {
    // Crowded: flip arrows to the outside, solid dimension line, text below.
    emit.arrow({
      axis: 'h',
      tipX: a1,
      tipY: dimY,
      dir: -1,
      size: OUT_ARROW_PT,
      color: COLOR,
    });
    emit.arrow({
      axis: 'h',
      tipX: a2,
      tipY: dimY,
      dir: 1,
      size: OUT_ARROW_PT,
      color: COLOR,
    });
    emit.line({
      x1: a1,
      y1: dimY,
      x2: a2,
      y2: dimY,
      thickness: DIM_THICKNESS,
      color: COLOR,
    });
    const pt = OUT_MIN_TEXT_PT;
    const textW = geom.widthOf(label, pt);
    const originX = mid - textW / 2;
    const originY = dimY - pt - 2;
    emit.text({
      text: label,
      x: originX,
      y: originY,
      size: pt,
      rotate: 0,
      color: COLOR,
      bbox: { x: originX, y: originY, w: textW, h: pt },
    });
  }
}

/**
 * Emit one height dimension (vertical extent, drawn left of the board).
 * `a1`/`a2` are the page-Y endpoints; `dimX` is the dimension-line position.
 */
function emitHeightDim(
  emit: DimensionEmit,
  geom: OutsideGeom,
  a1: number,
  a2: number,
  dimX: number,
  label: string,
): void {
  const extRight = geom.boardX - OUT_EXT_GAP_PT;
  const extLeft = dimX - OUT_EXT_OVERSHOOT_PT;
  emit.line({
    x1: extRight,
    y1: a1,
    x2: extLeft,
    y2: a1,
    thickness: EXT_THICKNESS,
    color: COLOR,
  });
  emit.line({
    x1: extRight,
    y1: a2,
    x2: extLeft,
    y2: a2,
    thickness: EXT_THICKNESS,
    color: COLOR,
  });

  const mid = (a1 + a2) / 2;
  const fit = fitInline(geom, label, a2 - a1);

  if (fit.fits) {
    emit.arrow({
      axis: 'v',
      tipX: dimX,
      tipY: a1,
      dir: 1,
      size: OUT_ARROW_PT,
      color: COLOR,
    });
    emit.arrow({
      axis: 'v',
      tipX: dimX,
      tipY: a2,
      dir: -1,
      size: OUT_ARROW_PT,
      color: COLOR,
    });
    const half = fit.textW / 2 + OUT_TEXT_PADDING;
    emit.line({
      x1: dimX,
      y1: a1,
      x2: dimX,
      y2: mid - half,
      thickness: DIM_THICKNESS,
      color: COLOR,
    });
    emit.line({
      x1: dimX,
      y1: mid + half,
      x2: dimX,
      y2: a2,
      thickness: DIM_THICKNESS,
      color: COLOR,
    });
    // 90° CCW text: baseline just right of the line, centred on the gap.
    const originX = dimX + fit.pt / 2;
    const originY = mid - fit.textW / 2;
    emit.text({
      text: label,
      x: originX,
      y: originY,
      size: fit.pt,
      rotate: 90,
      color: COLOR,
      bbox: { x: originX - fit.pt, y: originY, w: fit.pt, h: fit.textW },
    });
  } else {
    emit.arrow({
      axis: 'v',
      tipX: dimX,
      tipY: a1,
      dir: -1,
      size: OUT_ARROW_PT,
      color: COLOR,
    });
    emit.arrow({
      axis: 'v',
      tipX: dimX,
      tipY: a2,
      dir: 1,
      size: OUT_ARROW_PT,
      color: COLOR,
    });
    emit.line({
      x1: dimX,
      y1: a1,
      x2: dimX,
      y2: a2,
      thickness: DIM_THICKNESS,
      color: COLOR,
    });
    const pt = OUT_MIN_TEXT_PT;
    const textW = geom.widthOf(label, pt);
    const originX = dimX - pt - 2;
    const originY = mid - textW / 2;
    emit.text({
      text: label,
      x: originX,
      y: originY,
      size: pt,
      rotate: 90,
      color: COLOR,
      bbox: { x: originX - pt, y: originY, w: pt, h: textW },
    });
  }
}

/**
 * Render the full waterfall for one board: every distinct width extent below
 * the board and every distinct height extent to its left, each at its assigned
 * stack level.
 */
export function drawOutsideWaterfall(
  emit: DimensionEmit,
  geom: OutsideGeom,
): void {
  for (const s of geom.plan.width) {
    const a1 = geom.toPageX(s.startUm);
    const a2 = geom.toPageX(s.endUm);
    if (a2 <= a1) continue;
    const dimY = geom.boardY - levelOffsetPt(s.level);
    const label = geom.formatSize((s.endUm - s.startUm) as Micrometres);
    if (!label) continue;
    emitWidthDim(emit, geom, a1, a2, dimY, label);
  }
  for (const s of geom.plan.height) {
    const a1 = geom.toPageY(s.startUm);
    const a2 = geom.toPageY(s.endUm);
    if (a2 <= a1) continue;
    const dimX = geom.boardX - levelOffsetPt(s.level);
    const label = geom.formatSize((s.endUm - s.startUm) as Micrometres);
    if (!label) continue;
    emitHeightDim(emit, geom, a1, a2, dimX, label);
  }
}
