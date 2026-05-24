import { rgb } from 'pdf-lib';
import type { Micrometres } from 'cutlist';
import type { Aabb, OccupancySet } from './occupancy';

/**
 * F6 / FR-VIZ-1 + FR-VIZ-2 — kerf strips and leftover-region labelling on the
 * board diagram.
 *
 * Like {@link drawPartDimensions}, this module is PURE: it emits typed region
 * primitives through an `emit` sink and never touches pdf-lib. The real render
 * path supplies an `emit` that draws to a `PDFPage`; tests supply one that
 * pushes records into arrays and assert on them.
 *
 * Two visually distinct strip kinds (FR-VIZ-1):
 *   - `'kerf'`    — the blade gap consumed between two adjacent parts.
 *   - `'leftover'`— usable remainder of the board beyond the placed cluster.
 * Each is drawn with its own style token so the shop floor can tell "the saw
 * ate this" (kerf) from "you can reuse this" (leftover).
 */

export type RegionKind = 'kerf' | 'leftover';

/** Distinct fill style per region kind. The two tokens MUST differ so kerf and
 * leftover never read as the same thing (FR-VIZ-1). */
export const REGION_STYLE: Record<
  RegionKind,
  { color: ReturnType<typeof rgb>; pattern: 'solid' | 'hatch' }
> = {
  // Kerf: thin solid charcoal strip — "the blade was here".
  kerf: { color: rgb(0.35, 0.35, 0.35), pattern: 'solid' },
  // Leftover: light hatched region — "reusable offcut".
  leftover: { color: rgb(0.6, 0.78, 0.6), pattern: 'hatch' },
};

export interface RegionPrimitive {
  kind: RegionKind;
  /** Region box on the page, in PDF points (lower-left origin). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** When true, the emit layer should draw a dotted border around this region. */
  dotted?: boolean;
}

export interface RegionLabelPrimitive {
  text: string;
  /** lower-left origin (pdf-lib semantics). */
  x: number;
  y: number;
  size: number;
  color: ReturnType<typeof rgb>;
  bbox: Aabb;
}

export interface RegionEmit {
  region(p: RegionPrimitive): void;
  label(p: RegionLabelPrimitive): void;
}

/** Axis-aligned rectangle in µm board space. */
export interface UmRect {
  leftUm: number;
  rightUm: number;
  bottomUm: number;
  topUm: number;
}

export interface RegionGeom {
  /** Board's usable area in µm (margin already inset). */
  usable: UmRect;
  /** Map a board-space µm X to a page X (points). */
  toPageX: (um: number) => number;
  /** Map a board-space µm Y to a page Y (points). */
  toPageY: (um: number) => number;
  /** Format a µm extent to a display string (FR-VIZ-2). */
  formatSize: (um: Micrometres) => string | undefined;
  widthOf: (text: string, size: number) => number;
  /** Page-level occupancy set; the label bbox is tested against it and added on
   * success so it never sits on a part rect or a dimension label. */
  occupancy: OccupancySet;
  /**
   * When true (default), each leftover region gets a W×H label inside it and a
   * dotted border drawn around it. When false, no label and no dotted border.
   */
  showOffcutDimensions?: boolean;
}

const REGION_LABEL_PT = 7;
/** Minimum µm extent for a strip/region to be worth drawing. Below this it's
 * sub-pixel noise (alignment drift, integer rounding). */
const MIN_REGION_UM = 1000; // 1 mm

/**
 * Derive the leftover region(s) of the usable board area not covered by the
 * placed cluster's bounding box. Simple, testable representation: the L-shaped
 * remainder beyond the cluster bbox split into a RIGHT strip (full usable
 * height) and a TOP strip (cluster width only) so the two never overlap.
 *
 * Derives purely from the placements as they arrive (F13 already aligned them
 * at the query boundary) — does NOT re-run packing.
 */
export function deriveLeftoverRegions(
  placements: UmRect[],
  usable: UmRect,
): UmRect[] {
  if (placements.length === 0) {
    // Whole usable area is leftover.
    return rectArea(usable) > 0 ? [usable] : [];
  }
  let clusterRight = usable.leftUm;
  let clusterTop = usable.bottomUm;
  for (const p of placements) {
    if (p.rightUm > clusterRight) clusterRight = p.rightUm;
    if (p.topUm > clusterTop) clusterTop = p.topUm;
  }
  clusterRight = Math.min(clusterRight, usable.rightUm);
  clusterTop = Math.min(clusterTop, usable.topUm);

  const out: UmRect[] = [];
  // Right strip: full usable height, beyond the cluster's right edge.
  if (usable.rightUm - clusterRight >= MIN_REGION_UM) {
    out.push({
      leftUm: clusterRight,
      rightUm: usable.rightUm,
      bottomUm: usable.bottomUm,
      topUm: usable.topUm,
    });
  }
  // Top strip: cluster width only (left of clusterRight), above the cluster.
  if (
    usable.topUm - clusterTop >= MIN_REGION_UM &&
    clusterRight - usable.leftUm >= MIN_REGION_UM
  ) {
    out.push({
      leftUm: usable.leftUm,
      rightUm: clusterRight,
      bottomUm: clusterTop,
      topUm: usable.topUm,
    });
  }
  return out;
}

/**
 * Detect kerf strips: gaps between two adjacent placements whose size is
 * approximately the blade kerf. A horizontal-axis gap (parts side by side in X
 * that overlap in Y) yields a vertical kerf strip; a vertical-axis gap yields a
 * horizontal kerf strip. Returns strips in µm board space.
 *
 * Keep it simple and correct: only emit a strip for the nearest neighbour to
 * the right / above each part, and only when the gap is within tolerance of the
 * kerf. Overlapping duplicates between symmetric pairs are deduped by direction
 * (we only look right/up).
 */
export function deriveKerfStrips(
  placements: UmRect[],
  kerfUm: number,
): UmRect[] {
  if (kerfUm <= 0) return [];
  const tol = Math.max(kerfUm * 0.5, 200); // absorb alignment drift
  const strips: UmRect[] = [];

  for (let i = 0; i < placements.length; i++) {
    const a = placements[i];
    for (let j = 0; j < placements.length; j++) {
      if (i === j) continue;
      const b = placements[j];
      // b is to the RIGHT of a: gap on X, overlap on Y.
      const gapX = b.leftUm - a.rightUm;
      if (gapX > 0 && Math.abs(gapX - kerfUm) <= tol) {
        const yLo = Math.max(a.bottomUm, b.bottomUm);
        const yHi = Math.min(a.topUm, b.topUm);
        if (yHi - yLo >= MIN_REGION_UM) {
          strips.push({
            leftUm: a.rightUm,
            rightUm: b.leftUm,
            bottomUm: yLo,
            topUm: yHi,
          });
        }
      }
      // b is ABOVE a: gap on Y, overlap on X.
      const gapY = b.bottomUm - a.topUm;
      if (gapY > 0 && Math.abs(gapY - kerfUm) <= tol) {
        const xLo = Math.max(a.leftUm, b.leftUm);
        const xHi = Math.min(a.rightUm, b.rightUm);
        if (xHi - xLo >= MIN_REGION_UM) {
          strips.push({
            leftUm: xLo,
            rightUm: xHi,
            bottomUm: a.topUm,
            topUm: b.bottomUm,
          });
        }
      }
    }
  }
  return strips;
}

function rectArea(r: UmRect): number {
  return (r.rightUm - r.leftUm) * (r.topUm - r.bottomUm);
}

/**
 * Drop a trailing unit suffix from `first` when both labels share it, so a
 * region reads "400 × 600 mm" rather than "400 mm × 600 mm". The suffix is the
 * trailing run after the last digit (e.g. " mm", '"'). Returns `first`
 * untouched when the suffixes differ.
 */
function stripSharedUnit(first: string, second: string): string {
  const unitOf = (s: string) => {
    const m = /[\d.]\s*([^\d.]+)$/.exec(s);
    return m ? m[1] : '';
  };
  const u = unitOf(first);
  if (u && u === unitOf(second)) {
    return first.slice(0, first.length - u.length).trimEnd();
  }
  return first;
}

interface PageBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

function umRectToPage(r: UmRect, geom: RegionGeom): PageBox {
  const x = geom.toPageX(r.leftUm);
  const yTop = geom.toPageY(r.topUm);
  const yBot = geom.toPageY(r.bottomUm);
  const x2 = geom.toPageX(r.rightUm);
  return {
    x: Math.min(x, x2),
    y: Math.min(yTop, yBot),
    w: Math.abs(x2 - x),
    h: Math.abs(yTop - yBot),
  };
}

/**
 * Emit kerf strips + leftover regions (each with its distinct style kind) and a
 * dimension label centred in each leftover region (FR-VIZ-2). Labels go through
 * the shared occupancy set so they never collide with part / dimension text.
 */
export function drawBoardRegions(
  emit: RegionEmit,
  placements: UmRect[],
  geom: RegionGeom,
  kerfUm: number,
): void {
  // Kerf strips first (under leftover labels, but they don't overlap anyway).
  for (const s of deriveKerfStrips(placements, kerfUm)) {
    const box = umRectToPage(s, geom);
    if (box.w <= 0 || box.h <= 0) continue;
    emit.region({ kind: 'kerf', ...box });
  }

  const showDims = geom.showOffcutDimensions !== false;
  for (const r of deriveLeftoverRegions(placements, geom.usable)) {
    const box = umRectToPage(r, geom);
    if (box.w <= 0 || box.h <= 0) continue;
    emit.region({ kind: 'leftover', dotted: showDims, ...box });

    if (!showDims) continue;

    // Label with the region's dimensions: "L × W <unit>".
    const wLabel = geom.formatSize((r.rightUm - r.leftUm) as Micrometres);
    const hLabel = geom.formatSize((r.topUm - r.bottomUm) as Micrometres);
    if (!wLabel || !hLabel) continue;
    const text = `${stripSharedUnit(hLabel, wLabel)} × ${wLabel}`;
    const textW = geom.widthOf(text, REGION_LABEL_PT);
    const cx = box.x + box.w / 2;
    const cy = box.y + box.h / 2;
    const lx = cx - textW / 2;
    const ly = cy - REGION_LABEL_PT / 2;
    const bbox: Aabb = { x: lx, y: ly, w: textW, h: REGION_LABEL_PT };
    // Only label if it fits inside the region and the slot is free.
    if (textW > box.w || REGION_LABEL_PT > box.h) continue;
    if (geom.occupancy.intersects(bbox)) continue;
    geom.occupancy.add(bbox);
    emit.label({
      text,
      x: lx,
      y: ly,
      size: REGION_LABEL_PT,
      color: rgb(0.25, 0.4, 0.25),
      bbox,
    });
  }
}
