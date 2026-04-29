/**
 * The plain TypeScript orchestrator that owns every Three.js object the viewer
 * uses. The Vue layer is a thin reactive shell over this class — no Three.js
 * leaks past `useThreeViewer.ts`.
 *
 * Module composition is wired in `init()` (async because Three.js + addons are
 * dynamic-imported). All public methods short-circuit to no-ops before init
 * resolves so the caller doesn't need to gate every interaction on a `ready`
 * flag.
 */

import type { ObjectGraph, ObjectNode } from '~/utils/types';
import { EventBus } from './modules/EventBus';
import { Renderer } from './modules/Renderer';
import { SceneGraph } from './modules/SceneGraph';
import { ObjectRegistry } from './modules/ObjectRegistry';
import { CameraRig } from './modules/CameraRig';
import { InputRouter } from './modules/InputRouter';
import { Highlighter } from './modules/Highlighter';
import { GizmoController } from './modules/GizmoController';
import { LeaderManager } from './modules/LeaderManager';
import type {
  CameraMode,
  CameraPose,
  GizmoMode,
  InteractionMode,
  ObjectId,
  ObjectRecord,
  PickResult,
  RenderedLeaderSpec,
  SnapEdgeResult,
  Vec3,
  ViewerEvent,
  ViewPreset,
} from './types';

type Mesh = import('three').Mesh;
type BatchedMesh = import('three').BatchedMesh;
type MeshStandardMaterial = import('three').MeshStandardMaterial;
type LineMaterial = import('three/addons/lines/LineMaterial.js').LineMaterial;
type LineSegmentsGeometry =
  import('three/addons/lines/LineSegmentsGeometry.js').LineSegmentsGeometry;
type LineSegments2Type =
  import('three/addons/lines/LineSegments2.js').LineSegments2;

interface Modules {
  THREE: typeof import('three');
  OrbitControls: (typeof import('three/addons/controls/OrbitControls.js'))['OrbitControls'];
  RoomEnvironment: (typeof import('three/addons/environments/RoomEnvironment.js'))['RoomEnvironment'];
  LineSegmentsGeometry: (typeof import('three/addons/lines/LineSegmentsGeometry.js'))['LineSegmentsGeometry'];
  LineSegments2: (typeof import('three/addons/lines/LineSegments2.js'))['LineSegments2'];
  LineMaterial: (typeof import('three/addons/lines/LineMaterial.js'))['LineMaterial'];
}

let _modules: Modules | null = null;
async function loadModules(): Promise<Modules> {
  if (_modules) return _modules;
  const [
    THREE,
    { OrbitControls },
    { RoomEnvironment },
    { LineSegmentsGeometry },
    { LineSegments2 },
    { LineMaterial },
  ] = await Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('three/addons/lines/LineSegmentsGeometry.js'),
    import('three/addons/lines/LineSegments2.js'),
    import('three/addons/lines/LineMaterial.js'),
  ]);
  _modules = {
    THREE,
    OrbitControls,
    RoomEnvironment,
    LineSegmentsGeometry,
    LineSegments2,
    LineMaterial,
  };
  return _modules;
}

const GRID_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec2 vWorldPos;
  void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const GRID_FRAGMENT_SHADER = `
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

export class ViewerCore {
  readonly bus = new EventBus<ViewerEvent>();
  ready = false;

  private modules: Modules | null = null;
  private renderer: Renderer | null = null;
  private sceneGraph: SceneGraph | null = null;
  private cameraRig: CameraRig | null = null;
  private input: InputRouter | null = null;
  private registry: ObjectRegistry | null = null;
  private highlighter: Highlighter | null = null;
  private gizmo: GizmoController | null = null;
  private leaders: LeaderManager | null = null;

  private batched: BatchedMesh | null = null;
  private batchMaterial: MeshStandardMaterial | null = null;
  private edgeMaterial: LineMaterial | null = null;
  private originalColors = new Map<number, [number, number, number, number]>();
  private batchToObjectId = new Map<number, ObjectId>();
  private sceneBounds: import('three').Box3 | null = null;
  private floorMesh: Mesh | null = null;
  private raycaster: import('three').Raycaster | null = null;
  private mouse: import('three').Vector2 | null = null;
  private loadGeneration = 0;
  private disposed = false;

  constructor(private container: HTMLElement) {
    void this.init();
  }

  private async init(): Promise<void> {
    const modules = await loadModules();
    if (this.disposed) return;
    this.modules = modules;
    const { THREE } = modules;

    this.renderer = new Renderer({
      THREE,
      container: this.container,
      bus: this.bus,
      onFrame: () => this.cameraRig?.update(),
    });

    this.sceneGraph = new SceneGraph({
      THREE,
      RoomEnvironment: modules.RoomEnvironment,
      renderer: this.renderer.renderer,
    });

    this.cameraRig = new CameraRig({
      THREE,
      OrbitControls: modules.OrbitControls,
      domElement: this.renderer.domElement,
      bus: this.bus,
      requestRender: () => this.renderer?.requestRender(),
    });

    this.registry = new ObjectRegistry({
      bus: this.bus,
      requestRender: () => this.renderer?.requestRender(),
    });

    this.highlighter = new Highlighter({
      THREE,
      registry: this.registry,
      requestRender: () => this.renderer?.requestRender(),
    });

    this.gizmo = new GizmoController({ registry: this.registry });

    const rect = this.container.getBoundingClientRect();
    this.leaders = new LeaderManager({
      THREE,
      LineSegmentsGeometry: modules.LineSegmentsGeometry,
      LineSegments2: modules.LineSegments2,
      LineMaterial: modules.LineMaterial,
      sceneGraph: this.sceneGraph,
      resolution: { width: rect.width, height: rect.height },
      requestRender: () => this.renderer?.requestRender(),
    });

    this.batchMaterial = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      metalness: 0.05,
      envMapIntensity: 0.3,
      polygonOffset: true,
      polygonOffsetFactor: 1,
      polygonOffsetUnits: 1,
    });

    this.edgeMaterial = new modules.LineMaterial({
      color: 0x1a1a2e,
      linewidth: 2,
      transparent: true,
      opacity: 0.6,
      depthWrite: false,
      resolution: new THREE.Vector2(rect.width, rect.height),
    });

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.input = new InputRouter({
      domElement: this.renderer.domElement,
      bus: this.bus,
      raycast: (x, y) => this.raycastFromClient(x, y),
      isCameraMoving: () => !!this.cameraRig?.isMoving(),
    });

    this.renderer.onResize((w, h) => {
      this.cameraRig?.onResize(w, h);
      this.edgeMaterial?.resolution.set(w, h);
      this.leaders?.onResize(w, h);
    });

    // Pick events drive the highlighter; selection events too.
    this.bus.on('pick', (e) =>
      this.highlighter?.setHovered(e.result?.groupId ?? null),
    );
    this.bus.on('selection-changed', (e) =>
      this.highlighter?.setSelected(e.groupIds),
    );

    this.cameraRig.controls.addEventListener('end', () => {
      this.highlighter?.setHovered(null);
    });

    this.renderer.start(() => {
      if (!this.cameraRig || !this.sceneGraph) return;
      this.renderer!.renderer.render(
        this.sceneGraph.scene,
        this.cameraRig.camera,
      );
    });

    this.ready = true;
  }

  // ── Public API ───────────────────────────────────────────────────

  on<T extends ViewerEvent['type']>(
    type: T,
    cb: (e: Extract<ViewerEvent, { type: T }>) => void,
  ): () => void {
    return this.bus.on(type, cb);
  }

  onFrame(cb: (dtMs: number) => void): () => void {
    return this.renderer?.onFrame(cb) ?? (() => {});
  }

  async loadModel(graph: ObjectGraph, partNumberOffset = 0): Promise<void> {
    if (!this.ready) await this.waitForReady();
    if (this.disposed) return;
    const modules = this.modules!;
    const { THREE } = modules;
    const sceneGraph = this.sceneGraph!;
    const registry = this.registry!;
    const renderer = this.renderer!;
    const cameraRig = this.cameraRig!;
    const batchMaterial = this.batchMaterial!;
    const edgeMaterial = this.edgeMaterial!;

    const gen = ++this.loadGeneration;

    // Build flat list of mesh slices with originating Object reference.
    interface Slice {
      object: ObjectNode;
      geometry: import('three').BufferGeometry;
      colorHex: string;
    }
    const slices: Slice[] = [];
    for (const obj of graph.objects) {
      for (const m of obj.meshes) {
        slices.push({
          object: obj,
          geometry: m.geometry,
          colorHex: m.colorHex,
        });
      }
    }
    if (slices.length === 0) return;

    // Normalize attributes — BatchedMesh requires consistent attribute sets.
    const allAttribs = new Set<string>();
    for (const s of slices) {
      for (const k of Object.keys(s.geometry.attributes)) allAttribs.add(k);
    }
    for (const s of slices) {
      for (const name of allAttribs) {
        if (s.geometry.attributes[name]) continue;
        const ref = slices.find((x) => x.geometry.attributes[name])!;
        const refAttr = ref.geometry.attributes[name];
        const count = s.geometry.attributes.position.count;
        s.geometry.setAttribute(
          name,
          new THREE.BufferAttribute(
            new Float32Array(count * refAttr.itemSize),
            refAttr.itemSize,
          ),
        );
      }
    }

    let totalVerts = 0;
    let totalIdx = 0;
    for (const s of slices) {
      totalVerts += s.geometry.attributes.position.count;
      totalIdx += s.geometry.index ? s.geometry.index.count : 0;
    }

    const batch = new THREE.BatchedMesh(
      slices.length,
      totalVerts,
      totalIdx > 0 ? totalIdx : undefined,
      batchMaterial,
    );
    batch.castShadow = true;
    batch.receiveShadow = true;
    batch.sortObjects = false;

    const colorScratch = new THREE.Color();
    const vec4 = new THREE.Vector4();
    const bounds = new THREE.Box3();
    const meshBox = new THREE.Box3();

    // Per-Object batchId aggregation.
    const idsByObject = new Map<ObjectId, number[]>();

    for (const s of slices) {
      const geometryId = batch.addGeometry(s.geometry);
      const instanceId = batch.addInstance(geometryId);
      batch.setMatrixAt(instanceId, s.object.originalMatrix);

      const hex = parseInt(s.colorHex.slice(1), 16);
      const sr = ((hex >> 16) & 0xff) / 255;
      const sg = ((hex >> 8) & 0xff) / 255;
      const sb = (hex & 0xff) / 255;
      colorScratch.setRGB(sr, sg, sb, THREE.SRGBColorSpace);
      vec4.set(colorScratch.r, colorScratch.g, colorScratch.b, 1.0);
      batch.setColorAt(instanceId, vec4);
      this.originalColors.set(instanceId, [
        colorScratch.r,
        colorScratch.g,
        colorScratch.b,
        1.0,
      ]);

      const groupId = s.object.groupId + partNumberOffset;
      this.batchToObjectId.set(instanceId, groupId);
      const list = idsByObject.get(groupId);
      if (list) list.push(instanceId);
      else idsByObject.set(groupId, [instanceId]);

      s.geometry.computeBoundingBox();
      if (s.geometry.boundingBox) {
        meshBox
          .copy(s.geometry.boundingBox)
          .applyMatrix4(s.object.originalMatrix);
        bounds.union(meshBox);
      }
    }

    if (gen !== this.loadGeneration || this.disposed) return;

    // Register ObjectRecords + build per-Object edge lines.
    for (const obj of graph.objects) {
      const groupId = obj.groupId + partNumberOffset;
      const partNumber = obj.partNumber + partNumberOffset;

      const center = new THREE.Vector3();
      meshBox.makeEmpty();
      for (const m of obj.meshes) {
        m.geometry.computeBoundingBox();
        if (m.geometry.boundingBox) {
          meshBox.union(
            meshBox
              .clone()
              .copy(m.geometry.boundingBox)
              .applyMatrix4(obj.originalMatrix),
          );
        }
      }
      if (!meshBox.isEmpty()) meshBox.getCenter(center);

      const originalMatrixInverse = new THREE.Matrix4()
        .copy(obj.originalMatrix)
        .invert();

      let edgeLines: LineSegments2Type | null = null;
      if (obj.edgesLocal.length > 0) {
        const lsg = new modules.LineSegmentsGeometry();
        // edgesLocal is in source-mesh local space; bake the originalMatrix
        // into a world-space copy so the rendered LineSegments2 only needs to
        // be translated by the Object's offset.
        const baked = new Float32Array(obj.edgesLocal.length);
        const v = new THREE.Vector3();
        for (let i = 0; i < obj.edgesLocal.length; i += 3) {
          v.set(
            obj.edgesLocal[i],
            obj.edgesLocal[i + 1],
            obj.edgesLocal[i + 2],
          ).applyMatrix4(obj.originalMatrix);
          baked[i] = v.x;
          baked[i + 1] = v.y;
          baked[i + 2] = v.z;
        }
        lsg.setPositions(baked);
        edgeLines = new modules.LineSegments2(lsg, edgeMaterial);
        edgeLines.computeLineDistances();
        edgeLines.raycast = () => {};
        edgeLines.castShadow = false;
        edgeLines.renderOrder = 1;
        sceneGraph.addToGroup('edgeGroup', edgeLines);
      }

      const record: ObjectRecord = {
        groupId,
        partNumber,
        name: obj.name,
        batchIds: idsByObject.get(groupId) ?? [],
        originalMatrix: obj.originalMatrix.clone(),
        originalMatrixInverse,
        center,
        offset: new THREE.Vector3(0, 0, 0),
        edgesLocal: obj.edgesLocal,
        edgeLines,
      };
      registry.register(record);
    }

    this.batched = batch;
    this.sceneBounds = bounds;
    sceneGraph.addToGroup('modelGroup', batch);

    this.highlighter!.attach(batch, batchMaterial, this.originalColors);
    this.fit();
    renderer.requestRender();
  }

  clearModels(): void {
    if (!this.modules) return;
    this.loadGeneration++;

    if (this.batched) {
      this.batched.geometry.dispose();
      this.sceneGraph?.removeFromGroup('modelGroup', this.batched);
      this.batched = null;
    }
    this.registry?.clear();
    this.batchToObjectId.clear();
    this.originalColors.clear();
    this.sceneBounds = null;
    this.highlighter?.detach();
    this.renderer?.requestRender();
  }

  // ── Camera ───────────────────────────────────────────────────────

  getCameraMode(): CameraMode {
    return this.cameraRig?.getCameraMode() ?? 'perspective';
  }
  setCameraMode(mode: CameraMode): void {
    this.cameraRig?.setCameraMode(mode);
  }
  getCameraPose(): CameraPose {
    return (
      this.cameraRig?.getPose() ?? {
        position: [0, 0, 0],
        target: [0, 0, 0],
      }
    );
  }
  setCameraPose(pose: CameraPose): void {
    this.cameraRig?.setPose(pose);
  }
  applyViewPreset(preset: ViewPreset): void {
    this.cameraRig?.applyViewPreset(preset, this.sceneBounds);
  }
  fit(): void {
    if (!this.cameraRig || !this.sceneBounds) return;
    this.cameraRig.fit(this.sceneBounds);
    this.updateFloor();
  }

  // ── Floor ────────────────────────────────────────────────────────

  setFloorVisible(visible: boolean): void {
    if (this.floorMesh) this.floorMesh.visible = visible;
    this.renderer?.requestRender();
  }
  getFloorVisible(): boolean {
    return this.floorMesh?.visible ?? true;
  }

  private updateFloor(): void {
    if (!this.modules || !this.sceneGraph || !this.sceneBounds) return;
    const { THREE } = this.modules;
    const box = this.sceneBounds;
    if (box.isEmpty()) return;
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const floorY = box.min.y - maxDim * 0.001;
    const floorSize = maxDim * 5;

    if (!this.floorMesh) {
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
      this.floorMesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), gridMat);
      this.floorMesh.rotation.x = -Math.PI / 2;
      this.sceneGraph.addToGroup('floorGroup', this.floorMesh);

      const shadowPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.ShadowMaterial({ opacity: 0.5 }),
      );
      shadowPlane.receiveShadow = true;
      shadowPlane.renderOrder = 1;
      this.floorMesh.add(shadowPlane);
    }

    this.floorMesh.position.set(center.x, floorY, center.z);
    this.floorMesh.scale.set(floorSize, floorSize, 1);

    const pad = maxDim * 1.2;
    const sl = this.sceneGraph.shadowLight;
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

  // ── Selection / hover ────────────────────────────────────────────

  setSelectedObjects(ids: ObjectId[]): void {
    this.highlighter?.setSelected(ids);
    this.bus.emit({ type: 'selection-changed', groupIds: ids });
  }
  setHoveredObject(id: ObjectId | null): void {
    this.highlighter?.setHovered(id);
  }

  // ── Raycast / snap ───────────────────────────────────────────────

  raycastFromClient(clientX: number, clientY: number): PickResult | null {
    if (!this.batched || !this.cameraRig || !this.raycaster || !this.mouse)
      return null;
    const rect = this.renderer!.domElement.getBoundingClientRect();
    this.mouse.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.mouse.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.mouse, this.cameraRig.camera);
    const hits = this.raycaster.intersectObject(this.batched, false);
    if (hits.length === 0) return null;
    const hit = hits[0] as import('three').Intersection & {
      batchId?: number;
    };
    if (hit.batchId == null) return null;
    const groupId = this.batchToObjectId.get(hit.batchId);
    if (groupId == null) return null;
    return {
      groupId,
      worldPoint: hit.point.clone(),
      worldNormal:
        hit.face?.normal.clone() ?? new this.modules!.THREE.Vector3(0, 1, 0),
    };
  }

  findSnapEdge(_clientX: number, _clientY: number): SnapEdgeResult | null {
    // Filled in by Spec 09.
    return null;
  }

  unprojectToPlane(
    _clientX: number,
    _clientY: number,
    _planePoint: Vec3,
    _planeNormal: Vec3,
  ): Vec3 | null {
    return null;
  }

  worldToScreen(
    world: Vec3,
  ): { x: number; y: number; inFront: boolean } | null {
    if (!this.cameraRig || !this.renderer || !this.modules) return null;
    const v = new this.modules.THREE.Vector3(world[0], world[1], world[2]);
    v.project(this.cameraRig.camera);
    const rect = this.renderer.domElement.getBoundingClientRect();
    return {
      x: (v.x * 0.5 + 0.5) * rect.width,
      y: (-v.y * 0.5 + 0.5) * rect.height,
      inFront: v.z < 1,
    };
  }

  // ── Object offsets / scene state ────────────────────────────────

  applyObjectOffsets(offsets: Map<ObjectId, Vec3>): void {
    if (!this.registry) return;
    for (const [id, off] of offsets) this.registry.setOffset(id, off);
  }

  getObjectOffsets(): Map<ObjectId, Vec3> {
    const out = new Map<ObjectId, Vec3>();
    this.registry?.forEach((r) => {
      out.set(r.groupId, [r.offset.x, r.offset.y, r.offset.z]);
    });
    return out;
  }

  // ── Gizmo / interaction mode ─────────────────────────────────────

  setGizmoMode(mode: GizmoMode): void {
    this.gizmo?.setMode(mode);
  }
  resetSelectedOffsets(ids: ObjectId[]): void {
    this.gizmo?.resetSelectedOffsets(ids);
  }
  resetAllOffsets(): void {
    this.gizmo?.resetAllOffsets();
  }
  setInteractionMode(mode: InteractionMode): void {
    this.input?.setMode(mode);
  }

  // ── Annotations ──────────────────────────────────────────────────

  setRenderedLeaders(specs: Map<string, RenderedLeaderSpec>): void {
    this.leaders?.setRenderedLeaders(specs);
  }

  // ── Thumbnails ───────────────────────────────────────────────────

  captureThumbnail(width = 256, height = 256): string | null {
    if (!this.renderer || !this.cameraRig || !this.sceneGraph) return null;
    const r = this.renderer.renderer;
    const prevSize = r.getSize(new this.modules!.THREE.Vector2());
    r.setSize(width, height, false);
    r.render(this.sceneGraph.scene, this.cameraRig.camera);
    const url = r.domElement.toDataURL('image/png');
    r.setSize(prevSize.x, prevSize.y, false);
    this.renderer.requestRender();
    return url;
  }

  // ── Lifecycle ────────────────────────────────────────────────────

  private async waitForReady(): Promise<void> {
    if (this.ready) return;
    await new Promise<void>((resolve) => {
      const check = () => {
        if (this.ready || this.disposed) resolve();
        else setTimeout(check, 16);
      };
      check();
    });
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;

    this.input?.dispose();
    this.gizmo?.dispose();
    this.highlighter?.dispose();
    this.leaders?.dispose();

    if (this.batched) {
      this.batched.geometry.dispose();
      this.sceneGraph?.removeFromGroup('modelGroup', this.batched);
      this.batched = null;
    }
    this.registry?.clear();

    if (this.floorMesh) {
      this.floorMesh.geometry.dispose();
      (this.floorMesh.material as import('three').Material).dispose();
      for (const child of [...this.floorMesh.children]) {
        const m = child as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          for (const mat of mats) mat?.dispose();
        }
      }
      this.sceneGraph?.removeFromGroup('floorGroup', this.floorMesh);
      this.floorMesh = null;
    }

    this.cameraRig?.dispose();
    this.sceneGraph?.dispose();
    this.batchMaterial?.dispose();
    this.edgeMaterial?.dispose();
    this.renderer?.dispose();
    this.bus.dispose();

    this.ready = false;
  }
}
