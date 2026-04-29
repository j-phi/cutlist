/**
 * Projects every annotation's primary anchor from Object-local space to
 * canvas space, once per frame.
 *
 * The Vue overlay watches `version` to know when to re-read positions.
 * Mutating a single in-place Map + bumping a ref is cheaper than allocating
 * a new Map each frame and lets Vue's reactivity do one batch invalidation
 * instead of N per-key writes.
 *
 * Primary anchor per kind:
 *   - callout   → `anchorLocal`
 *   - dimension → midpoint of `anchor1Local`, `anchor2Local`
 *
 * Per-kind labels can offset from this primary anchor in screen space (CSS
 * transform) without the projector needing to know about it.
 */

import { ref, type Ref } from 'vue';
import type { IdbAnnotation } from '~/composables/useIdb';
import type { GroupId } from '~/utils/types';

type Vec3 = [number, number, number];

export interface ScreenPos {
  x: number;
  y: number;
  inFront: boolean;
  /** World-space anchor — used by leader rendering and per-kind extras. */
  worldAnchor: Vec3;
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
}

export class AnnotationProjector {
  readonly version: Ref<number> = ref(0);
  private positions = new Map<string, ScreenPos>();
  private off: (() => void) | null = null;
  private disposed = false;

  constructor(
    private viewer: ProjectorViewer,
    private getAnnotations: () => readonly IdbAnnotation[],
  ) {}

  start(): () => void {
    if (this.off) return this.off;
    this.off = this.viewer.onFrame(() => this.tick());
    return () => this.dispose();
  }

  /** Read-only view; pair with `version` for reactivity. */
  getScreenPositions(): ReadonlyMap<string, ScreenPos> {
    return this.positions;
  }

  tick(): void {
    if (this.disposed) return;
    const seen = new Set<string>();
    for (const a of this.getAnnotations()) {
      seen.add(a.id);
      const local = primaryLocal(a);
      const world = this.viewer.objectLocalToWorld(a.groupId, local);
      if (!world) {
        this.positions.delete(a.id);
        continue;
      }
      const screen = this.viewer.worldToScreen(world);
      if (!screen) {
        this.positions.delete(a.id);
        continue;
      }
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
    for (const id of [...this.positions.keys()]) {
      if (!seen.has(id)) this.positions.delete(id);
    }
    this.version.value++;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.off?.();
    this.off = null;
    this.positions.clear();
  }
}

function primaryLocal(a: IdbAnnotation): Vec3 {
  if (a.kind === 'callout') return a.anchorLocal;
  return [
    (a.anchor1Local[0] + a.anchor2Local[0]) / 2,
    (a.anchor1Local[1] + a.anchor2Local[1]) / 2,
    (a.anchor1Local[2] + a.anchor2Local[2]) / 2,
  ];
}
