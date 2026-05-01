/**
 * The grid + shadow floor under the model. Owns the shaders, the lazy mesh
 * creation, and the shadow-light bounds tuning that scales with the scene's
 * size. ViewerCore calls `update(bounds)` after fit; nothing else touches
 * floor geometry directly.
 */

import type { SceneGraph } from './SceneGraph';

type Box3 = import('three').Box3;
type Mesh = import('three').Mesh;

const GRID_VERTEX_SHADER = /* glsl */ `
  varying vec2 vUv;
  varying vec2 vWorldPos;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GRID_FRAGMENT_SHADER = /* glsl */ `
  uniform vec3 uColor1;
  uniform vec3 uColor2;
  uniform float uGridSize;
  uniform float uLineWidth;
  varying vec2 vUv;
  varying vec2 vWorldPos;

  void main() {
    float distUV = length(vUv - 0.5) * 2.0;

    vec2 grid = abs(fract(vWorldPos / uGridSize - 0.5) - 0.5);
    float line = min(grid.x, grid.y);
    float gridMask = 1.0 - smoothstep(0.0, uLineWidth / uGridSize, line);

    float gridFade = 1.0 - smoothstep(0.15, 0.85, distUV);
    gridFade *= gridFade;

    float spotAlpha = 1.0 - smoothstep(0.0, 1.0, distUV);
    spotAlpha *= spotAlpha;
    float spotGlow = spotAlpha * 0.15;

    float gridAlpha = gridMask * gridFade * 0.45;

    vec3 color = mix(uColor2, uColor1, gridMask * gridFade);
    float alpha = max(spotGlow, gridAlpha);

    gl_FragColor = vec4(color, alpha);
  }
`;

interface FloorDeps {
  THREE: typeof import('three');
  sceneGraph: SceneGraph;
  requestRender: () => void;
}

export class Floor {
  private mesh: Mesh | null = null;
  private disposed = false;

  constructor(private deps: FloorDeps) {}

  setVisible(visible: boolean): void {
    if (this.mesh) this.mesh.visible = visible;
    this.deps.requestRender();
  }

  isVisible(): boolean {
    return this.mesh?.visible ?? true;
  }

  /**
   * Position the floor mesh under the scene bounds and tune the shadow-light
   * frustum to match. Lazily creates the mesh on first call.
   */
  update(bounds: Box3 | null): void {
    if (this.disposed) return;
    const { THREE, sceneGraph } = this.deps;
    if (!bounds || bounds.isEmpty()) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const floorY = bounds.min.y - maxDim * 0.001;
    const floorSize = maxDim * 5;

    if (!this.mesh) {
      const gridMat = new THREE.ShaderMaterial({
        uniforms: {
          uColor1: { value: new THREE.Color(0x2dd4bf) },
          uColor2: { value: new THREE.Color(0x14b8a6) },
          uGridSize: { value: 0.1 },
          uLineWidth: { value: 0.004 },
        },
        vertexShader: GRID_VERTEX_SHADER,
        fragmentShader: GRID_FRAGMENT_SHADER,
        transparent: true,
        depthWrite: false,
        side: THREE.FrontSide,
      });
      this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gridMat);
      this.mesh.rotation.x = -Math.PI / 2;
      sceneGraph.addToGroup('floorGroup', this.mesh);

      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShadowMaterial({ opacity: 0.5 }),
      );
      shadowPlane.receiveShadow = true;
      shadowPlane.renderOrder = 1;
      this.mesh.add(shadowPlane);
    }

    this.mesh.position.set(center.x, floorY, center.z);
    this.mesh.scale.set(floorSize, floorSize, 1);

    sceneGraph.updateShadowLight(bounds);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (!this.mesh) return;
    this.mesh.geometry.dispose();
    (this.mesh.material as import('three').Material).dispose();
    for (const child of [...this.mesh.children]) {
      const m = child as Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mats = Array.isArray(m.material) ? m.material : [m.material];
        for (const mat of mats) mat?.dispose();
      }
    }
    this.deps.sceneGraph.removeFromGroup('floorGroup', this.mesh);
    this.mesh = null;
  }
}
