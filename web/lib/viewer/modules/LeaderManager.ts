/**
 * One LineSegments2 per annotation segment, sharing a small pool of
 * LineMaterials (solid + dashed). Spec 07 fills in the projector + cross-fade;
 * this module owns the rendering surface (the leaderGroup) and the reconcile
 * API that future specs call.
 *
 * Dashed segments are required by dimension witness lines (Spec 09) — the
 * `dashed` flag on `RenderedLeaderSpec` picks the material, and
 * `computeLineDistances()` is re-run after every position update so the dash
 * pattern stays consistent as the geometry resizes.
 */

import type { SceneGraph } from './SceneGraph';
import type { RenderedLeaderSpec } from '../types';

type LineSegments2 =
  import('three/addons/lines/LineSegments2.js').LineSegments2;
type LineMaterial = import('three/addons/lines/LineMaterial.js').LineMaterial;

interface LeaderDeps {
  THREE: typeof import('three');
  LineSegmentsGeometry: typeof import('three/addons/lines/LineSegmentsGeometry.js').LineSegmentsGeometry;
  LineSegments2: typeof import('three/addons/lines/LineSegments2.js').LineSegments2;
  LineMaterial: typeof import('three/addons/lines/LineMaterial.js').LineMaterial;
  sceneGraph: SceneGraph;
  resolution: { width: number; height: number };
  requestRender: () => void;
}

const BASE_LEADER_OPACITY = 0.9;

interface ManagedLine {
  line: LineSegments2;
  /** Whether the line was last rendered using the dashed material. */
  dashed: boolean;
}

export class LeaderManager {
  private solid: LineMaterial;
  private dashed: LineMaterial;
  private lines = new Map<string, ManagedLine>();
  private opacityScale = 1;
  private disposed = false;

  constructor(private deps: LeaderDeps) {
    const { THREE, LineMaterial: LM, resolution } = deps;
    this.solid = new LM({
      color: 0xffffff,
      linewidth: 2,
      transparent: true,
      opacity: BASE_LEADER_OPACITY,
      depthTest: true,
      resolution: new THREE.Vector2(resolution.width, resolution.height),
    });
    this.dashed = new LM({
      color: 0xffffff,
      linewidth: 1.5,
      transparent: true,
      opacity: BASE_LEADER_OPACITY,
      depthTest: true,
      resolution: new THREE.Vector2(resolution.width, resolution.height),
      dashed: true,
      dashSize: 0.025,
      gapSize: 0.018,
    });
  }

  /**
   * Multiply the global leader opacity by `scale ∈ [0, 1]`. Used by the
   * AnnotationLabels overlay to drive the cross-fade during a scene tween:
   * leaders share one material so we can't fade individuals independently,
   * which is fine for v1 since the AnnotationLabels overlay swaps the active
   * scene's leader set at the tween midpoint.
   */
  setOpacityScale(scale: number): void {
    if (this.disposed) return;
    const next = Math.max(0, Math.min(1, scale));
    if (this.opacityScale === next) return;
    this.opacityScale = next;
    this.solid.opacity = BASE_LEADER_OPACITY * next;
    this.dashed.opacity = BASE_LEADER_OPACITY * next;
    this.deps.requestRender();
  }

  setRenderedLeaders(specs: Map<string, RenderedLeaderSpec>): void {
    if (this.disposed) return;
    const seen = new Set<string>();
    for (const [id, spec] of specs) {
      seen.add(id);
      const wantsDashed = spec.dashed === true;
      const positions = new Float32Array([
        spec.start[0],
        spec.start[1],
        spec.start[2],
        spec.end[0],
        spec.end[1],
        spec.end[2],
      ]);
      const existing = this.lines.get(id);
      // Material can change between frames (e.g. the on-edge dimension
      // mode swaps tick caps for witness lines mid-drag). When that happens
      // we recreate the LineSegments2 — `LineMaterial` and `LineMaterial
      // dashed` share most state but Three.js doesn't hot-swap cleanly.
      if (existing && existing.dashed !== wantsDashed) {
        existing.line.geometry.dispose();
        this.deps.sceneGraph.removeFromGroup('leaderGroup', existing.line);
        this.lines.delete(id);
      }
      let managed = this.lines.get(id);
      if (!managed) {
        const geom = new this.deps.LineSegmentsGeometry();
        geom.setPositions(positions);
        const mat = wantsDashed ? this.dashed : this.solid;
        const line = new this.deps.LineSegments2(geom, mat);
        line.computeLineDistances();
        line.raycast = () => {};
        line.frustumCulled = false;
        this.deps.sceneGraph.addToGroup('leaderGroup', line);
        managed = { line, dashed: wantsDashed };
        this.lines.set(id, managed);
      } else {
        const geom = managed.line.geometry as InstanceType<
          typeof this.deps.LineSegmentsGeometry
        >;
        geom.setPositions(positions);
        // Recompute line distances so the dash pattern stays consistent
        // when the segment length changes mid-drag.
        managed.line.computeLineDistances();
      }
    }
    for (const [id, managed] of this.lines) {
      if (!seen.has(id)) {
        managed.line.geometry.dispose();
        this.deps.sceneGraph.removeFromGroup('leaderGroup', managed.line);
        this.lines.delete(id);
      }
    }
    this.deps.requestRender();
  }

  onResize(width: number, height: number): void {
    this.solid.resolution.set(width, height);
    this.dashed.resolution.set(width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const managed of this.lines.values()) {
      managed.line.geometry.dispose();
      this.deps.sceneGraph.removeFromGroup('leaderGroup', managed.line);
    }
    this.lines.clear();
    this.solid.dispose();
    this.dashed.dispose();
  }
}
