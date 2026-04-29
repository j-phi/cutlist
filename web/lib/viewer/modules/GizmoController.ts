/**
 * Gizmo wrapper. Spec 06+ wires this to scene capture/apply; here it provides
 * the `setMode` / `resetSelectedOffsets` / `resetAllOffsets` surface and
 * delegates to TransformControls when a future spec attaches it. The current
 * Model tab does not surface a gizmo, so this is a structural placeholder
 * that disposes cleanly and is wired into ViewerCore for later use.
 */

import type { ObjectRegistry } from './ObjectRegistry';
import type { GizmoMode } from '../types';

interface GizmoDeps {
  registry: ObjectRegistry;
}

export class GizmoController {
  private mode: GizmoMode = 'translate';
  private disposed = false;

  constructor(private deps: GizmoDeps) {}

  setMode(mode: GizmoMode): void {
    this.mode = mode;
  }

  getMode(): GizmoMode {
    return this.mode;
  }

  resetSelectedOffsets(ids: number[]): void {
    for (const id of ids) this.deps.registry.setOffset(id, [0, 0, 0]);
  }

  resetAllOffsets(): void {
    for (const id of this.deps.registry.getAllIds()) {
      this.deps.registry.setOffset(id, [0, 0, 0]);
    }
  }

  dispose(): void {
    this.disposed = true;
  }
}
