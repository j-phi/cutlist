/**
 * Drag-to-multiselect (marquee) state machine and screen-space hit test.
 *
 * `InputRouter` forwards pointer events to `begin/update/end`. For each
 * registered Object the selector projects the 8 corners of its local AABB
 * through `offsetMatrix · originalMatrix` (so live Object poses are
 * honoured), and tests the resulting screen-space silhouette against the
 * marquee. Candidate ids land on the bus and `useThreeViewer` composes
 * them with the baseline selection (replace, or XOR when Shift was held
 * at drag-start).
 *
 * Direction follows the AutoCAD/OnShape convention: drag L→R = "window"
 * (Object's projected bounds must be fully contained in the marquee), drag
 * R→L = "crossing" (any overlap qualifies). Mode flips reactively as the
 * user crosses the start-X line mid-drag.
 *
 * Hit-test geometry — why this is more than a screen-AABB check:
 *
 *   The screen-aligned bounding rectangle of the eight projected corners
 *   matches the silhouette only when the OBB happens to be aligned with
 *   the camera. At any other angle (any iso view, every rotated part) the
 *   screen-AABB envelope is strictly larger than the silhouette and a
 *   crossing marquee will pick up parts the cursor isn't visibly over.
 *
 *   For window mode the AABB test is exact: "all eight corners inside the
 *   marquee" ↔ "screen-AABB inside the marquee" ↔ "silhouette inside the
 *   marquee" (silhouette ⊆ AABB).
 *
 *   For crossing mode we need silhouette-vs-rectangle overlap. SAT on the
 *   projected OBB edges gives that exactly: the rectangle's two axes plus
 *   each of the twelve OBB edges' projected normals. The screen-AABB test
 *   stays as a cheap pre-filter (it IS the SAT test on the rectangle's
 *   own axes) — only objects that pass it run the full SAT.
 */

import type { EventBus } from './EventBus';
import type { ObjectRegistry } from './ObjectRegistry';
import type { MarqueeRect, ObjectId, ViewerEvent } from '../types';

type Camera = import('three').Camera;
type Vector3 = import('three').Vector3;

interface MarqueeDeps {
  THREE: typeof import('three');
  bus: EventBus<ViewerEvent>;
  registry: ObjectRegistry;
  camera: () => Camera;
  /** Live canvas client rect for converting client coords to canvas-local. */
  screenRect: () => DOMRect;
  /** Returns true if the Object's batch instance is currently visible. */
  isObjectVisible: (id: ObjectId) => boolean;
}

interface DragState {
  startCanvas: { x: number; y: number };
  currentCanvas: { x: number; y: number };
  shiftKey: boolean;
  baseline: ObjectId[];
}

/**
 * Index pairs of the twelve OBB edges in our 8-corner enumeration
 * (corners indexed by bit: bit 0 = X, bit 1 = Y, bit 2 = Z; bit set
 * picks `max`, clear picks `min`). Pairs differ in exactly one bit.
 */
const OBB_EDGES: ReadonlyArray<readonly [number, number]> = [
  // X-axis edges (vary bit 0).
  [0, 1],
  [2, 3],
  [4, 5],
  [6, 7],
  // Y-axis edges (vary bit 1).
  [0, 2],
  [1, 3],
  [4, 6],
  [5, 7],
  // Z-axis edges (vary bit 2).
  [0, 4],
  [1, 5],
  [2, 6],
  [3, 7],
];

export class MarqueeSelector {
  private state: DragState | null = null;
  private readonly composed: import('three').Matrix4;
  private readonly corner: Vector3;
  private readonly viewSample: Vector3;
  // Screen-space corners reused across each Object's hit test.
  private readonly screenCorners: { x: number; y: number }[] = Array.from(
    { length: 8 },
    () => ({ x: 0, y: 0 }),
  );

  constructor(private deps: MarqueeDeps) {
    const { THREE } = deps;
    this.composed = new THREE.Matrix4();
    this.corner = new THREE.Vector3();
    this.viewSample = new THREE.Vector3();
  }

  isActive(): boolean {
    return this.state !== null;
  }

  begin(
    clientX: number,
    clientY: number,
    shiftKey: boolean,
    baseline: ObjectId[],
  ): void {
    const rect = this.deps.screenRect();
    const start = { x: clientX - rect.left, y: clientY - rect.top };
    this.state = {
      startCanvas: start,
      currentCanvas: { ...start },
      shiftKey,
      baseline: [...baseline],
    };
    this.deps.bus.emit({ type: 'marquee-start', shiftKey, baseline });
  }

  update(clientX: number, clientY: number): void {
    if (!this.state) return;
    const rect = this.deps.screenRect();
    this.state.currentCanvas = {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
    const marquee = this.computeRect();
    const candidates = this.computeCandidates(marquee);
    this.deps.bus.emit({
      type: 'marquee-update',
      rect: marquee,
      candidates,
      shiftKey: this.state.shiftKey,
      baseline: this.state.baseline,
    });
  }

  end(committed: boolean): void {
    if (!this.state) return;
    const marquee = this.computeRect();
    const candidates = committed ? this.computeCandidates(marquee) : [];
    this.deps.bus.emit({
      type: 'marquee-end',
      committed,
      candidates,
      shiftKey: this.state.shiftKey,
      baseline: this.state.baseline,
    });
    this.state = null;
  }

  /** Visible for tests. */
  computeRect(): MarqueeRect {
    const s = this.state;
    if (!s) return { x: 0, y: 0, w: 0, h: 0, mode: 'window' };
    const x = Math.min(s.startCanvas.x, s.currentCanvas.x);
    const y = Math.min(s.startCanvas.y, s.currentCanvas.y);
    const w = Math.abs(s.currentCanvas.x - s.startCanvas.x);
    const h = Math.abs(s.currentCanvas.y - s.startCanvas.y);
    const mode: 'window' | 'crossing' =
      s.currentCanvas.x >= s.startCanvas.x ? 'window' : 'crossing';
    return { x, y, w, h, mode };
  }

  private computeCandidates(marquee: MarqueeRect): ObjectId[] {
    const out: ObjectId[] = [];
    const camera = this.deps.camera();
    const screenRect = this.deps.screenRect();
    if (screenRect.width === 0 || screenRect.height === 0) return out;

    camera.updateMatrixWorld();

    this.deps.registry.forEach((r) => {
      if (!this.deps.isObjectVisible(r.groupId)) return;

      // World-space transform = offsetMatrix · originalMatrix.
      this.composed.multiplyMatrices(r.offsetMatrix, r.originalMatrix);

      const min = r.boundsLocalMin;
      const max = r.boundsLocalMax;
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      let allInFront = true;
      for (let i = 0; i < 8; i++) {
        this.corner.set(
          (i & 1) === 0 ? min.x : max.x,
          (i & 2) === 0 ? min.y : max.y,
          (i & 4) === 0 ? min.z : max.z,
        );
        this.corner.applyMatrix4(this.composed);
        this.viewSample
          .copy(this.corner)
          .applyMatrix4(camera.matrixWorldInverse);
        if (this.viewSample.z > -1e-4) {
          allInFront = false;
          continue;
        }
        this.corner.project(camera);
        const sx = (this.corner.x * 0.5 + 0.5) * screenRect.width;
        const sy = (-this.corner.y * 0.5 + 0.5) * screenRect.height;
        this.screenCorners[i].x = sx;
        this.screenCorners[i].y = sy;
        if (sx < minX) minX = sx;
        if (sx > maxX) maxX = sx;
        if (sy < minY) minY = sy;
        if (sy > maxY) maxY = sy;
      }

      if (
        !Number.isFinite(minX) ||
        !Number.isFinite(minY) ||
        !Number.isFinite(maxX) ||
        !Number.isFinite(maxY)
      )
        return;

      const rectMaxX = marquee.x + marquee.w;
      const rectMaxY = marquee.y + marquee.h;

      if (marquee.mode === 'window') {
        // Window mode: silhouette ⊆ marquee. With silhouette ⊆ screen-AABB,
        // the screen-AABB inside the marquee proves containment; no SAT
        // needed. Behind-camera corners disqualify the Object outright.
        if (!allInFront) return;
        if (
          minX >= marquee.x &&
          minY >= marquee.y &&
          maxX <= rectMaxX &&
          maxY <= rectMaxY
        ) {
          out.push(r.groupId);
        }
        return;
      }

      // Crossing mode. Quick reject on the screen-AABB (the SAT test
      // against the rectangle's own axes) before the OBB-edge SAT pass.
      if (
        maxX < marquee.x ||
        minX > rectMaxX ||
        maxY < marquee.y ||
        minY > rectMaxY
      )
        return;

      // When some corners are behind the camera the projected coordinates
      // are unreliable; fall back to the AABB-only result rather than
      // running SAT on bad data.
      if (!allInFront) {
        out.push(r.groupId);
        return;
      }

      if (silhouetteOverlapsRect(this.screenCorners, marquee)) {
        out.push(r.groupId);
      }
    });

    return out;
  }
}

/**
 * SAT overlap test between an axis-aligned rectangle and the convex
 * silhouette of a projected OBB. The rectangle's own two axes are already
 * covered by the screen-AABB pre-filter — here we test the twelve OBB
 * edges' projected normals as additional separating-axis candidates.
 *
 * Some of those normals are silhouette-interior edges (they don't bound
 * the convex hull), but extra SAT axes can never produce a false negative
 * so we don't bother computing the actual hull.
 *
 * The axes are deliberately left unnormalised — interval *overlap* is
 * scale-invariant under a positive multiplier, so `Math.hypot` + two
 * divides per edge would be wasted work.
 */
function silhouetteOverlapsRect(
  corners: ReadonlyArray<{ x: number; y: number }>,
  rect: MarqueeRect,
): boolean {
  const rectMaxX = rect.x + rect.w;
  const rectMaxY = rect.y + rect.h;
  for (const [ai, bi] of OBB_EDGES) {
    const a = corners[ai];
    const b = corners[bi];
    const ux = -(b.y - a.y);
    const uy = b.x - a.x;
    if (ux * ux + uy * uy < 1e-18) continue; // edge collapsed in projection

    // Polygon (8 corners) projection onto the axis.
    let polyMin = Infinity;
    let polyMax = -Infinity;
    for (let i = 0; i < 8; i++) {
      const p = corners[i].x * ux + corners[i].y * uy;
      if (p < polyMin) polyMin = p;
      if (p > polyMax) polyMax = p;
    }

    // Rectangle projection (4 corners).
    const r0 = rect.x * ux + rect.y * uy;
    const r1 = rectMaxX * ux + rect.y * uy;
    const r2 = rect.x * ux + rectMaxY * uy;
    const r3 = rectMaxX * ux + rectMaxY * uy;
    const rectMin = Math.min(r0, r1, r2, r3);
    const rectMax = Math.max(r0, r1, r2, r3);

    if (rectMax < polyMin || polyMax < rectMin) return false; // separated
  }
  return true;
}

/**
 * Compose the final selection from a marquee result.
 *
 * - No shift → replace baseline with `candidates`.
 * - Shift held → XOR: items in the marquee toggle their baseline membership
 *   (already-selected items inside the rect become deselected; not-yet-selected
 *   items get added). Items outside the marquee are untouched.
 */
export function composeMarqueeSelection(
  baseline: Iterable<ObjectId>,
  candidates: Iterable<ObjectId>,
  shiftKey: boolean,
): Set<ObjectId> {
  const candSet = new Set(candidates);
  if (!shiftKey) return candSet;
  const out = new Set(baseline);
  for (const id of candSet) {
    if (out.has(id)) out.delete(id);
    else out.add(id);
  }
  return out;
}
