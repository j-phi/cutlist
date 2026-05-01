/**
 * Renders the yellow hover indicator for the current snap target. One
 * vertex dot and one edge line, both depth-test-disabled so they read on
 * top of the model.
 *
 *   - vertex            → dot at the snapped world point.
 *   - edgeMidpoint      → dot + line over the whole edge segment.
 *   - edge              → line over the whole edge segment.
 *
 * Setting `null` hides both. The visuals share a `snapGroup` on the
 * SceneGraph; ViewerCore creates a single instance and routes
 * `setSnapHover` through it.
 */

import type { SceneGraph } from './SceneGraph';
import type { SnapTarget } from '../types';

type Points = import('three').Points;
type LineSegments2 =
  import('three/addons/lines/LineSegments2.js').LineSegments2;
type LineMaterial = import('three/addons/lines/LineMaterial.js').LineMaterial;
type LineSegmentsGeometry =
  import('three/addons/lines/LineSegmentsGeometry.js').LineSegmentsGeometry;
type CanvasTexture = import('three').CanvasTexture;
type PointsMaterial = import('three').PointsMaterial;

const SNAP_COLOR = 0xffd166;
const VERTEX_DOT_PX = 10;

interface SnapVisualsDeps {
  THREE: typeof import('three');
  LineSegmentsGeometry: typeof import('three/addons/lines/LineSegmentsGeometry.js').LineSegmentsGeometry;
  LineSegments2: typeof import('three/addons/lines/LineSegments2.js').LineSegments2;
  LineMaterial: typeof import('three/addons/lines/LineMaterial.js').LineMaterial;
  sceneGraph: SceneGraph;
  resolution: { width: number; height: number };
  requestRender: () => void;
}

export class SnapVisuals {
  private dot: Points;
  private dotMaterial: PointsMaterial;
  private dotGeometry: import('three').BufferGeometry;
  private dotTexture: CanvasTexture;
  private line: LineSegments2;
  private lineMaterial: LineMaterial;
  private lineGeometry: LineSegmentsGeometry;
  private disposed = false;

  constructor(private deps: SnapVisualsDeps) {
    const { THREE, sceneGraph, resolution } = deps;

    this.dotTexture = makeDiscTexture(THREE);
    this.dotMaterial = new THREE.PointsMaterial({
      size: VERTEX_DOT_PX,
      sizeAttenuation: false,
      map: this.dotTexture,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      color: SNAP_COLOR,
    });
    this.dotGeometry = new THREE.BufferGeometry();
    this.dotGeometry.setAttribute(
      'position',
      new THREE.Float32BufferAttribute([0, 0, 0], 3),
    );
    this.dot = new THREE.Points(this.dotGeometry, this.dotMaterial);
    this.dot.frustumCulled = false;
    this.dot.renderOrder = 100;
    this.dot.visible = false;

    this.lineMaterial = new deps.LineMaterial({
      color: SNAP_COLOR,
      linewidth: 3,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      resolution: new THREE.Vector2(resolution.width, resolution.height),
    });
    this.lineGeometry = new deps.LineSegmentsGeometry();
    this.lineGeometry.setPositions(new Float32Array([0, 0, 0, 0, 0, 0]));
    this.line = new deps.LineSegments2(this.lineGeometry, this.lineMaterial);
    this.line.frustumCulled = false;
    this.line.computeLineDistances();
    this.line.raycast = () => {};
    this.line.renderOrder = 99;
    this.line.visible = false;

    sceneGraph.groups.snapGroup.add(this.line);
    sceneGraph.groups.snapGroup.add(this.dot);
  }

  setHover(target: SnapTarget | null): void {
    if (this.disposed) return;
    if (!target) {
      if (this.dot.visible || this.line.visible) {
        this.dot.visible = false;
        this.line.visible = false;
        this.deps.requestRender();
      }
      return;
    }

    const wantsDot = target.kind === 'vertex' || target.kind === 'edgeMidpoint';
    const wantsLine = target.kind === 'edge' || target.kind === 'edgeMidpoint';

    if (wantsDot) {
      const [x, y, z] = target.worldPoint;
      const pos = this.dotGeometry.getAttribute(
        'position',
      ) as import('three').BufferAttribute;
      pos.setXYZ(0, x, y, z);
      pos.needsUpdate = true;
    }
    if (target.kind !== 'vertex') {
      const [ax, ay, az] = target.edgeA;
      const [bx, by, bz] = target.edgeB;
      this.lineGeometry.setPositions(
        new Float32Array([ax, ay, az, bx, by, bz]),
      );
    }

    this.dot.visible = wantsDot;
    this.line.visible = wantsLine;
    this.deps.requestRender();
  }

  onResize(width: number, height: number): void {
    if (this.disposed) return;
    this.lineMaterial.resolution.set(width, height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    const group = this.deps.sceneGraph.groups.snapGroup;
    group.remove(this.dot);
    group.remove(this.line);
    this.dotGeometry.dispose();
    this.dotMaterial.dispose();
    this.dotTexture.dispose();
    this.lineGeometry.dispose();
    this.lineMaterial.dispose();
  }
}

/**
 * Tiny circular sprite for the vertex dot — drawn once into a 32×32 canvas
 * and reused by the PointsMaterial.
 */
function makeDiscTexture(THREE: typeof import('three')): CanvasTexture {
  const size = 32;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const r = size / 2;
  const grad = ctx.createRadialGradient(r, r, 0, r, r, r);
  grad.addColorStop(0, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(0.6, 'rgba(255, 255, 255, 1)');
  grad.addColorStop(1, 'rgba(255, 255, 255, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(r, r, r, 0, Math.PI * 2);
  ctx.fill();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.minFilter = THREE.LinearFilter;
  return tex;
}
