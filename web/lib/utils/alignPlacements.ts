import type { SheetBoardLayoutPlacement } from '../types';
import { um, type Micrometres } from './units';

/**
 * Presentational alignment of a sheet's placed parts (F13).
 *
 * Alignment is a RIGID translation of the entire placed cluster to a chosen
 * corner of the board's usable area (the board inset by `marginUm` on every
 * edge). It is NOT a packing change: every placement moves by the same
 * per-axis delta, so guillotine cut validity, kerf gaps, and yield are all
 * preserved — only the cluster's resting corner changes.
 *
 * Coordinates are board-local with origin at the bottom-left, X to the right
 * (width) and Y upward (length), matching `SheetBoardLayoutPlacement`.
 *
 * The cluster's footprint is the bounding box over all placements. The delta
 * for each axis snaps that bounding box to the chosen edge of the usable area:
 *   - bottom -> min(bottomUm) === marginUm
 *   - top    -> max(topUm)    === lengthUm − marginUm
 *   - left   -> min(leftUm)   === marginUm
 *   - right  -> max(rightUm)  === widthUm  − marginUm
 *
 * Clamp (FR-ALN-6): when the cluster already spans the full usable dimension
 * on an axis (or overflows it), the computed delta would push parts off the
 * board, so the delta on that axis is forced to 0. This means a layout whose
 * parts already fill the board is unaffected by alignment.
 */
export function alignPlacements(
  placements: SheetBoardLayoutPlacement[],
  widthUm: Micrometres,
  lengthUm: Micrometres,
  marginUm: Micrometres,
  alignH: 'left' | 'right',
  alignV: 'top' | 'bottom',
): SheetBoardLayoutPlacement[] {
  if (placements.length === 0) return placements;

  // Cluster bounding box.
  let minLeft = Infinity;
  let maxRight = -Infinity;
  let minBottom = Infinity;
  let maxTop = -Infinity;
  for (const p of placements) {
    if (p.leftUm < minLeft) minLeft = p.leftUm;
    if (p.rightUm > maxRight) maxRight = p.rightUm;
    if (p.bottomUm < minBottom) minBottom = p.bottomUm;
    if (p.topUm > maxTop) maxTop = p.topUm;
  }

  // Usable area edges.
  const usableLeft = marginUm;
  const usableRight = widthUm - marginUm;
  const usableBottom = marginUm;
  const usableTop = lengthUm - marginUm;

  // Per-axis target for the cluster's leading edge, then the delta.
  const dx = alignH === 'left' ? usableLeft - minLeft : usableRight - maxRight;
  const dy =
    alignV === 'bottom' ? usableBottom - minBottom : usableTop - maxTop;

  // Clamp: no slack on an axis -> no translation (avoids overflow).
  // Left/bottom alignment pulls toward the origin (delta should be ≥ 0 worth
  // of travel only when there is room); right/top pushes away. In all cases,
  // if the cluster already spans the full usable dimension the available
  // travel is ≤ 0 in the alignment direction, so we zero it out.
  const clusterWidth = maxRight - minLeft;
  const clusterHeight = maxTop - minBottom;
  const usableWidth = usableRight - usableLeft;
  const usableHeight = usableTop - usableBottom;

  const dxApplied = clusterWidth >= usableWidth ? 0 : dx;
  const dyApplied = clusterHeight >= usableHeight ? 0 : dy;

  if (dxApplied === 0 && dyApplied === 0) return placements;

  return placements.map((p) => ({
    ...p,
    leftUm: um(p.leftUm + dxApplied),
    rightUm: um(p.rightUm + dxApplied),
    bottomUm: um(p.bottomUm + dyApplied),
    topUm: um(p.topUm + dyApplied),
  }));
}
