/**
 * Owns the root THREE.Scene plus the named groups every other module attaches
 * children to. Lights and the environment map are also owned here so dispose
 * cascades cleanly.
 */

type Scene = import('three').Scene;
type Group = import('three').Group;
type Texture = import('three').Texture;
type Box3 = import('three').Box3;

const GROUPS = [
  'modelGroup',
  'edgeGroup',
  'floorGroup',
  'gizmoGroup',
  'highlightGroup',
  'leaderGroup',
  'snapGroup',
] as const;
export type GroupName = (typeof GROUPS)[number];

interface SceneGraphDeps {
  THREE: typeof import('three');
  RoomEnvironment: (typeof import('three/addons/environments/RoomEnvironment.js'))['RoomEnvironment'];
  renderer: import('three').WebGLRenderer;
}

export class SceneGraph {
  readonly scene: Scene;
  readonly groups: Record<GroupName, Group>;
  private readonly shadowLight: import('three').DirectionalLight;
  private envTexture: Texture | null = null;
  private disposed = false;

  constructor(private deps: SceneGraphDeps) {
    const { THREE, RoomEnvironment, renderer } = deps;
    const scene = new THREE.Scene();

    scene.add(new THREE.HemisphereLight(0xc8d8f0, 0x3a2820, 0.4));

    const shadowLight = new THREE.DirectionalLight(0xfff5e6, 1.2);
    shadowLight.castShadow = true;
    shadowLight.shadow.mapSize.setScalar(2048);
    shadowLight.shadow.radius = 4;
    shadowLight.shadow.bias = -0.0005;
    scene.add(shadowLight, shadowLight.target);

    const fill = new THREE.DirectionalLight(0xd0e0f8, 0.3);
    fill.position.set(-2, 4, -2);
    scene.add(fill);

    const rim = new THREE.DirectionalLight(0xffffff, 0.4);
    rim.position.set(-1, 3, -3);
    scene.add(rim);

    const pmrem = new THREE.PMREMGenerator(renderer);
    const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    scene.environment = envTex;
    scene.environmentIntensity = 0.15;
    this.envTexture = envTex;

    this.shadowLight = shadowLight;
    this.scene = scene;

    const groups = {} as Record<GroupName, Group>;
    for (const name of GROUPS) {
      const g = new THREE.Group();
      g.name = name;
      scene.add(g);
      groups[name] = g;
    }
    this.groups = groups;
  }

  addToGroup(name: GroupName, obj: import('three').Object3D): void {
    this.groups[name].add(obj);
  }

  /**
   * Position the shadow-casting directional light and tune its orthographic
   * shadow-camera frustum to match the given scene bounds. Called by Floor
   * after the scene is fit so shadows scale with the model.
   */
  updateShadowLight(bounds: Box3): void {
    const { THREE } = this.deps;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const pad = maxDim * 1.2;

    const sl = this.shadowLight;
    sl.position.set(
      center.x + maxDim * 1.5,
      center.y + maxDim * 3,
      center.z + maxDim * 1.5,
    );
    sl.target.position.copy(center);
    sl.target.updateWorldMatrix(false, false);
    const sc = sl.shadow.camera as import('three').OrthographicCamera;
    sc.left = -pad;
    sc.right = pad;
    sc.top = pad;
    sc.bottom = -pad;
    sc.near = maxDim * 0.1;
    sc.far = maxDim * 8;
    sc.updateProjectionMatrix();
  }

  removeFromGroup(name: GroupName, obj: import('three').Object3D): void {
    this.groups[name].remove(obj);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    const disposeChildren = (parent: import('three').Object3D) => {
      parent.traverse((child) => {
        const m = child as import('three').Mesh;
        if (m.isMesh) {
          m.geometry?.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat?.dispose();
        }
      });
    };

    for (const name of GROUPS) {
      disposeChildren(this.groups[name]);
      this.scene.remove(this.groups[name]);
    }

    if (this.envTexture) {
      this.envTexture.dispose();
      this.envTexture = null;
      this.scene.environment = null;
    }
  }
}
