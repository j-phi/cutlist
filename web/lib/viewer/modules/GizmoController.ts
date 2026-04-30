/**
 * Wraps Three.js TransformControls to provide drag-translate / drag-rotate of
 * the currently selected Object(s). Writes never bypass `ObjectRegistry` —
 * every per-tick drag update goes through `setOffset`, so BatchedMesh,
 * edge-line, and `object-moved` bus side effects all light up automatically.
 *
 * Pivot: rotation is conjugated around the **selection centroid** (T(c)·R·T(-c))
 * rather than the world origin so the gizmo feels like it pivots around the
 * grabbed part. The centroid is captured at drag-start.
 *
 * Camera coexistence: orbit/pan stays live except for the duration of a drag,
 * when OrbitControls is disabled so the left-button gizmo handles aren't
 * fighting OrbitControls' internal state machine.
 */

import type { ObjectRegistry } from './ObjectRegistry';
import type { SceneGraph } from './SceneGraph';
import type { GroupId } from '~/utils/types';
import type { GizmoMode } from '../types';

type Camera = import('three').Camera;
type Object3D = import('three').Object3D;
type Vector3 = import('three').Vector3;
type Quaternion = import('three').Quaternion;

interface TransformControlsLike {
  attach(obj: Object3D): unknown;
  detach(): unknown;
  setMode(mode: 'translate' | 'rotate'): void;
  addEventListener(type: string, cb: (e: { value?: boolean }) => void): void;
  removeEventListener(type: string, cb: (e: { value?: boolean }) => void): void;
  getHelper?(): Object3D;
  camera?: Camera;
  enabled?: boolean;
  size?: number;
  dispose?(): void;
}

interface CameraControlsLike {
  enabled: boolean;
}

interface GizmoDeps {
  THREE: typeof import('three');
  TransformControlsCtor: new (
    camera: Camera,
    domElement: HTMLElement,
  ) => TransformControlsLike;
  camera: Camera;
  domElement: HTMLElement;
  registry: ObjectRegistry;
  sceneGraph: SceneGraph;
  cameraControls: CameraControlsLike;
  /**
   * Acquire the viewer's interaction lock for the duration of a drag so
   * hover/pick is suppressed while the gizmo owns the pointer. Returns the
   * release function — must be called exactly once on drag end.
   */
  acquireInteractionLock?: () => () => void;
  requestRender: () => void;
}

const GIZMO_SIZE = 0.6;

interface DragStartState {
  pos: Vector3;
  quat: Quaternion;
}

export class GizmoController {
  private mode: GizmoMode = 'translate';
  private disposed = false;
  private selectedIds: GroupId[] = [];

  private proxy: Object3D;
  private controls: TransformControlsLike;
  private helper: Object3D | null = null;

  private dragging = false;
  private releaseLock: (() => void) | null = null;
  private proxyStartPos: Vector3;
  private proxyStartQuat: Quaternion;
  private centroidAtDragStart: Vector3;
  private startStates = new Map<GroupId, DragStartState>();

  private scratchPos: Vector3;
  private scratchQuat: Quaternion;
  private deltaQuat: Quaternion;
  private deltaPos: Vector3;
  private invStartQuat: Quaternion;

  private onObjectChange = (): void => this.applyDrag();
  private onDraggingChanged = (e: { value?: boolean }): void =>
    this.handleDraggingChanged(!!e.value);

  constructor(private deps: GizmoDeps) {
    const { THREE, TransformControlsCtor, camera, domElement, sceneGraph } =
      deps;

    this.proxy = new THREE.Object3D();
    this.proxy.name = 'GizmoProxy';
    sceneGraph.addToGroup('gizmoGroup', this.proxy);

    this.controls = new TransformControlsCtor(camera, domElement);
    this.controls.setMode('translate');
    if (this.controls.size !== undefined) this.controls.size = GIZMO_SIZE;

    if (typeof this.controls.getHelper === 'function') {
      const helper = this.controls.getHelper();
      if (helper) {
        this.helper = helper;
        sceneGraph.addToGroup('gizmoGroup', helper);
      }
    }

    this.controls.addEventListener('objectChange', this.onObjectChange);
    this.controls.addEventListener('dragging-changed', this.onDraggingChanged);

    // Start detached / hidden until something is selected.
    this.controls.detach();

    this.proxyStartPos = new THREE.Vector3();
    this.proxyStartQuat = new THREE.Quaternion();
    this.centroidAtDragStart = new THREE.Vector3();
    this.scratchPos = new THREE.Vector3();
    this.scratchQuat = new THREE.Quaternion();
    this.deltaQuat = new THREE.Quaternion();
    this.deltaPos = new THREE.Vector3();
    this.invStartQuat = new THREE.Quaternion();
  }

  setSelection(ids: GroupId[]): void {
    if (this.disposed) return;
    this.selectedIds = ids.slice();
    if (this.selectedIds.length === 0) {
      this.controls.detach();
      this.deps.requestRender();
      return;
    }
    this.syncProxyToCentroid();
    this.controls.attach(this.proxy);
    this.deps.requestRender();
  }

  setMode(mode: GizmoMode): void {
    this.mode = mode;
    this.controls.setMode(mode);
    this.deps.requestRender();
  }

  getMode(): GizmoMode {
    return this.mode;
  }

  /** Swap which camera the gizmo raycasts against (perspective ↔ orthographic). */
  setCamera(camera: Camera): void {
    this.controls.camera = camera;
  }

  resetSelectedOffsets(ids: GroupId[]): void {
    for (const id of ids) this.deps.registry.resetOffset(id);
    if (this.selectedIds.length > 0) this.syncProxyToCentroid();
  }

  resetAllOffsets(): void {
    for (const id of this.deps.registry.getAllIds()) {
      this.deps.registry.resetOffset(id);
    }
    if (this.selectedIds.length > 0) this.syncProxyToCentroid();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseLock?.();
    this.releaseLock = null;
    this.controls.removeEventListener('objectChange', this.onObjectChange);
    this.controls.removeEventListener(
      'dragging-changed',
      this.onDraggingChanged,
    );
    this.controls.detach();
    this.controls.dispose?.();
    if (this.helper) {
      this.deps.sceneGraph.removeFromGroup('gizmoGroup', this.helper);
      this.helper = null;
    }
    this.deps.sceneGraph.removeFromGroup('gizmoGroup', this.proxy);
    this.startStates.clear();
  }

  // ── Internals ────────────────────────────────────────────────────

  private syncProxyToCentroid(): void {
    const { THREE } = this.deps;
    const sum = new THREE.Vector3();
    const cur = new THREE.Vector3();
    let n = 0;
    for (const id of this.selectedIds) {
      const r = this.deps.registry.get(id);
      if (!r) continue;
      // Current world center = offsetMatrix · r.center. Plain
      // r.center + r.offset.position is wrong when the offset includes a
      // rotation (the centroid rotates with the object).
      cur.copy(r.center).applyMatrix4(r.offsetMatrix);
      sum.add(cur);
      n++;
    }
    if (n > 0) sum.divideScalar(n);
    this.proxy.position.copy(sum);
    this.proxy.quaternion.set(0, 0, 0, 1);
    this.proxy.updateMatrixWorld(true);
  }

  private handleDraggingChanged(value: boolean): void {
    this.dragging = value;
    this.deps.cameraControls.enabled = !value;
    if (!value) {
      this.startStates.clear();
      this.releaseLock?.();
      this.releaseLock = null;
      return;
    }

    this.releaseLock = this.deps.acquireInteractionLock?.() ?? null;
    this.proxyStartPos.copy(this.proxy.position);
    this.proxyStartQuat.copy(this.proxy.quaternion);
    this.centroidAtDragStart.copy(this.proxy.position);
    this.startStates.clear();
    for (const id of this.selectedIds) {
      const r = this.deps.registry.get(id);
      if (!r) continue;
      this.startStates.set(id, {
        pos: r.offset.position.clone(),
        quat: r.offset.quaternion.clone(),
      });
    }
  }

  private applyDrag(): void {
    if (!this.dragging) return;

    if (this.mode === 'translate') {
      this.deltaPos.copy(this.proxy.position).sub(this.proxyStartPos);
      for (const id of this.selectedIds) {
        const start = this.startStates.get(id);
        if (!start) continue;
        this.scratchPos.copy(start.pos).add(this.deltaPos);
        this.deps.registry.setOffset(id, {
          position: [this.scratchPos.x, this.scratchPos.y, this.scratchPos.z],
          quaternion: [start.quat.x, start.quat.y, start.quat.z, start.quat.w],
        });
      }
      return;
    }

    // rotate: ΔR = proxy.quaternion · proxyStartQuat^-1
    this.invStartQuat.copy(this.proxyStartQuat).invert();
    this.deltaQuat.copy(this.proxy.quaternion).multiply(this.invStartQuat);
    const c = this.centroidAtDragStart;

    for (const id of this.selectedIds) {
      const start = this.startStates.get(id);
      if (!start) continue;
      // nextPos = c + ΔR · (startPos - c)
      this.scratchPos
        .copy(start.pos)
        .sub(c)
        .applyQuaternion(this.deltaQuat)
        .add(c);
      // nextQuat = ΔR · startQuat
      this.scratchQuat.copy(this.deltaQuat).multiply(start.quat);
      this.deps.registry.setOffset(id, {
        position: [this.scratchPos.x, this.scratchPos.y, this.scratchPos.z],
        quaternion: [
          this.scratchQuat.x,
          this.scratchQuat.y,
          this.scratchQuat.z,
          this.scratchQuat.w,
        ],
      });
    }
  }
}
