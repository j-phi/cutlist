/**
 * One LineSegments2 per annotation, sharing a single LineMaterial. Spec 07
 * fills in the projector + cross-fade; this module owns the rendering surface
 * (the leaderGroup) and the reconcile API that future specs call.
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

export class LeaderManager {
  private material: LineMaterial;
  private lines = new Map<string, LineSegments2>();
  private opacityScale = 1;
  private disposed = false;

  constructor(private deps: LeaderDeps) {
    const { THREE, LineMaterial: LM, resolution } = deps;
    this.material = new LM({
      color: 0xffffff,
      linewidth: 2,
      transparent: true,
      opacity: BASE_LEADER_OPACITY,
      depthTest: true,
      resolution: new THREE.Vector2(resolution.width, resolution.height),
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
    this.material.opacity = BASE_LEADER_OPACITY * next;
    this.deps.requestRender();
  }

  setRenderedLeaders(specs: Map<string, RenderedLeaderSpec>): void {
    if (this.disposed) return;
    const seen = new Set<string>();
    for (const [id, spec] of specs) {
      seen.add(id);
      let line = this.lines.get(id);
      const positions = new Float32Array([
        spec.start[0],
        spec.start[1],
        spec.start[2],
        spec.end[0],
        spec.end[1],
        spec.end[2],
      ]);
      if (!line) {
        const geom = new this.deps.LineSegmentsGeometry();
        geom.setPositions(positions);
        line = new this.deps.LineSegments2(geom, this.material);
        line.computeLineDistances();
        line.raycast = () => {};
        this.deps.sceneGraph.addToGroup('leaderGroup', line);
        this.lines.set(id, line);
      } else {
        (
          line.geometry as InstanceType<typeof this.deps.LineSegmentsGeometry>
        ).setPositions(positions);
      }
    }
    for (const [id, line] of this.lines) {
      if (!seen.has(id)) {
        line.geometry.dispose();
        this.deps.sceneGraph.removeFromGroup('leaderGroup', line);
        this.lines.delete(id);
      }
    }
    this.deps.requestRender();
  }

  onResize(width: number, height: number): void {
    this.material.resolution.set(width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const line of this.lines.values()) {
      line.geometry.dispose();
      this.deps.sceneGraph.removeFromGroup('leaderGroup', line);
    }
    this.lines.clear();
    this.material.dispose();
  }
}
