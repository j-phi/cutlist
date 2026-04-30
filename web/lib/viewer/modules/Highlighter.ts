/**
 * The single writer of `BatchedMesh.setColorAt`. Composites highlight, ghost,
 * and original colors from a hover/selection state. Other modules emit events
 * the highlighter listens to; they never touch the BatchedMesh directly.
 *
 * Color compositing rule:
 *   selection empty + no hover → original color, fully opaque, material opaque
 *   any selection or hover     → target instances tinted teal, others ghosted
 *                                at 0.15 alpha, material switched to transparent
 *                                while a selected-face overlay draws late
 *                                without depth testing
 */

import type { ObjectRegistry } from './ObjectRegistry';
import type { GroupId } from '~/utils/types';

type BatchedMesh = import('three').BatchedMesh;
type MeshStandardMaterial = import('three').MeshStandardMaterial;

const HIGHLIGHT_COLOR = 0x6ee7b7;
const GHOST_OPACITY = 0.15;

interface HighlighterDeps {
  THREE: typeof import('three');
  registry: ObjectRegistry;
  requestRender: () => void;
}

interface SelectedOverlay {
  batched: BatchedMesh;
  material: MeshStandardMaterial;
}

export class Highlighter {
  private batched: BatchedMesh | null = null;
  private material: MeshStandardMaterial | null = null;
  private selectedOverlay: SelectedOverlay | null = null;
  private originalColors = new Map<number, [number, number, number, number]>();
  private hoveredIds = new Set<GroupId>();
  private selectedIds = new Set<GroupId>();
  private disposed = false;

  constructor(private deps: HighlighterDeps) {}

  attach(
    batched: BatchedMesh,
    material: MeshStandardMaterial,
    originalColors: Map<number, [number, number, number, number]>,
    selectedOverlay?: SelectedOverlay,
  ): void {
    this.batched = batched;
    this.material = material;
    this.selectedOverlay = selectedOverlay ?? null;
    this.originalColors = originalColors;
    if (selectedOverlay) {
      // Overlay material flags are constant for its lifetime; set once at
      // attach time rather than per-apply. The overlay always renders late,
      // ignores depth, and never sorts.
      selectedOverlay.material.transparent = true;
      selectedOverlay.material.depthTest = false;
      selectedOverlay.material.depthWrite = false;
      selectedOverlay.material.needsUpdate = true;
      selectedOverlay.batched.sortObjects = false;
    }
    this.apply();
  }

  detach(): void {
    this.batched = null;
    this.material = null;
    if (this.selectedOverlay) this.selectedOverlay.batched.visible = false;
    this.selectedOverlay = null;
    this.originalColors = new Map();
    this.hoveredIds.clear();
    this.selectedIds.clear();
  }

  getHovered(): GroupId[] {
    return Array.from(this.hoveredIds);
  }

  getSelected(): GroupId[] {
    return Array.from(this.selectedIds);
  }

  setHovered(ids: GroupId[]): void {
    if (sameSet(this.hoveredIds, ids)) return;
    this.hoveredIds = new Set(ids);
    this.apply();
  }

  setSelected(ids: GroupId[]): void {
    if (sameSet(this.selectedIds, ids)) return;
    this.selectedIds = new Set(ids);
    this.apply();
  }

  refresh(): void {
    this.apply();
  }

  private apply(): void {
    if (this.disposed || !this.batched || !this.material) return;
    const { THREE } = this.deps;
    const vec4 = new THREE.Vector4();

    const targets = new Set<number>();
    const collect = (id: GroupId) => {
      const r = this.deps.registry.get(id);
      if (!r) return;
      for (const b of r.batchIds) targets.add(b);
    };
    for (const hid of this.hoveredIds) collect(hid);
    for (const sid of this.selectedIds) collect(sid);

    const anyHighlight = targets.size > 0;
    if (!anyHighlight) {
      this.material.transparent = false;
      this.material.depthWrite = true;
      this.material.needsUpdate = true;
      this.batched.sortObjects = false;
      this.hideSelectedOverlay();
      for (const [id, rgba] of this.originalColors) {
        vec4.set(rgba[0], rgba[1], rgba[2], 1.0);
        this.batched.setColorAt(id, vec4);
      }
    } else {
      this.material.transparent = true;
      this.material.depthWrite = true;
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
      this.showSelectedOverlay(targets, tint, vec4);
    }

    this.deps.requestRender();
  }

  private hideSelectedOverlay(): void {
    const overlay = this.selectedOverlay;
    if (!overlay) return;
    overlay.batched.visible = false;
    for (const id of this.originalColors.keys()) {
      overlay.batched.setVisibleAt(id, false);
    }
  }

  private showSelectedOverlay(
    targets: Set<number>,
    tint: import('three').Color,
    vec4: import('three').Vector4,
  ): void {
    const overlay = this.selectedOverlay;
    if (!overlay || !this.batched) return;
    overlay.batched.visible = true;
    for (const id of this.originalColors.keys()) {
      // A selected instance only shows in the overlay if the primary batch
      // hasn't hidden it (e.g. user toggled visibility via Delete shortcut).
      const visible = targets.has(id) && this.batched.getVisibleAt(id);
      overlay.batched.setVisibleAt(id, visible);
      if (visible) {
        vec4.set(tint.r, tint.g, tint.b, 1.0);
        overlay.batched.setColorAt(id, vec4);
      }
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.detach();
  }
}

function sameSet(a: Set<GroupId>, b: GroupId[]): boolean {
  if (a.size !== b.length) return false;
  for (const x of b) if (!a.has(x)) return false;
  return true;
}
