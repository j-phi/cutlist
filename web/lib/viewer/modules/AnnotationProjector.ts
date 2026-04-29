/**
 * Projects every annotation's label anchor from world space to canvas space,
 * once per frame, and (optionally) collects 3D leader specs for the
 * LeaderManager.
 *
 * The Vue overlay watches `version` to know when to re-read positions.
 * Mutating a single in-place Map + bumping a ref is cheaper than allocating
 * a new Map each frame and lets Vue's reactivity do one batch invalidation
 * instead of N per-key writes.
 *
 * Each annotation kind contributes a `KindHooks` entry to this projector:
 *   - `primaryWorld(annotation, lookup)` returns the world-space point the
 *     LABEL renders at — i.e. the leader's far end, not the face anchor —
 *     so the label DOM lands at the projected world position, not buried
 *     in the geometry. Returning `null` drops the annotation for the frame.
 *   - `auxWorld(annotation, lookup)` (optional) returns extra world-space
 *     points to project; their `ScreenPos` results land in
 *     `getAuxScreenPositions().get(id)` in the same order. Used by
 *     dimensions to pin the label to the screen-space midpoint of the main
 *     line and rotate to the line angle.
 *   - `leaderSpec(annotation, lookup)` builds the 3D line(s) the
 *     LeaderManager should render. Optional. May return a single spec or an
 *     array — arrays are emitted as composite ids `${id}#0`, `${id}#1`, …
 *     so the LeaderManager doesn't need to know about multi-segment kinds.
 *
 * Built-in defaults exist for callouts and dimensions so the v1 framework
 * keeps working before specific kinds register richer hooks; calling
 * `registerKind` overrides the default.
 */

import { ref, type Ref } from 'vue';
import type {
  AnnotationKind,
  IdbAnnotation,
  IdbCallout,
  IdbDimension,
} from '~/composables/useIdb';
import type { GroupId } from '~/utils/types';
import type { RenderedLeaderSpec } from '../types';

type Vec3 = [number, number, number];

export interface ScreenPos {
  x: number;
  y: number;
  inFront: boolean;
  /** World-space anchor — used by leader rendering and per-kind extras. */
  worldAnchor: Vec3;
}

export type ObjectLocalToWorld = (groupId: GroupId, local: Vec3) => Vec3 | null;

export interface KindHooks<A extends IdbAnnotation = IdbAnnotation> {
  /** World-space point the label renders at. Return null to drop for the frame. */
  primaryWorld(annotation: A, lookup: ObjectLocalToWorld): Vec3 | null;
  /**
   * Optional auxiliary world points; their projected positions are stored at
   * `getAuxScreenPositions().get(id)` in the same order. Returning `null` is
   * equivalent to omitting the hook (no aux entries for that annotation).
   */
  auxWorld?(annotation: A, lookup: ObjectLocalToWorld): Vec3[] | null;
  leaderSpec?(
    annotation: A,
    lookup: ObjectLocalToWorld,
  ): RenderedLeaderSpec | RenderedLeaderSpec[] | null;
}

export interface ProjectorViewer {
  worldToScreen(world: Vec3): { x: number; y: number; inFront: boolean } | null;
  /**
   * Resolve a local-space point on the given Object to current world space
   * (composes `originalMatrix` and the Object's current `offsetMatrix`).
   * Returns `null` when the Object isn't loaded.
   */
  objectLocalToWorld(groupId: GroupId, local: Vec3): Vec3 | null;
  onFrame(cb: () => void): () => void;
  /** Optional sink for 3D leader lines. Skipped when not provided. */
  setRenderedLeaders?(specs: Map<string, RenderedLeaderSpec>): void;
}

export class AnnotationProjector {
  readonly version: Ref<number> = ref(0);
  private positions = new Map<string, ScreenPos>();
  private auxPositions = new Map<string, ScreenPos[]>();
  private leaderSpecs = new Map<string, RenderedLeaderSpec>();
  private hooks = new Map<AnnotationKind, KindHooks>();
  private off: (() => void) | null = null;
  private disposed = false;
  private lookup: ObjectLocalToWorld;

  constructor(
    private viewer: ProjectorViewer,
    private getAnnotations: () => readonly IdbAnnotation[],
  ) {
    this.hooks.set('callout', defaultCalloutHooks);
    this.hooks.set('dimension', defaultDimensionHooks);
    this.lookup = (g, l) => this.viewer.objectLocalToWorld(g, l);
  }

  /** Replace (or add) hooks for a kind. Returns an unregister callback. */
  registerKind<K extends AnnotationKind>(
    kind: K,
    hooks: KindHooks<Extract<IdbAnnotation, { kind: K }>>,
  ): () => void {
    const previous = this.hooks.get(kind);
    this.hooks.set(kind, hooks as unknown as KindHooks);
    return () => {
      if (this.hooks.get(kind) === (hooks as unknown as KindHooks)) {
        if (previous) this.hooks.set(kind, previous);
        else this.hooks.delete(kind);
      }
    };
  }

  start(): () => void {
    if (this.off) return this.off;
    this.off = this.viewer.onFrame(() => this.tick());
    return () => this.dispose();
  }

  /** Read-only view; pair with `version` for reactivity. */
  getScreenPositions(): ReadonlyMap<string, ScreenPos> {
    return this.positions;
  }

  /** Aux screen positions keyed by annotation id. Empty when no kind opts in. */
  getAuxScreenPositions(): ReadonlyMap<string, ScreenPos[]> {
    return this.auxPositions;
  }

  tick(): void {
    if (this.disposed) return;
    const seen = new Set<string>();
    const seenAux = new Set<string>();
    const seenLeaders = new Set<string>();
    for (const a of this.getAnnotations()) {
      seen.add(a.id);
      const hooks = this.hooks.get(a.kind);
      if (!hooks) {
        this.positions.delete(a.id);
        this.auxPositions.delete(a.id);
        this.leaderSpecs.delete(a.id);
        continue;
      }
      const world = hooks.primaryWorld(a, this.lookup);
      const screen = world ? this.viewer.worldToScreen(world) : null;
      if (!world || !screen) {
        this.positions.delete(a.id);
      } else {
        const existing = this.positions.get(a.id);
        if (existing) {
          existing.x = screen.x;
          existing.y = screen.y;
          existing.inFront = screen.inFront;
          existing.worldAnchor[0] = world[0];
          existing.worldAnchor[1] = world[1];
          existing.worldAnchor[2] = world[2];
        } else {
          this.positions.set(a.id, {
            x: screen.x,
            y: screen.y,
            inFront: screen.inFront,
            worldAnchor: [world[0], world[1], world[2]],
          });
        }
      }
      if (hooks.auxWorld) {
        const auxList = hooks.auxWorld(a, this.lookup);
        if (auxList && auxList.length > 0) {
          seenAux.add(a.id);
          this.auxPositions.set(
            a.id,
            auxList.map((w) => {
              const s = this.viewer.worldToScreen(w);
              return {
                x: s?.x ?? 0,
                y: s?.y ?? 0,
                inFront: s?.inFront ?? false,
                worldAnchor: [w[0], w[1], w[2]],
              };
            }),
          );
        }
      }
      if (hooks.leaderSpec) {
        const spec = hooks.leaderSpec(a, this.lookup);
        if (Array.isArray(spec)) {
          for (let i = 0; i < spec.length; i++) {
            const id = `${a.id}#${i}`;
            seenLeaders.add(id);
            this.leaderSpecs.set(id, spec[i]);
          }
        } else if (spec) {
          seenLeaders.add(a.id);
          this.leaderSpecs.set(a.id, spec);
        }
      }
    }
    for (const id of [...this.positions.keys()]) {
      if (!seen.has(id)) this.positions.delete(id);
    }
    for (const id of [...this.auxPositions.keys()]) {
      if (!seenAux.has(id)) this.auxPositions.delete(id);
    }
    for (const id of [...this.leaderSpecs.keys()]) {
      if (!seenLeaders.has(id)) this.leaderSpecs.delete(id);
    }
    this.viewer.setRenderedLeaders?.(this.leaderSpecs);
    this.version.value++;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.off?.();
    this.off = null;
    this.positions.clear();
    this.auxPositions.clear();
    this.leaderSpecs.clear();
  }
}

const defaultCalloutHooks: KindHooks<IdbCallout> = {
  primaryWorld(a, lookup) {
    return lookup(a.groupId, [
      a.anchorLocal[0] + a.labelOffsetLocal[0],
      a.anchorLocal[1] + a.labelOffsetLocal[1],
      a.anchorLocal[2] + a.labelOffsetLocal[2],
    ]);
  },
};

/**
 * Fallback for dimensions before Spec 09's hooks register. Treats both
 * anchors and the offset as living in `a.groupId`'s frame; the real
 * dimension hooks handle the cross-Object case.
 */
const defaultDimensionHooks: KindHooks<IdbDimension> = {
  primaryWorld(a, lookup) {
    return lookup(a.groupId, [
      (a.anchor1.local[0] + a.anchor2.local[0]) / 2 + a.offsetLocal[0],
      (a.anchor1.local[1] + a.anchor2.local[1]) / 2 + a.offsetLocal[1],
      (a.anchor1.local[2] + a.anchor2.local[2]) / 2 + a.offsetLocal[2],
    ]);
  },
};
