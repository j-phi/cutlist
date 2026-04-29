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

import type { ObjectGraph } from '~/utils/types';
import { transformLocalToWorld } from './transforms';
import { EventBus } from './modules/EventBus';
import { Renderer } from './modules/Renderer';
import { SceneGraph } from './modules/SceneGraph';
import { ObjectRegistry } from './modules/ObjectRegistry';
import { CameraRig } from './modules/CameraRig';
import { InputRouter } from './modules/InputRouter';
import type { PickHandler } from './modules/InputRouter';
import { Highlighter } from './modules/Highlighter';
import { GizmoController } from './modules/GizmoController';
import { LeaderManager } from './modules/LeaderManager';
import { BatchLoader } from './modules/BatchLoader';
import { Floor } from './modules/Floor';
import type {
  CameraMode,
  CameraPose,
  GizmoMode,
  InteractionMode,
  ObjectId,
  PickResult,
  RenderedLeaderSpec,
  SnapEdgeResult,
  Vec3,
  ViewerEvent,
  ViewPreset,
} from './types';
import type { ObjectOffset } from '~/composables/useIdb';

type BatchedMesh = import('three').BatchedMesh;
type MeshStandardMaterial = import('three').MeshStandardMaterial;
type LineMaterial = import('three/addons/lines/LineMaterial.js').LineMaterial;

interface Modules {
  THREE: typeof import('three');
  OrbitControls: (typeof import('three/addons/controls/OrbitControls.js'))['OrbitControls'];
  TransformControls: (typeof import('three/addons/controls/TransformControls.js'))['TransformControls'];
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
    { TransformControls },
    { RoomEnvironment },
    { LineSegmentsGeometry },
    { LineSegments2 },
    { LineMaterial },
  ] = await Promise.all([
    import('three'),
    import('three/addons/controls/OrbitControls.js'),
    import('three/addons/controls/TransformControls.js'),
    import('three/addons/environments/RoomEnvironment.js'),
    import('three/addons/lines/LineSegmentsGeometry.js'),
    import('three/addons/lines/LineSegments2.js'),
    import('three/addons/lines/LineMaterial.js'),
  ]);
  _modules = {
    THREE,
    OrbitControls,
    TransformControls,
    RoomEnvironment,
    LineSegmentsGeometry,
    LineSegments2,
    LineMaterial,
  };
  return _modules;
}

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
  private batchLoader: BatchLoader | null = null;
  private floor: Floor | null = null;

  private batched: BatchedMesh | null = null;
  private batchMaterial: MeshStandardMaterial | null = null;
  private edgeMaterial: LineMaterial | null = null;
  private originalColors = new Map<number, [number, number, number, number]>();
  private batchToObjectId = new Map<number, ObjectId>();
  private sceneBounds: import('three').Box3 | null = null;
  private raycaster: import('three').Raycaster | null = null;
  private mouse: import('three').Vector2 | null = null;
  private loadGeneration = 0;
  private interactionLockCount = 0;
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
      oneScale: new THREE.Vector3(1, 1, 1),
      scratchMatrix: new THREE.Matrix4(),
    });

    this.highlighter = new Highlighter({
      THREE,
      registry: this.registry,
      requestRender: () => this.renderer?.requestRender(),
    });

    this.gizmo = new GizmoController({
      THREE,
      TransformControlsCtor:
        modules.TransformControls as unknown as ConstructorParameters<
          typeof GizmoController
        >[0]['TransformControlsCtor'],
      camera: this.cameraRig.camera,
      domElement: this.renderer.domElement,
      registry: this.registry,
      sceneGraph: this.sceneGraph,
      cameraControls: this.cameraRig.controls,
      acquireInteractionLock: () => this.acquireInteractionLock(),
      requestRender: () => this.renderer?.requestRender(),
    });

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

    this.batchLoader = new BatchLoader({
      THREE,
      LineSegmentsGeometry: modules.LineSegmentsGeometry,
      LineSegments2: modules.LineSegments2,
      batchMaterial: this.batchMaterial,
      edgeMaterial: this.edgeMaterial,
    });

    this.floor = new Floor({
      THREE,
      sceneGraph: this.sceneGraph,
      requestRender: () => this.renderer?.requestRender(),
    });

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    this.input = new InputRouter({
      domElement: this.renderer.domElement,
      bus: this.bus,
      raycast: (x, y) => this.raycastFromClient(x, y),
      isCameraMoving: () => !!this.cameraRig?.isMoving(),
      isInputLocked: () => this.interactionLockCount > 0,
    });

    this.renderer.onResize((w, h) => {
      this.cameraRig?.onResize(w, h);
      this.edgeMaterial?.resolution.set(w, h);
      this.leaders?.onResize(w, h);
    });

    // Pick events drive the highlighter; selection events too.
    this.bus.on('pick', (e) =>
      this.highlighter?.setHovered(e.result ? [e.result.groupId] : []),
    );
    this.bus.on('selection-changed', (e) =>
      this.highlighter?.setSelected(e.groupIds),
    );

    this.cameraRig.controls.addEventListener('end', () => {
      this.highlighter?.setHovered([]);
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
    const sceneGraph = this.sceneGraph!;
    const registry = this.registry!;
    const renderer = this.renderer!;
    const batchMaterial = this.batchMaterial!;

    const gen = ++this.loadGeneration;
    const result = this.batchLoader!.load(graph, partNumberOffset);
    if (!result) return;
    if (gen !== this.loadGeneration || this.disposed) return;

    for (const [batchId, groupId] of result.batchToObjectId)
      this.batchToObjectId.set(batchId, groupId);
    for (const [batchId, rgba] of result.originalColors)
      this.originalColors.set(batchId, rgba);
    for (const r of result.records) registry.register(r);
    for (const e of result.edgeLines) sceneGraph.addToGroup('edgeGroup', e);

    this.batched = result.batched;
    this.sceneBounds = result.sceneBounds;
    sceneGraph.addToGroup('modelGroup', result.batched);
    registry.attachBatched(result.batched);

    this.highlighter!.attach(
      result.batched,
      batchMaterial,
      this.originalColors,
    );
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
    if (this.cameraRig) this.gizmo?.setCamera(this.cameraRig.camera);
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
  getCameraDirection(): Vec3 {
    if (!this.cameraRig) return [0, 0, 1];
    const d = this.cameraRig.getDirection();
    return [d.x, d.y, d.z];
  }
  fit(): void {
    if (!this.cameraRig || !this.sceneBounds) return;
    this.cameraRig.fit(this.sceneBounds);
    this.floor?.update(this.sceneBounds);
  }

  // ── Floor ────────────────────────────────────────────────────────

  setFloorVisible(visible: boolean): void {
    this.floor?.setVisible(visible);
  }
  getFloorVisible(): boolean {
    return this.floor?.isVisible() ?? true;
  }

  // ── Selection / hover ────────────────────────────────────────────

  setSelectedObjects(ids: ObjectId[]): void {
    this.highlighter?.setSelected(ids);
    this.gizmo?.setSelection(ids);
    // Intentionally no `selection-changed` bus emit: the bus event is the
    // canvas-input signal (InputRouter is the sole emitter). Programmatic
    // setters update the highlighter directly; observers should watch the
    // store, not re-listen to the bus, to avoid loop-backs.
  }
  setHoveredObjects(ids: ObjectId[]): void {
    this.highlighter?.setHovered(ids);
  }
  setHoveredObject(id: ObjectId | null): void {
    this.highlighter?.setHovered(id == null ? [] : [id]);
  }

  // ── Visibility ───────────────────────────────────────────────────

  setObjectVisible(id: ObjectId, visible: boolean): void {
    if (!this.batched || !this.registry) return;
    const r = this.registry.get(id);
    if (!r) return;
    for (const b of r.batchIds) this.batched.setVisibleAt(b, visible);
    if (r.edgeLines) r.edgeLines.visible = visible;
    this.renderer?.requestRender();
  }

  setAllObjectsVisible(visible: boolean): void {
    if (!this.batched || !this.registry) return;
    this.registry.forEach((r) => {
      for (const b of r.batchIds) this.batched!.setVisibleAt(b, visible);
      if (r.edgeLines) r.edgeLines.visible = visible;
    });
    this.renderer?.requestRender();
  }

  /** Read-only snapshot of registered Objects (groupId, partNumber, name). */
  getObjects(): Array<{ groupId: ObjectId; partNumber: number; name: string }> {
    const out: Array<{
      groupId: ObjectId;
      partNumber: number;
      name: string;
    }> = [];
    this.registry?.forEach((r) => {
      out.push({ groupId: r.groupId, partNumber: r.partNumber, name: r.name });
    });
    return out;
  }

  partNumberOf(groupId: ObjectId): number | null {
    return this.registry?.get(groupId)?.partNumber ?? null;
  }

  groupIdsForPart(partNumber: number): ObjectId[] {
    if (!this.registry) return [];
    return this.registry.filterByPart(partNumber).map((r) => r.groupId);
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

  /**
   * Transform a point from an Object's local frame to world space, composing
   * its load-time `originalMatrix` with its current `offsetMatrix`. Returns
   * `null` if the Object isn't loaded.
   */
  objectLocalToWorld(groupId: ObjectId, local: Vec3): Vec3 | null {
    if (!this.registry || !this.modules) return null;
    const r = this.registry.get(groupId);
    if (!r) return null;
    const tmp = new this.modules.THREE.Vector3(local[0], local[1], local[2]);
    transformLocalToWorld(r, tmp, tmp);
    return [tmp.x, tmp.y, tmp.z];
  }

  // ── Object offsets / scene state ────────────────────────────────

  applyObjectOffsets(offsets: Map<ObjectId, ObjectOffset>): void {
    if (!this.registry) return;
    for (const [id, off] of offsets)
      this.registry.setOffset(id, {
        position: off.position,
        quaternion: off.quaternion,
      });
  }

  getObjectOffsets(): Map<ObjectId, ObjectOffset> {
    const out = new Map<ObjectId, ObjectOffset>();
    this.registry?.forEach((r) => {
      const p = r.offset.position;
      const q = r.offset.quaternion;
      out.set(r.groupId, {
        position: [p.x, p.y, p.z],
        quaternion: [q.x, q.y, q.z, q.w],
      });
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
  setInteractionMode(mode: InteractionMode, handler?: PickHandler): void {
    this.input?.setMode(mode, handler);
  }

  /**
   * Refcounted interaction lock. While the count is > 0, hover/pick is
   * suppressed (so a tool's drag isn't fighting the global highlight pass)
   * and pending-click recording is skipped (so a brief gizmo handle drag
   * doesn't trail a stray selection-changed). Used by GizmoController and
   * intended for future tools like annotation placement.
   */
  acquireInteractionLock(): () => void {
    this.interactionLockCount++;
    if (this.interactionLockCount === 1) {
      this.highlighter?.setHovered([]);
    }
    let released = false;
    return () => {
      if (released) return;
      released = true;
      this.interactionLockCount = Math.max(0, this.interactionLockCount - 1);
    };
  }

  // ── Annotations ──────────────────────────────────────────────────

  setRenderedLeaders(specs: Map<string, RenderedLeaderSpec>): void {
    this.leaders?.setRenderedLeaders(specs);
  }

  setLeaderOpacityScale(scale: number): void {
    this.leaders?.setOpacityScale(scale);
  }

  // ── Thumbnails ───────────────────────────────────────────────────

  captureThumbnail(width = 256, height = 256): string | null {
    if (!this.renderer || !this.cameraRig || !this.sceneGraph) return null;
    const r = this.renderer.renderer;
    const prevSize = r.getSize(new this.modules!.THREE.Vector2());
    // Resize the camera frustum too — `setSize` alone leaves camera.aspect
    // pointing at the live canvas, which would render wide content squashed
    // into the 4:3 thumbnail.
    r.setSize(width, height, false);
    this.cameraRig.onResize(width, height);
    // Hide selection visuals (gizmo + tint/ghost) so the thumbnail captures
    // the model cleanly regardless of what the user has selected. The
    // highlight is baked into per-instance BatchedMesh colors via
    // Highlighter, so we have to clear it (not just toggle a group's
    // visibility) and re-apply afterward.
    const gizmoGroup = this.sceneGraph.groups.gizmoGroup;
    const prevGizmoVisible = gizmoGroup.visible;
    gizmoGroup.visible = false;
    const prevHovered = this.highlighter?.getHovered() ?? [];
    const prevSelected = this.highlighter?.getSelected() ?? [];
    this.highlighter?.setHovered([]);
    this.highlighter?.setSelected([]);
    r.render(this.sceneGraph.scene, this.cameraRig.camera);
    const url = r.domElement.toDataURL('image/png');
    this.highlighter?.setHovered(prevHovered);
    this.highlighter?.setSelected(prevSelected);
    gizmoGroup.visible = prevGizmoVisible;
    r.setSize(prevSize.x, prevSize.y, false);
    this.cameraRig.onResize(prevSize.x, prevSize.y);
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
    this.floor?.dispose();

    this.cameraRig?.dispose();
    this.sceneGraph?.dispose();
    this.batchMaterial?.dispose();
    this.edgeMaterial?.dispose();
    this.renderer?.dispose();
    this.bus.dispose();

    this.ready = false;
  }
}
