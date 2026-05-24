import { type Micrometres } from 'cutlist';
import {
  DIMENSION_COLOR,
  type DimensionEmit,
  type RgbColor,
} from './dimensions';
import { OccupancySet, type Aabb } from './occupancy';

/**
 * F20 Part B — `inside` measurement mode: every placed part gets its WIDTH and
 * HEIGHT dimensioned WITH dimension lines + arrows drawn INSIDE the piece.
 *
 * To keep the two perpendicular dimensions legible they live in separate bands:
 * the width runs along a horizontal line near the bottom edge, the height along
 * a vertical line near the left edge. Their value-text therefore sits at the
 * bottom-centre (width) and left-centre (height) — far apart — while the lines
 * only cross near the bottom-left corner, away from either label.
 *
 * Crowded small pieces fall back to outside-pointing arrows; if even the
 * minimum text can't fit the line + arrows are still drawn (the extent is shown)
 * and the text is suppressed.
 *
 * Pure: emits typed primitives through {@link DimensionEmit}; text bboxes are
 * occupancy-checked so a later name label avoids them.
 */

export const INSIDE_TEXT_PT = 7;
export const INSIDE_MIN_TEXT_PT = 4.5;
export const INSIDE_ARROW_PT = 3;
export const INSIDE_TEXT_PADDING = 1.5;
const DIM_THICKNESS = 0.5;

const COLOR: RgbColor = DIMENSION_COLOR;

const clamp = (v: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, v));

export interface InsideGeom {
  /** Part box on the page, in PDF points (lower-left origin). */
  px: number;
  py: number;
  pw: number;
  ph: number;
  /** Intrinsic extents to label (NOT the page size — the real W×H in µm). */
  widthUm: Micrometres;
  heightUm: Micrometres;
  formatSize: (um: Micrometres) => string | undefined;
  widthOf: (text: string, size: number) => number;
  occupancy: OccupancySet;
}

function fit(
  geom: InsideGeom,
  label: string,
  spanLen: number,
): { pt: number; textW: number; fits: boolean } {
  const available = spanLen - 2 * INSIDE_ARROW_PT;
  let pt = INSIDE_TEXT_PT;
  let textW = geom.widthOf(label, pt);
  if (textW + 2 * INSIDE_TEXT_PADDING > available && available > 0) {
    pt = Math.max(
      INSIDE_MIN_TEXT_PT,
      (pt * available) / (textW + 2 * INSIDE_TEXT_PADDING),
    );
    textW = geom.widthOf(label, pt);
  }
  const fits =
    textW + 2 * INSIDE_TEXT_PADDING <= available && pt >= INSIDE_MIN_TEXT_PT;
  return { pt, textW, fits };
}

/**
 * Emit the horizontal width dimension inside the piece (near the bottom). Text
 * is checked against `local` only (so it dodges the height dimension's text)
 * — NOT against `geom.occupancy`, which already holds this part's own rect.
 * Drawn text is registered in both sets so a later name label avoids it too.
 */
function emitWidth(
  emit: DimensionEmit,
  geom: InsideGeom,
  local: OccupancySet,
): void {
  const { px, py, pw, ph } = geom;
  const label = geom.formatSize(geom.widthUm);
  if (!label) return;

  const sideInset = clamp(pw * 0.08, 2, 8);
  const a1 = px + sideInset;
  const a2 = px + pw - sideInset;
  if (a2 <= a1) return;
  const dimY = py + clamp(ph * 0.15, 6, 16);
  const mid = (a1 + a2) / 2;
  const f = fit(geom, label, a2 - a1);

  const drawText = (pt: number, textW: number, originY: number) => {
    const originX = mid - textW / 2;
    const bbox: Aabb = { x: originX, y: originY, w: textW, h: pt };
    if (local.intersects(bbox)) return false;
    local.add(bbox);
    geom.occupancy.add(bbox);
    emit.text({
      text: label,
      x: originX,
      y: originY,
      size: pt,
      rotate: 0,
      color: COLOR,
      bbox,
    });
    return true;
  };

  if (f.fits) {
    emit.arrow({
      axis: 'h',
      tipX: a1,
      tipY: dimY,
      dir: 1,
      size: INSIDE_ARROW_PT,
      color: COLOR,
    });
    emit.arrow({
      axis: 'h',
      tipX: a2,
      tipY: dimY,
      dir: -1,
      size: INSIDE_ARROW_PT,
      color: COLOR,
    });
    const half = f.textW / 2 + INSIDE_TEXT_PADDING;
    if (drawText(f.pt, f.textW, dimY - f.pt / 3)) {
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
    } else {
      emit.line({
        x1: a1,
        y1: dimY,
        x2: a2,
        y2: dimY,
        thickness: DIM_THICKNESS,
        color: COLOR,
      });
    }
  } else {
    // Crowded: arrows flip outside; line solid; text below if it fits at min.
    emit.arrow({
      axis: 'h',
      tipX: a1,
      tipY: dimY,
      dir: -1,
      size: INSIDE_ARROW_PT,
      color: COLOR,
    });
    emit.arrow({
      axis: 'h',
      tipX: a2,
      tipY: dimY,
      dir: 1,
      size: INSIDE_ARROW_PT,
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
    const pt = INSIDE_MIN_TEXT_PT;
    const textW = geom.widthOf(label, pt);
    const originY = dimY - pt - 1.5;
    if (originY >= py) drawText(pt, textW, originY);
  }
}

/** Emit the vertical height dimension inside the piece (near the left edge). */
function emitHeight(
  emit: DimensionEmit,
  geom: InsideGeom,
  local: OccupancySet,
): void {
  const { px, py, pw, ph } = geom;
  const label = geom.formatSize(geom.heightUm);
  if (!label) return;

  const endInset = clamp(ph * 0.08, 2, 8);
  const a1 = py + endInset;
  const a2 = py + ph - endInset;
  if (a2 <= a1) return;
  const dimX = px + clamp(pw * 0.15, 6, 16);
  const mid = (a1 + a2) / 2;
  const f = fit(geom, label, a2 - a1);

  const drawText = (pt: number, textW: number, originX: number) => {
    const originY = mid - textW / 2;
    // 90° CCW text occupies [originX - pt, originX] × [originY, originY+textW].
    const bbox: Aabb = { x: originX - pt, y: originY, w: pt, h: textW };
    if (local.intersects(bbox)) return false;
    local.add(bbox);
    geom.occupancy.add(bbox);
    emit.text({
      text: label,
      x: originX,
      y: originY,
      size: pt,
      rotate: 90,
      color: COLOR,
      bbox,
    });
    return true;
  };

  if (f.fits) {
    emit.arrow({
      axis: 'v',
      tipX: dimX,
      tipY: a1,
      dir: 1,
      size: INSIDE_ARROW_PT,
      color: COLOR,
    });
    emit.arrow({
      axis: 'v',
      tipX: dimX,
      tipY: a2,
      dir: -1,
      size: INSIDE_ARROW_PT,
      color: COLOR,
    });
    const half = f.textW / 2 + INSIDE_TEXT_PADDING;
    if (drawText(f.pt, f.textW, dimX + f.pt / 2)) {
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
    } else {
      emit.line({
        x1: dimX,
        y1: a1,
        x2: dimX,
        y2: a2,
        thickness: DIM_THICKNESS,
        color: COLOR,
      });
    }
  } else {
    emit.arrow({
      axis: 'v',
      tipX: dimX,
      tipY: a1,
      dir: -1,
      size: INSIDE_ARROW_PT,
      color: COLOR,
    });
    emit.arrow({
      axis: 'v',
      tipX: dimX,
      tipY: a2,
      dir: 1,
      size: INSIDE_ARROW_PT,
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
    const pt = INSIDE_MIN_TEXT_PT;
    const textW = geom.widthOf(label, pt);
    const originX = dimX + pt / 2;
    drawText(pt, textW, originX);
  }
}

/** Emit both interior dimensions for one placed part. */
export function drawInsidePartDimensions(
  emit: DimensionEmit,
  geom: InsideGeom,
): void {
  // Local set lets the height text dodge the width text without colliding with
  // the part's own rect (already in geom.occupancy).
  const local = new OccupancySet();
  emitWidth(emit, geom, local);
  emitHeight(emit, geom, local);
}
