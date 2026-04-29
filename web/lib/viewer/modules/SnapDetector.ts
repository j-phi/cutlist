/**
 * Find the best snap target under the cursor in priority order:
 *
 *   vertex > edgeMidpoint > edge
 *
 * Per call:
 *
 *   1. Project each Object's bounding sphere to screen space and reject
 *      Objects outside a generous margin around the cursor. This is the
 *      load-bearing optimisation — without it the inner loop walks every
 *      Object's edge buffer.
 *   2. Walk the survivors' `edgesLocal` buffer (vertex pairs in source-mesh
 *      local space). Each pair contributes 2 vertex candidates, 1 midpoint
 *      candidate, and 1 closest-point-on-segment candidate. Project to
 *      screen, drop those further than per-kind pixel thresholds from the
 *      cursor.
 *   3. Pick the best candidate by priority + screen distance.
 *   4. Run *one* visibility raycast on the winner: shorten the ray's `far`
 *      by ~2 epsilon (to dodge z-fighting with faces the vertex sits on).
 *      Any hit closer than that means the candidate is occluded.
 *
 * Visibility uses a single raycast (on the picked winner) rather than
 * per-candidate. That keeps cost predictable: O(visible candidates) for
 * projection + 1 raycast per move, regardless of model complexity.
 */

import { transformLocalToWorld } from '../transforms';
import type { ObjectRegistry } from './ObjectRegistry';
import type { ObjectId, ObjectRecord, SnapTarget, Vec3 } from '../types';

type Vector3 = import('three').Vector3;
type Camera = import('three').Camera;
type BatchedMesh = import('three').BatchedMesh;
type Raycaster = import('three').Raycaster;

export const SNAP_PIXEL_THRESHOLD = {
  vertex: 12,
  edgeMidpoint: 10,
  edge: 8,
} as const;

const CULL_MARGIN_PX = 16;
const VISIBILITY_EPSILON_M = 0.001;

interface SnapDetectorDeps {
  THREE: typeof import('three');
  registry: ObjectRegistry;
  camera: () => Camera;
  /** The hit-testable world geometry — null when no model is loaded. */
  batchedMesh: () => BatchedMesh | null;
  raycaster: () => Raycaster;
  /** Live canvas rect; recomputed each call so resize doesn't drift snaps. */
  screenRect: () => DOMRect;
  /**
   * Optional visibility filter — Objects for which this returns `false` are
   * skipped entirely (matches Spec 06's per-Object visibility). Defaults to
   * "all visible".
   */
  isObjectVisible?: (groupId: ObjectId) => boolean;
}

interface CandidateBase {
  groupId: ObjectId;
  /** Squared screen distance from the cursor — sort key. */
  screenDistSq: number;
  world: Vector3;
}

type Candidate =
  | (CandidateBase & { kind: 'vertex' })
  | (CandidateBase & { kind: 'edgeMidpoint'; edgeA: Vector3; edgeB: Vector3 })
  | (CandidateBase & { kind: 'edge'; edgeA: Vector3; edgeB: Vector3 });

interface ScreenPoint {
  x: number;
  y: number;
  inFront: boolean;
}

export class SnapDetector {
  // Hot-loop scratches. Reused across calls; the detector is stateless
  // between invocations so this is safe.
  private scratchA: Vector3;
  private scratchB: Vector3;
  private scratchProj: Vector3;
  private scratchCullCenter: Vector3;
  private scratchCamPos: Vector3;
  private scratchRayDir: Vector3;

  constructor(private deps: SnapDetectorDeps) {
    const { THREE } = deps;
    this.scratchA = new THREE.Vector3();
    this.scratchB = new THREE.Vector3();
    this.scratchProj = new THREE.Vector3();
    this.scratchCullCenter = new THREE.Vector3();
    this.scratchCamPos = new THREE.Vector3();
    this.scratchRayDir = new THREE.Vector3();
  }

  findSnapTarget(clientX: number, clientY: number): SnapTarget | null {
    const camera = this.deps.camera();
    const rect = this.deps.screenRect();
    const cursorX = clientX - rect.left;
    const cursorY = clientY - rect.top;

    // Cast through `Candidate | null` so TS keeps the type after the
    // closure assigns into them (flow analysis narrows the literal-null
    // initial value too aggressively for `forEach` callbacks otherwise).
    let bestVertex = null as Candidate | null;
    let bestMidpoint = null as Candidate | null;
    let bestEdge = null as Candidate | null;

    const vMaxSq = SNAP_PIXEL_THRESHOLD.vertex ** 2;
    const mMaxSq = SNAP_PIXEL_THRESHOLD.edgeMidpoint ** 2;
    const eMaxSq = SNAP_PIXEL_THRESHOLD.edge ** 2;

    const aScreen: ScreenPoint = { x: 0, y: 0, inFront: false };
    const bScreen: ScreenPoint = { x: 0, y: 0, inFront: false };
    const midScreen: ScreenPoint = { x: 0, y: 0, inFront: false };

    this.deps.registry.forEach((record) => {
      if (
        this.deps.isObjectVisible &&
        !this.deps.isObjectVisible(record.groupId)
      )
        return;
      if (record.edgesLocal.length === 0) return;
      if (!this.passesScreenCull(record, camera, rect, cursorX, cursorY))
        return;

      const edges = record.edgesLocal;
      for (let i = 0; i < edges.length; i += 6) {
        // Local → world for both endpoints.
        this.scratchA.set(edges[i], edges[i + 1], edges[i + 2]);
        this.scratchB.set(edges[i + 3], edges[i + 4], edges[i + 5]);
        transformLocalToWorld(record, this.scratchA, this.scratchA);
        transformLocalToWorld(record, this.scratchB, this.scratchB);
        const ax = this.scratchA.x;
        const ay = this.scratchA.y;
        const az = this.scratchA.z;
        const bx = this.scratchB.x;
        const by = this.scratchB.y;
        const bz = this.scratchB.z;

        this.projectToScreen(ax, ay, az, camera, rect, aScreen);
        this.projectToScreen(bx, by, bz, camera, rect, bScreen);

        // Vertex A.
        if (aScreen.inFront) {
          const dx = aScreen.x - cursorX;
          const dy = aScreen.y - cursorY;
          const d2 = dx * dx + dy * dy;
          if (
            d2 < vMaxSq &&
            (bestVertex === null || d2 < bestVertex.screenDistSq)
          ) {
            bestVertex = {
              kind: 'vertex',
              groupId: record.groupId,
              screenDistSq: d2,
              world: new this.deps.THREE.Vector3(ax, ay, az),
            };
          }
        }

        // Vertex B.
        if (bScreen.inFront) {
          const dx = bScreen.x - cursorX;
          const dy = bScreen.y - cursorY;
          const d2 = dx * dx + dy * dy;
          if (
            d2 < vMaxSq &&
            (bestVertex === null || d2 < bestVertex.screenDistSq)
          ) {
            bestVertex = {
              kind: 'vertex',
              groupId: record.groupId,
              screenDistSq: d2,
              world: new this.deps.THREE.Vector3(bx, by, bz),
            };
          }
        }

        // Midpoint.
        const mx = (ax + bx) * 0.5;
        const my = (ay + by) * 0.5;
        const mz = (az + bz) * 0.5;
        this.projectToScreen(mx, my, mz, camera, rect, midScreen);
        if (midScreen.inFront) {
          const dx = midScreen.x - cursorX;
          const dy = midScreen.y - cursorY;
          const d2 = dx * dx + dy * dy;
          if (
            d2 < mMaxSq &&
            (bestMidpoint === null || d2 < bestMidpoint.screenDistSq)
          ) {
            bestMidpoint = {
              kind: 'edgeMidpoint',
              groupId: record.groupId,
              screenDistSq: d2,
              world: new this.deps.THREE.Vector3(mx, my, mz),
              edgeA: new this.deps.THREE.Vector3(ax, ay, az),
              edgeB: new this.deps.THREE.Vector3(bx, by, bz),
            };
          }
        }

        // Closest point on the edge to the cursor — done in screen space
        // so the threshold reads as "pixels from the rendered line", not
        // "world-distance from the segment". Both endpoints must be in
        // front of the camera for this to be meaningful.
        if (aScreen.inFront && bScreen.inFront) {
          const segDx = bScreen.x - aScreen.x;
          const segDy = bScreen.y - aScreen.y;
          const segLen2 = segDx * segDx + segDy * segDy;
          if (segLen2 > 0) {
            const t =
              ((cursorX - aScreen.x) * segDx + (cursorY - aScreen.y) * segDy) /
              segLen2;
            if (t > 0 && t < 1) {
              const projX = aScreen.x + segDx * t;
              const projY = aScreen.y + segDy * t;
              const dx = projX - cursorX;
              const dy = projY - cursorY;
              const d2 = dx * dx + dy * dy;
              if (
                d2 < eMaxSq &&
                (bestEdge === null || d2 < bestEdge.screenDistSq)
              ) {
                // Lerp world endpoints by the screen-space t. The
                // perspective-correct t differs slightly, but inside an
                // 8px radius the visual error is sub-mm at furniture scale.
                const wx = ax + (bx - ax) * t;
                const wy = ay + (by - ay) * t;
                const wz = az + (bz - az) * t;
                bestEdge = {
                  kind: 'edge',
                  groupId: record.groupId,
                  screenDistSq: d2,
                  world: new this.deps.THREE.Vector3(wx, wy, wz),
                  edgeA: new this.deps.THREE.Vector3(ax, ay, az),
                  edgeB: new this.deps.THREE.Vector3(bx, by, bz),
                };
              }
            }
          }
        }
      }
    });

    const winner: Candidate | null = bestVertex ?? bestMidpoint ?? bestEdge;
    if (!winner) return null;
    if (!this.isVisible(winner.world, camera)) return null;
    return toSnapTarget(winner);
  }

  private passesScreenCull(
    record: ObjectRecord,
    camera: Camera,
    rect: DOMRect,
    cursorX: number,
    cursorY: number,
  ): boolean {
    const center = this.scratchCullCenter.copy(record.boundsLocalCenter);
    transformLocalToWorld(record, center, center);
    const screen: ScreenPoint = { x: 0, y: 0, inFront: false };
    this.projectToScreen(center.x, center.y, center.z, camera, rect, screen);
    if (!screen.inFront) return false;

    const camPos = this.scratchCamPos.setFromMatrixPosition(camera.matrixWorld);
    const dist = camPos.distanceTo(center);
    const projectedRadiusPx = projectRadiusToPixels(
      record.boundsLocalRadius,
      dist,
      camera,
      rect.height,
    );
    const dx = screen.x - cursorX;
    const dy = screen.y - cursorY;
    const reach = projectedRadiusPx + CULL_MARGIN_PX;
    return dx * dx + dy * dy <= reach * reach;
  }

  private projectToScreen(
    wx: number,
    wy: number,
    wz: number,
    camera: Camera,
    rect: DOMRect,
    out: ScreenPoint,
  ): void {
    this.scratchProj.set(wx, wy, wz).project(camera);
    out.x = (this.scratchProj.x * 0.5 + 0.5) * rect.width;
    out.y = (-this.scratchProj.y * 0.5 + 0.5) * rect.height;
    out.inFront = this.scratchProj.z < 1;
  }

  private isVisible(world: Vector3, camera: Camera): boolean {
    const batched = this.deps.batchedMesh();
    if (!batched) return true;
    const camPos = this.scratchCamPos.setFromMatrixPosition(camera.matrixWorld);
    const dir = this.scratchRayDir.copy(world).sub(camPos);
    const distToCandidate = dir.length();
    if (distToCandidate <= VISIBILITY_EPSILON_M) return true;
    dir.divideScalar(distToCandidate);
    // Pull the ray's far end back by 2 epsilon so a vertex that sits on
    // the surface of its own face doesn't self-occlude through z-fighting.
    const pulledFar = distToCandidate - VISIBILITY_EPSILON_M * 2;
    if (pulledFar <= 0) return true;

    const raycaster = this.deps.raycaster();
    const prevFar = raycaster.far;
    const prevNear = raycaster.near;
    raycaster.set(camPos, dir);
    raycaster.near = 0;
    raycaster.far = pulledFar;
    const hits = raycaster.intersectObject(batched, false);
    raycaster.near = prevNear;
    raycaster.far = prevFar;
    return hits.length === 0;
  }
}

function projectRadiusToPixels(
  radius: number,
  distance: number,
  camera: Camera,
  rectHeight: number,
): number {
  const persp = camera as import('three').PerspectiveCamera;
  if (persp.isPerspectiveCamera) {
    const halfFovRad = (persp.fov * Math.PI) / 360;
    const worldHeightAtDist = 2 * distance * Math.tan(halfFovRad);
    return (radius / Math.max(worldHeightAtDist, 1e-6)) * rectHeight;
  }
  const ortho = camera as import('three').OrthographicCamera;
  const worldHeight = (ortho.top - ortho.bottom) / (ortho.zoom || 1);
  return (radius / Math.max(worldHeight, 1e-6)) * rectHeight;
}

function toSnapTarget(c: Candidate): SnapTarget {
  const world: Vec3 = [c.world.x, c.world.y, c.world.z];
  if (c.kind === 'vertex') {
    return { kind: 'vertex', groupId: c.groupId, worldPoint: world };
  }
  return {
    kind: c.kind,
    groupId: c.groupId,
    worldPoint: world,
    edgeA: [c.edgeA.x, c.edgeA.y, c.edgeA.z],
    edgeB: [c.edgeB.x, c.edgeB.y, c.edgeB.z],
  };
}
