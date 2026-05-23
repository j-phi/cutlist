import { rgb } from 'pdf-lib';
import { type Micrometres } from 'cutlist';
import type { Aabb, OccupancySet } from './occupancy';

/**
 * F14 — engineering dimension lines on PDF cut-outs.
 *
 * `drawPartDimensions` is PURE: it emits typed primitives (line / arrow / text
 * / leader) through the `emit` sink and never touches pdf-lib. The real render
 * path supplies an `emit` that draws to a `PDFPage`; tests supply one that
 * pushes records into arrays and assert on the recorded primitives.
 *
 * Per part it produces exactly two dimension groups — width (X axis) and
 * height (Y axis) — each = two extension lines, one (broken) dimension line,
 * two outward arrowheads, and one centered value-text. When the edge is too
 * short for legible text the text moves outside the box on a leader line.
 */

/** Fixed dimension color. Never adopts a part hue (FR-DIM-7). */
export const DIMENSION_COLOR = rgb(0.1, 0.1, 0.1);

/** Minimum legible value-text size, in points. Below this we use a leader. */
export const MIN_DIM_TEXT_PT = 5;
/** Preferred value-text size, in points. */
export const DIM_TEXT_PT = 7;
/** Padding on each side of value-text inside the dimension-line break gap. */
export const DIM_TEXT_PADDING = 2;
/** Arrowhead length, in points. */
export const DIM_ARROW_PT = 3;
/** How far the dimension line is inset from the part edge, in points. */
export const DIM_INSET_PT = 5;
/** Leader text offset from the box edge, in points. */
export const DIM_LEADER_PT = 8;

export type RgbColor = ReturnType<typeof rgb>;

export interface LinePrimitive {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  color: RgbColor;
}

export interface ArrowPrimitive {
  /** axis the arrow runs along; 'h' uses drawArrowH, 'v' uses drawArrowV. */
  axis: 'h' | 'v';
  tipX: number;
  tipY: number;
  dir: 1 | -1;
  size: number;
  color: RgbColor;
}

export interface TextPrimitive {
  text: string;
  /** lower-left origin (pdf-lib semantics; for rotated text this is the
   * rotation pivot, matching page.drawText). */
  x: number;
  y: number;
  size: number;
  /** 0 for horizontal, 90 for portrait Y-axis text. */
  rotate: 0 | 90;
  color: RgbColor;
  /** AABB the text occupies on the page, in points. */
  bbox: Aabb;
}

export interface LeaderPrimitive {
  /** dimension-line midpoint. */
  x1: number;
  y1: number;
  /** external text anchor. */
  x2: number;
  y2: number;
  thickness: number;
  color: RgbColor;
}

export interface DimensionEmit {
  line(p: LinePrimitive): void;
  arrow(p: ArrowPrimitive): void;
  text(p: TextPrimitive): void;
  leader(p: LeaderPrimitive): void;
}

export interface DimensionPart {
  leftUm: Micrometres;
  rightUm: Micrometres;
  bottomUm: Micrometres;
  topUm: Micrometres;
  /** A part hue, if any. Recorded only to prove the renderer ignores it
   * (FR-DIM-7); dimension strokes stay {@link DIMENSION_COLOR}. */
  partColor?: RgbColor;
}

export interface DimensionGeom {
  /** Part box on the page, in PDF points (lower-left origin). */
  px: number;
  py: number;
  pw: number;
  ph: number;
  /** Format a µm extent to a display string (FR-DIM-6). Renderer never
   * formats numbers itself. */
  formatSize: (um: Micrometres) => string | undefined;
  /** Deterministic text-width oracle (e.g. font.widthOfTextAtSize). */
  widthOf: (text: string, size: number) => number;
  /** Page-level occupancy set; text bboxes are tested against it and added on
   * success (FR-DIM-5). Part rects should already be added by the caller. */
  occupancy: OccupancySet;
}

/** Cap-height ≈ font size; used for text bbox height. */
function textBbox(
  rotate: 0 | 90,
  originX: number,
  originY: number,
  textW: number,
  size: number,
): Aabb {
  if (rotate === 90) {
    // 90° CCW: glyphs run up the +Y axis. The origin x is the text baseline
    // (right edge of the cap body), so the box spans [originX - size, originX]
    // in x and [originY, originY + textW] in y.
    return { x: originX - size, y: originY, w: size, h: textW };
  }
  return { x: originX, y: originY, w: textW, h: size };
}

/**
 * Compute the font size that fits the value-text alongside both arrowheads
 * within `edgeLen`, scaling down toward MIN_DIM_TEXT_PT. Returns the chosen
 * size, rendered width, gap (text + 2·padding) and whether it fits inline.
 */
function fitText(
  geom: DimensionGeom,
  label: string,
  edgeLen: number,
): { pt: number; textW: number; gap: number; fitsInline: boolean } {
  const available = edgeLen - 2 * DIM_ARROW_PT;
  let pt = DIM_TEXT_PT;
  let textW = geom.widthOf(label, pt);
  if (textW + 2 * DIM_TEXT_PADDING > available && available > 0) {
    pt = Math.max(
      MIN_DIM_TEXT_PT,
      (pt * available) / (textW + 2 * DIM_TEXT_PADDING),
    );
    textW = geom.widthOf(label, pt);
  }
  const gap = textW + 2 * DIM_TEXT_PADDING;
  const fitsInline = gap <= available && pt >= MIN_DIM_TEXT_PT;
  return { pt, textW, gap, fitsInline };
}

/**
 * Place value-text for one axis. Emits either inline (broken-line) text or a
 * leader + external text. Returns whether the dimension line should break and,
 * if so, the half-gap to leave symmetric about the midpoint.
 */
function placeAxisText(
  emit: DimensionEmit,
  geom: DimensionGeom,
  axis: 'x' | 'y',
  label: string,
  lineStart: number, // along-axis start (x for X, y for Y)
  lineEnd: number, // along-axis end
  lineOff: number, // cross-axis offset (the dimension line position)
): { broken: boolean; gapHalf: number } {
  const edgeLen = lineEnd - lineStart;
  const rotate: 0 | 90 = axis === 'y' ? 90 : 0;
  const mid = (lineStart + lineEnd) / 2;
  const fit = fitText(geom, label, edgeLen);

  if (fit.fitsInline) {
    let originX: number;
    let originY: number;
    let bbox: Aabb;
    if (axis === 'x') {
      // Center on the break gap (FR-DIM-2): text center == mid.
      originX = mid - fit.textW / 2;
      originY = lineOff + 1.5;
      bbox = textBbox(0, originX, originY, fit.textW, fit.pt);
    } else {
      // 90° CCW text centered on the gap along Y; baseline right of the line.
      originX = lineOff + fit.pt / 2;
      originY = mid - fit.textW / 2;
      bbox = textBbox(90, originX, originY, fit.textW, fit.pt);
    }
    if (!geom.occupancy.intersects(bbox)) {
      geom.occupancy.add(bbox);
      emit.text({
        text: label,
        x: originX,
        y: originY,
        size: fit.pt,
        rotate,
        color: DIMENSION_COLOR,
        bbox,
      });
      return { broken: true, gapHalf: fit.gap / 2 };
    }
    // Inline fit but the slot is taken — fall through to a leader.
  }

  tryLeader(emit, geom, axis, label, fit.pt, mid, lineOff);
  return { broken: false, gapHalf: 0 };
}

function tryLeader(
  emit: DimensionEmit,
  geom: DimensionGeom,
  axis: 'x' | 'y',
  label: string,
  pt: number,
  mid: number,
  lineOff: number,
): boolean {
  const textPt = Math.max(MIN_DIM_TEXT_PT, Math.min(pt, DIM_TEXT_PT));
  const textW = geom.widthOf(label, textPt);
  const rotate: 0 | 90 = axis === 'y' ? 90 : 0;

  // Deterministic outward search: fixed increasing offsets from the box edge.
  const steps = [
    DIM_LEADER_PT,
    DIM_LEADER_PT + textPt + 2,
    DIM_LEADER_PT + 2 * (textPt + 2),
    DIM_LEADER_PT + 3 * (textPt + 2),
  ];

  for (const step of steps) {
    let anchorX: number;
    let anchorY: number;
    let originX: number;
    let originY: number;
    let bbox: Aabb;
    if (axis === 'x') {
      anchorX = mid;
      anchorY = geom.py - step;
      originX = mid - textW / 2;
      originY = anchorY - textPt;
      bbox = textBbox(0, originX, originY, textW, textPt);
    } else {
      anchorX = geom.px - step;
      anchorY = mid;
      originX = anchorX;
      originY = mid - textW / 2;
      bbox = textBbox(90, originX + textPt / 2, originY, textW, textPt);
    }
    if (!geom.occupancy.intersects(bbox)) {
      geom.occupancy.add(bbox);
      emit.leader({
        x1: axis === 'x' ? mid : lineOff,
        y1: axis === 'x' ? lineOff : mid,
        x2: anchorX,
        y2: anchorY,
        thickness: 0.3,
        color: DIMENSION_COLOR,
      });
      emit.text({
        text: label,
        x: axis === 'x' ? originX : originX + textPt / 2,
        y: originY,
        size: textPt,
        rotate,
        color: DIMENSION_COLOR,
        bbox,
      });
      return true;
    }
  }
  // No free anchor — keep a leader stub (geometry) but suppress text (FR-DIM-5).
  emit.leader({
    x1: axis === 'x' ? mid : lineOff,
    y1: axis === 'x' ? lineOff : mid,
    x2: axis === 'x' ? mid : geom.px - DIM_LEADER_PT,
    y2: axis === 'x' ? geom.py - DIM_LEADER_PT : mid,
    thickness: 0.3,
    color: DIMENSION_COLOR,
  });
  return false;
}

/**
 * Emit the two dimension groups (width-X, height-Y) for one placed part.
 *
 * Coordinate convention: PDF points, lower-left origin. The part box is
 * `[px, px+pw] × [py, py+ph]`. The X dimension line sits just below the box
 * bottom (inset); the Y dimension line sits just left of the box (inset).
 */
export function drawPartDimensions(
  emit: DimensionEmit,
  part: DimensionPart,
  geom: DimensionGeom,
): void {
  const { px, py, pw, ph } = geom;

  const widthUm = (part.rightUm - part.leftUm) as Micrometres;
  const heightUm = (part.topUm - part.bottomUm) as Micrometres;
  const widthLabel = geom.formatSize(widthUm) ?? '';
  const heightLabel = geom.formatSize(heightUm) ?? '';

  // ---- X dimension (width): horizontal dimension line below the box. ----
  const xLineY = py - DIM_INSET_PT;
  emit.line({
    x1: px,
    y1: py,
    x2: px,
    y2: xLineY - 1,
    thickness: 0.3,
    color: DIMENSION_COLOR,
  });
  emit.line({
    x1: px + pw,
    y1: py,
    x2: px + pw,
    y2: xLineY - 1,
    thickness: 0.3,
    color: DIMENSION_COLOR,
  });
  emit.arrow({
    axis: 'h',
    tipX: px,
    tipY: xLineY,
    dir: 1,
    size: DIM_ARROW_PT,
    color: DIMENSION_COLOR,
  });
  emit.arrow({
    axis: 'h',
    tipX: px + pw,
    tipY: xLineY,
    dir: -1,
    size: DIM_ARROW_PT,
    color: DIMENSION_COLOR,
  });
  const xMid = (px + (px + pw)) / 2;
  const xText = placeAxisText(emit, geom, 'x', widthLabel, px, px + pw, xLineY);
  if (xText.broken) {
    emit.line({
      x1: px,
      y1: xLineY,
      x2: xMid - xText.gapHalf,
      y2: xLineY,
      thickness: 0.6,
      color: DIMENSION_COLOR,
    });
    emit.line({
      x1: xMid + xText.gapHalf,
      y1: xLineY,
      x2: px + pw,
      y2: xLineY,
      thickness: 0.6,
      color: DIMENSION_COLOR,
    });
  } else {
    emit.line({
      x1: px,
      y1: xLineY,
      x2: px + pw,
      y2: xLineY,
      thickness: 0.6,
      color: DIMENSION_COLOR,
    });
  }

  // ---- Y dimension (height): vertical dimension line left of the box. ----
  const yLineX = px - DIM_INSET_PT;
  emit.line({
    x1: px,
    y1: py,
    x2: yLineX - 1,
    y2: py,
    thickness: 0.3,
    color: DIMENSION_COLOR,
  });
  emit.line({
    x1: px,
    y1: py + ph,
    x2: yLineX - 1,
    y2: py + ph,
    thickness: 0.3,
    color: DIMENSION_COLOR,
  });
  emit.arrow({
    axis: 'v',
    tipX: yLineX,
    tipY: py,
    dir: 1,
    size: DIM_ARROW_PT,
    color: DIMENSION_COLOR,
  });
  emit.arrow({
    axis: 'v',
    tipX: yLineX,
    tipY: py + ph,
    dir: -1,
    size: DIM_ARROW_PT,
    color: DIMENSION_COLOR,
  });
  const yMid = (py + (py + ph)) / 2;
  const yText = placeAxisText(
    emit,
    geom,
    'y',
    heightLabel,
    py,
    py + ph,
    yLineX,
  );
  if (yText.broken) {
    emit.line({
      x1: yLineX,
      y1: py,
      x2: yLineX,
      y2: yMid - yText.gapHalf,
      thickness: 0.6,
      color: DIMENSION_COLOR,
    });
    emit.line({
      x1: yLineX,
      y1: yMid + yText.gapHalf,
      x2: yLineX,
      y2: py + ph,
      thickness: 0.6,
      color: DIMENSION_COLOR,
    });
  } else {
    emit.line({
      x1: yLineX,
      y1: py,
      x2: yLineX,
      y2: py + ph,
      thickness: 0.6,
      color: DIMENSION_COLOR,
    });
  }
}
