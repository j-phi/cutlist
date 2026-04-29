/**
 * Linear dimension annotation. Three pieces:
 *
 * 1. `createDimensionHandler` — three-step `PickKindHandler`. Click 1 +
 *    click 2 each stage one snapped anchor (vertex / edge midpoint /
 *    edge), possibly on different Objects. Click 3 commits at the
 *    cursor's snapped offset; in between, pointer-move drives a live
 *    preview annotation through the author so the projector renders
 *    witness lines + main dimension line as the cursor moves.
 *
 * 2. `createDimensionKindHooks` — `KindHooks` for the projector.
 *    Resolves both anchors (which can live on different Objects) into
 *    world space, applies the offset (transformed from the dimension's
 *    `groupId` frame), and emits 3+ leader segments via the projector's
 *    array form: main line, two witness lines, and tick caps when the
 *    offset is near zero.
 *
 * 3. Pure helpers `snapOffsetToWorldAxis` and `formatLength`.
 *
 * Snap semantics: the 45° snap is built around the world-axis-aligned
 * orthonormal basis perpendicular to the dimension line. Picking the
 * basis from world axes (rather than the camera's frame) means the
 * snapped offset always lies on a world-axis plane regardless of orbit
 * angle — exactly what magazine-style furniture dimensions expect.
 *
 * Z-bias: the rendered dimension/witness segments are pulled toward the
 * camera by `Z_OFFSET` to dodge z-fighting with silhouette edges. Tiny
 * on furniture-scale models — invisible to the eye.
 */

import { ref, type Ref } from 'vue';
import type { PickKindHandler } from '~/composables/useAnnotationAuthor';
import { PREVIEW_ANNOTATION_ID } from '~/composables/useAnnotationAuthor';
import type { UseAnnotationsApi } from '~/composables/useAnnotations';
import type { KindHooks } from '~/lib/viewer/modules/AnnotationProjector';
import type { RenderedLeaderSpec, SnapTarget } from '~/lib/viewer/types';
import type { IdbAnnotation, IdbDimension } from '~/composables/useIdb';
import type { GroupId } from '~/utils/types';

type Vec3 = [number, number, number];

const DIM_LEADER_COLOR = 0xfca5a5;
const Z_OFFSET = 0.0008;
const TICK_LENGTH = 0.012;
const ON_EDGE_THRESHOLD_M = 0.001;
/** Snap the offset angle to the nearest π/4 (45°). Eight directions. */
const OFFSET_SNAP_RAD = Math.PI / 4;

export interface DimensionViewer {
  findSnapTarget(x: number, y: number): SnapTarget | null;
  setSnapHover(target: SnapTarget | null): void;
  worldToObjectLocal(groupId: GroupId, world: Vec3): Vec3 | null;
  objectLocalToWorld(groupId: GroupId, local: Vec3): Vec3 | null;
  /**
   * Cast a ray from the cursor and intersect it with a world-space plane.
   * Used to translate cursor motion into a world-space offset on the plane
   * perpendicular to the camera through the dimension line's midpoint.
   */
  unprojectToPlane(
    x: number,
    y: number,
    planePoint: Vec3,
    planeNormal: Vec3,
  ): Vec3 | null;
  /** `undefined` only before the viewer has finished init. */
  getCameraPose(): { position: Vec3; target: Vec3 } | undefined;
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

export function formatLength(
  meters: number,
  distanceUnit: 'mm' | 'in',
): string {
  return distanceUnit === 'mm'
    ? `${Math.round(meters * 1000)}mm`
    : `${(meters * 39.3701).toFixed(2)}in`;
}

/**
 * Snap a raw cursor-derived perpendicular offset to the nearest 45° around
 * the dimension line, in a *world-axis-aligned* basis. The line is `a → b`;
 * the returned offset has the same magnitude as the perpendicular component
 * of `rawOffset` (the parallel component is dropped — it has no visual
 * meaning for a perpendicular offset).
 */
export function snapOffsetToWorldAxis(
  rawOffset: Vec3,
  line: { a: Vec3; b: Vec3 },
): Vec3 {
  const edgeRaw: Vec3 = [
    line.b[0] - line.a[0],
    line.b[1] - line.a[1],
    line.b[2] - line.a[2],
  ];
  const edgeLen = Math.hypot(edgeRaw[0], edgeRaw[1], edgeRaw[2]);
  if (edgeLen < 1e-9) return [0, 0, 0];
  const edgeDir: Vec3 = [
    edgeRaw[0] / edgeLen,
    edgeRaw[1] / edgeLen,
    edgeRaw[2] / edgeLen,
  ];
  const along =
    rawOffset[0] * edgeDir[0] +
    rawOffset[1] * edgeDir[1] +
    rawOffset[2] * edgeDir[2];
  const perp: Vec3 = [
    rawOffset[0] - edgeDir[0] * along,
    rawOffset[1] - edgeDir[1] * along,
    rawOffset[2] - edgeDir[2] * along,
  ];
  const magnitude = Math.hypot(perp[0], perp[1], perp[2]);
  if (magnitude < 1e-9) return [0, 0, 0];

  const { u, v } = buildWorldSnapBasis(edgeDir);
  const a = perp[0] * u[0] + perp[1] * u[1] + perp[2] * u[2];
  const b = perp[0] * v[0] + perp[1] * v[1] + perp[2] * v[2];
  const angle = Math.atan2(b, a);
  const snapped = Math.round(angle / OFFSET_SNAP_RAD) * OFFSET_SNAP_RAD;
  const sa = Math.cos(snapped) * magnitude;
  const sb = Math.sin(snapped) * magnitude;
  return [u[0] * sa + v[0] * sb, u[1] * sa + v[1] * sb, u[2] * sa + v[2] * sb];
}

/**
 * Build a world-axis-aligned orthonormal basis in the plane perpendicular
 * to `edgeDir`. The 0° axis (`u`) is the world axis (Y / X / Z, in that
 * preference order) most perpendicular to the edge. Picking from world axes
 * means a 45°-snapped offset always lies on a world-axis face plane
 * regardless of orbit angle.
 */
function buildWorldSnapBasis(edgeDir: Vec3): { u: Vec3; v: Vec3 } {
  const candidates: Vec3[] = [
    [0, 1, 0],
    [1, 0, 0],
    [0, 0, 1],
  ];
  for (const candidate of candidates) {
    const along =
      candidate[0] * edgeDir[0] +
      candidate[1] * edgeDir[1] +
      candidate[2] * edgeDir[2];
    if (Math.abs(along) > 0.999) continue;
    const projected: Vec3 = [
      candidate[0] - edgeDir[0] * along,
      candidate[1] - edgeDir[1] * along,
      candidate[2] - edgeDir[2] * along,
    ];
    const len = Math.hypot(projected[0], projected[1], projected[2]);
    if (len < 0.12) continue;
    const u: Vec3 = [
      projected[0] / len,
      projected[1] / len,
      projected[2] / len,
    ];
    const cx = edgeDir[1] * u[2] - edgeDir[2] * u[1];
    const cy = edgeDir[2] * u[0] - edgeDir[0] * u[2];
    const cz = edgeDir[0] * u[1] - edgeDir[1] * u[0];
    const cl = Math.hypot(cx, cy, cz) || 1;
    return { u, v: [cx / cl, cy / cl, cz / cl] };
  }
  return { u: [1, 0, 0], v: [0, 0, 1] };
}

// ─── Pick handler ──────────────────────────────────────────────────────────

interface StagedAnchor {
  groupId: GroupId;
  local: Vec3;
}

export function createDimensionHandler(deps: {
  viewer: DimensionViewer;
  annotationsApi: UseAnnotationsApi;
  activeSceneId: Ref<string | null>;
  author: { setPreview(annotation: IdbAnnotation | null): void };
}): PickKindHandler {
  const { viewer, annotationsApi, activeSceneId, author } = deps;
  // Reactive so the author's `hint` computed re-runs after each click —
  // closure-only state would leave the banner stuck at "Pick the first
  // point" until something else (mode flip etc.) invalidated the computed.
  const anchor1 = ref<StagedAnchor | null>(null);
  const anchor2 = ref<StagedAnchor | null>(null);
  let previewOffsetWorld: Vec3 = [0, 0, 0];

  function reset() {
    anchor1.value = null;
    anchor2.value = null;
    previewOffsetWorld = [0, 0, 0];
    author.setPreview(null);
  }

  /**
   * Convert a snap target into one or two staged anchors. Edge and
   * edge-midpoint snaps both pin a *whole edge* — the anchors are the edge's
   * endpoints transformed into the snapped Object's local frame, so a single
   * click on an edge skips the second-anchor step entirely. Vertex snaps
   * stage one anchor.
   */
  function anchorsFromSnap(
    snap: SnapTarget,
  ): { a1: StagedAnchor; a2?: StagedAnchor } | null {
    if (snap.kind === 'vertex') {
      const local = viewer.worldToObjectLocal(snap.groupId, snap.worldPoint);
      if (!local) return null;
      return { a1: { groupId: snap.groupId, local } };
    }
    const localA = viewer.worldToObjectLocal(snap.groupId, snap.edgeA);
    const localB = viewer.worldToObjectLocal(snap.groupId, snap.edgeB);
    if (!localA || !localB) return null;
    return {
      a1: { groupId: snap.groupId, local: localA },
      a2: { groupId: snap.groupId, local: localB },
    };
  }

  function rebuildPreview(client: { x: number; y: number }) {
    const sceneId = activeSceneId.value;
    const a1 = anchor1.value;
    const a2 = anchor2.value;
    if (!sceneId || !a1 || !a2) return;
    const worldA = viewer.objectLocalToWorld(a1.groupId, a1.local);
    const worldB = viewer.objectLocalToWorld(a2.groupId, a2.local);
    if (!worldA || !worldB) return;

    const mid: Vec3 = [
      (worldA[0] + worldB[0]) / 2,
      (worldA[1] + worldB[1]) / 2,
      (worldA[2] + worldB[2]) / 2,
    ];
    const camFwd = cameraForward(viewer);
    const cursorWorld = viewer.unprojectToPlane(
      client.x,
      client.y,
      mid,
      camFwd,
    );
    if (!cursorWorld) return;
    const raw: Vec3 = [
      cursorWorld[0] - mid[0],
      cursorWorld[1] - mid[1],
      cursorWorld[2] - mid[2],
    ];
    previewOffsetWorld = snapOffsetToWorldAxis(raw, { a: worldA, b: worldB });

    const offsetLocal = worldOffsetToLocal(
      viewer,
      a1.groupId,
      previewOffsetWorld,
    );
    if (!offsetLocal) return;
    const now = '__preview__';
    const draft: IdbDimension = {
      id: PREVIEW_ANNOTATION_ID,
      sceneId,
      kind: 'dimension',
      groupId: a1.groupId,
      anchor1: { groupId: a1.groupId, local: plainVec3(a1.local) },
      anchor2: { groupId: a2.groupId, local: plainVec3(a2.local) },
      offsetLocal: plainVec3(offsetLocal),
      createdAt: now,
      updatedAt: now,
    };
    author.setPreview(draft);
  }

  return {
    hint: () => {
      if (!anchor1.value) return 'Click two points or an edge · Esc to cancel';
      if (!anchor2.value) return 'Click the second point · Esc to cancel';
      return 'Move to set offset · click to place · Esc to cancel';
    },

    onPointerMove(client) {
      if (!anchor1.value || !anchor2.value) {
        viewer.setSnapHover(viewer.findSnapTarget(client.x, client.y));
        return;
      }
      // Step 3: snap-hover stays cleared so the yellow vertex/edge cue
      // doesn't compete with the live preview.
      viewer.setSnapHover(null);
      rebuildPreview(client);
    },

    async onClick(client) {
      const sceneId = activeSceneId.value;
      if (!sceneId) {
        reset();
        return { done: true };
      }

      // Step 1: not yet picked a starting point.
      if (!anchor1.value) {
        const snap = viewer.findSnapTarget(client.x, client.y);
        if (!snap) return { done: false };
        const staged = anchorsFromSnap(snap);
        if (!staged) return { done: false };
        anchor1.value = staged.a1;
        // Edge / edge-midpoint snap pins both endpoints in one click —
        // jump straight to the offset step.
        if (staged.a2) anchor2.value = staged.a2;
        return { done: false };
      }

      // Step 2: have anchor1 from a vertex pick, awaiting anchor2.
      if (!anchor2.value) {
        const snap = viewer.findSnapTarget(client.x, client.y);
        if (!snap) return { done: false };
        const staged = anchorsFromSnap(snap);
        if (!staged) return { done: false };
        // If the second pick lands on an edge, take its nearer endpoint as
        // the second anchor — the "two points" mental model wins over
        // "two edges" when mixing pick types.
        anchor2.value = staged.a1;
        return { done: false };
      }

      // Step 3: commit at the current preview offset. We rebuild once at
      // the click point so a click without prior pointer motion still
      // captures a sensible offset.
      rebuildPreview(client);
      const a1 = anchor1.value;
      const a2 = anchor2.value;
      // Both anchors are guaranteed by the if-chain above; the assertion
      // is just for the type narrower.
      if (!a1 || !a2) {
        reset();
        return { done: false };
      }
      const offsetWorldRaw = worldOffsetToLocal(
        viewer,
        a1.groupId,
        previewOffsetWorld,
      ) ?? [0, 0, 0];
      // Strip any Vue reactivity from values that flow into IndexedDB —
      // structured clone of a reactive Proxy fails inside Dexie's put().
      // Spreading each Vec3 into a fresh tuple is enough; the staged anchors
      // come from `ref(...)` so their `.local` is a reactive proxy.
      const a1Local = plainVec3(a1.local);
      const a2Local = plainVec3(a2.local);
      const offsetLocal = plainVec3(offsetWorldRaw);
      try {
        const id = await annotationsApi.add({
          kind: 'dimension',
          sceneId,
          groupId: a1.groupId,
          anchor1: { groupId: a1.groupId, local: a1Local },
          anchor2: { groupId: a2.groupId, local: a2Local },
          offsetLocal,
        });
        reset();
        return { done: true, draftId: id ?? null };
      } catch (err) {
        // A persistence failure must NOT leave the handler stuck in step 3
        // — every subsequent click would land in the commit branch and
        // re-throw. Reset to step 1 so the user can retry.
        console.error('[dimension] commit failed:', err);
        reset();
        return { done: true };
      }
    },

    onEsc() {
      reset();
    },
  };
}

/**
 * Copy a Vec3 into a fresh primitive tuple, escaping any Vue reactive proxy
 * the source may have been wrapped in. Cheap (3 reads) and load-bearing for
 * IndexedDB writes — structured clone of a reactive proxy can blow up
 * inside Dexie's transaction queue.
 */
function plainVec3(v: Vec3): Vec3 {
  return [v[0], v[1], v[2]];
}

/**
 * Convert a *world-space offset vector* into the Object's local frame while
 * preserving magnitude.
 *
 * `viewer.worldDirToObjectLocal` is the wrong tool here: under the hood it
 * uses Three.js `transformDirection`, which normalises the result and
 * silently throws away the magnitude. We instead route the offset through
 * a point transform — the local origin is `[0, 0, 0]` exactly, so the
 * world tip's local coords ARE the local offset.
 */
function worldOffsetToLocal(
  viewer: {
    objectLocalToWorld(g: GroupId, local: Vec3): Vec3 | null;
    worldToObjectLocal(g: GroupId, world: Vec3): Vec3 | null;
  },
  groupId: GroupId,
  worldOffset: Vec3,
): Vec3 | null {
  const originWorld = viewer.objectLocalToWorld(groupId, [0, 0, 0]);
  if (!originWorld) return null;
  return viewer.worldToObjectLocal(groupId, [
    originWorld[0] + worldOffset[0],
    originWorld[1] + worldOffset[1],
    originWorld[2] + worldOffset[2],
  ]);
}

function cameraForward(viewer: {
  getCameraPose(): { position: Vec3; target: Vec3 } | undefined;
}): Vec3 {
  const pose = viewer.getCameraPose();
  if (!pose) return [0, 0, -1];
  return normalize([
    pose.target[0] - pose.position[0],
    pose.target[1] - pose.position[1],
    pose.target[2] - pose.position[2],
  ]);
}

function normalize(v: Vec3): Vec3 {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

// ─── Projector hooks ───────────────────────────────────────────────────────

/** Subset of viewer needed by the dimension's projector hooks. */
export interface DimensionHookViewer {
  getCameraPose(): { position: Vec3; target: Vec3 } | undefined;
}

export function createDimensionKindHooks(
  viewer: DimensionHookViewer,
): KindHooks<IdbDimension> {
  return {
    primaryWorld(a, lookup) {
      const built = build(a, lookup, viewer);
      if (!built) return null;
      // Position the wrapper at the 3D midpoint of the rendered main line.
      // DimensionLabel later refines to the screen-space midpoint via
      // auxWorld, but the wrapper still needs a world anchor for the
      // visibility/in-front check on the projector.
      return [
        (built.p1[0] + built.p2[0]) / 2,
        (built.p1[1] + built.p2[1]) / 2,
        (built.p1[2] + built.p2[2]) / 2,
      ];
    },
    auxWorld(a, lookup) {
      const built = build(a, lookup, viewer);
      if (!built) return null;
      // Two screen anchors of the rendered main line — DimensionLabel reads
      // these to compute the screen-space midpoint and rotation angle.
      return [built.p1, built.p2];
    },
    leaderSpec(a, lookup) {
      const built = build(a, lookup, viewer);
      if (!built) return null;
      // segments[0] is the main dimension line (always solid). The
      // remaining segments are either witness lines (magazine mode →
      // dashed) or tick caps (on-edge mode → solid).
      return built.segments.map(
        (seg, i): RenderedLeaderSpec => ({
          start: seg[0],
          end: seg[1],
          color: DIM_LEADER_COLOR,
          dashed: !built.onEdge && i > 0,
        }),
      );
    },
  };
}

interface BuiltDimension {
  /** Endpoints of the rendered main dimension line, post Z-bias. */
  p1: Vec3;
  p2: Vec3;
  /** Main + witness lines (or main + tick caps when the offset is near zero). */
  segments: Array<[Vec3, Vec3]>;
  /**
   * True when the offset is below the on-edge threshold and the dimension
   * renders with tick caps instead of witness lines. The leader hooks read
   * this to decide whether the trailing segments should be dashed.
   */
  onEdge: boolean;
}

function build(
  a: IdbDimension,
  lookup: (g: GroupId, l: Vec3) => Vec3 | null,
  viewer: DimensionHookViewer,
): BuiltDimension | null {
  const aWorld = lookup(a.anchor1.groupId, a.anchor1.local);
  const bWorld = lookup(a.anchor2.groupId, a.anchor2.local);
  if (!aWorld || !bWorld) return null;

  // Convert `offsetLocal` (in the dimension's frame) to world by sampling
  // two points (origin and origin+offset) through the same pose-aware
  // lookup and subtracting. This is exact under any rigid or rigid+scale
  // Object transform — `transformDirection`-style direction-only paths
  // would normalise the result and silently lose magnitude.
  const origin = lookup(a.groupId, [0, 0, 0]);
  const tip = lookup(a.groupId, a.offsetLocal);
  if (!origin || !tip) return null;
  const offsetWorld: Vec3 = [
    tip[0] - origin[0],
    tip[1] - origin[1],
    tip[2] - origin[2],
  ];

  const offsetLen = Math.hypot(offsetWorld[0], offsetWorld[1], offsetWorld[2]);
  const edgeRaw: Vec3 = [
    bWorld[0] - aWorld[0],
    bWorld[1] - aWorld[1],
    bWorld[2] - aWorld[2],
  ];
  const edgeLen = Math.hypot(edgeRaw[0], edgeRaw[1], edgeRaw[2]);
  if (edgeLen < 1e-9) return null;
  const edgeDir: Vec3 = [
    edgeRaw[0] / edgeLen,
    edgeRaw[1] / edgeLen,
    edgeRaw[2] / edgeLen,
  ];

  const camFwd = cameraForward(viewer);
  const camPull: Vec3 = [
    -camFwd[0] * Z_OFFSET,
    -camFwd[1] * Z_OFFSET,
    -camFwd[2] * Z_OFFSET,
  ];

  const segments: Array<[Vec3, Vec3]> = [];
  let p1: Vec3;
  let p2: Vec3;
  const onEdge = offsetLen < ON_EDGE_THRESHOLD_M;
  if (onEdge) {
    // On-edge presentation with tick caps (no witness lines).
    p1 = add(aWorld, camPull);
    p2 = add(bWorld, camPull);
    const tickN = perpInScreenPlane(edgeDir, camFwd);
    const half = TICK_LENGTH / 2;
    segments.push([p1, p2]);
    segments.push([offset(p1, tickN, -half), offset(p1, tickN, half)]);
    segments.push([offset(p2, tickN, -half), offset(p2, tickN, half)]);
  } else {
    // Magazine-style: main line at edge + offset, witness lines back to the
    // edge endpoints.
    p1 = add(add(aWorld, offsetWorld), camPull);
    p2 = add(add(bWorld, offsetWorld), camPull);
    const w1 = add(aWorld, camPull);
    const w2 = add(bWorld, camPull);
    segments.push([p1, p2]);
    segments.push([w1, p1]);
    segments.push([w2, p2]);
  }

  return { p1, p2, segments, onEdge };
}

function add(p: Vec3, q: Vec3): Vec3 {
  return [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
}

function offset(p: Vec3, dir: Vec3, amount: number): Vec3 {
  return [
    p[0] + dir[0] * amount,
    p[1] + dir[1] * amount,
    p[2] + dir[2] * amount,
  ];
}

/**
 * Tick direction = perpendicular to the edge in the plane facing the
 * camera. Used for tick caps on on-edge dimensions.
 */
function perpInScreenPlane(edgeDir: Vec3, camFwd: Vec3): Vec3 {
  const a = cross(edgeDir, camFwd);
  if (Math.hypot(a[0], a[1], a[2]) < 1e-6) return [0, 1, 0];
  const an = normalize(a);
  return normalize(cross(an, edgeDir));
}
