/**
 * Per-page occupancy set of axis-aligned bounding boxes (AABBs), in PDF
 * points. A label placement consults this to avoid drawing value-text over an
 * already-claimed region (another part rect, another label's bbox, etc.).
 *
 * Designed to be shared: F14 (dimension value-text) seeds it, and F6 (leftover
 * labels) / F20 (unified labels) reuse the same structure so every text
 * placement on a page competes for the same space. Keep it tiny and pure —
 * just `add` + `intersects` over a flat list. Page counts are small (parts per
 * tile), so linear scan is fine; no spatial index needed.
 */

export interface Aabb {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Two AABBs overlap iff they overlap on both axes. Touching edges (shared
 * boundary, zero-area overlap) do NOT count as intersecting. */
export function aabbIntersects(a: Aabb, b: Aabb): boolean {
  return (
    a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y
  );
}

export class OccupancySet {
  private readonly rects: Aabb[] = [];

  /** Record a claimed region. */
  add(rect: Aabb): void {
    this.rects.push({ ...rect });
  }

  /** True if `rect` overlaps any already-claimed region. */
  intersects(rect: Aabb): boolean {
    for (const r of this.rects) {
      if (aabbIntersects(rect, r)) return true;
    }
    return false;
  }

  /** Number of claimed regions (test/debug aid). */
  get size(): number {
    return this.rects.length;
  }
}
