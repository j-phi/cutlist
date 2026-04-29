/**
 * The single writer of `BatchedMesh.setColorAt`. Composites highlight, ghost,
 * and original colors from a hover/selection state. Other modules emit events
 * the highlighter listens to; they never touch the BatchedMesh directly.
 *
 * Color compositing rule:
 *   selection empty + no hover → original color, fully opaque, material opaque
 *   any selection or hover     → target instances tinted teal, others ghosted
 *                                at 0.15 alpha, material switched to transparent
 */

import type { ObjectRegistry } from './ObjectRegistry';
import type { ObjectId } from '../types';

type BatchedMesh = import('three').BatchedMesh;
type MeshStandardMaterial = import('three').MeshStandardMaterial;

const HIGHLIGHT_COLOR = 0x6ee7b7;
const GHOST_OPACITY = 0.15;

interface HighlighterDeps {
  THREE: typeof import('three');
  registry: ObjectRegistry;
  requestRender: () => void;
}

export class Highlighter {
  private batched: BatchedMesh | null = null;
  private material: MeshStandardMaterial | null = null;
  private originalColors = new Map<number, [number, number, number, number]>();
  private hoveredIds = new Set<ObjectId>();
  private selectedIds = new Set<ObjectId>();
  private disposed = false;

  constructor(private deps: HighlighterDeps) {}

  attach(
    batched: BatchedMesh,
    material: MeshStandardMaterial,
    originalColors: Map<number, [number, number, number, number]>,
  ): void {
    this.batched = batched;
    this.material = material;
    this.originalColors = originalColors;
    this.apply();
  }

  detach(): void {
    this.batched = null;
    this.material = null;
    this.originalColors = new Map();
    this.hoveredIds.clear();
    this.selectedIds.clear();
  }

  setHovered(ids: ObjectId[]): void {
    if (sameSet(this.hoveredIds, ids)) return;
    this.hoveredIds = new Set(ids);
    this.apply();
  }

  setSelected(ids: ObjectId[]): void {
    if (sameSet(this.selectedIds, ids)) return;
    this.selectedIds = new Set(ids);
    this.apply();
  }

  private apply(): void {
    if (this.disposed || !this.batched || !this.material) return;
    const { THREE } = this.deps;
    const vec4 = new THREE.Vector4();

    const targets = new Set<number>();
    const collect = (id: ObjectId) => {
      const r = this.deps.registry.get(id);
      if (!r) return;
      for (const b of r.batchIds) targets.add(b);
    };
    for (const hid of this.hoveredIds) collect(hid);
    for (const sid of this.selectedIds) collect(sid);

    const anyHighlight = targets.size > 0;
    if (!anyHighlight) {
      this.material.transparent = false;
      this.material.needsUpdate = true;
      this.batched.sortObjects = false;
      for (const [id, rgba] of this.originalColors) {
        vec4.set(rgba[0], rgba[1], rgba[2], 1.0);
        this.batched.setColorAt(id, vec4);
      }
    } else {
      this.material.transparent = true;
      this.material.needsUpdate = true;
      this.batched.sortObjects = true;
      const tint = new THREE.Color(HIGHLIGHT_COLOR);
      for (const [id, rgba] of this.originalColors) {
        if (targets.has(id)) {
          vec4.set(tint.r, tint.g, tint.b, 1.0);
        } else {
          vec4.set(rgba[0], rgba[1], rgba[2], GHOST_OPACITY);
        }
        this.batched.setColorAt(id, vec4);
      }
    }

    this.deps.requestRender();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
  }
}

function sameSet(a: Set<ObjectId>, b: ObjectId[]): boolean {
  if (a.size !== b.length) return false;
  for (const x of b) if (!a.has(x)) return false;
  return true;
}
