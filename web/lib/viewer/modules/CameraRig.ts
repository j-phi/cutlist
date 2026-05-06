/**
 * Persp + ortho cameras and the OrbitControls that drive them. Owns view
 * presets, mode swap (preserving framing within ±5%), and fit-to-bounds.
 *
 * OrbitControls is configured with right-mouse=ROTATE, middle=PAN,
 * left-mouse=null (OnShape mapping). Left-button is reserved for
 * selection / gizmo and never engages the camera.
 */

import { easeInOut } from '~/lib/scene/easing';
import type { EventBus } from './EventBus';
import type { CameraMode, CameraPose, ViewerEvent, ViewPreset } from '../types';

type PerspectiveCamera = import('three').PerspectiveCamera;
type OrthographicCamera = import('three').OrthographicCamera;
type Vector3 = import('three').Vector3;
type OrbitControls =
  import('three/addons/controls/OrbitControls.js').OrbitControls;
type Box3 = import('three').Box3;

interface CameraRigDeps {
  THREE: typeof import('three');
  OrbitControls: typeof import('three/addons/controls/OrbitControls.js').OrbitControls;
  domElement: HTMLElement;
  bus: EventBus<ViewerEvent>;
  requestRender: () => void;
}

const PRESET_TWEEN_MS = 300;

const PRESET_DIRECTIONS: Record<
  ViewPreset,
  { dir: [number, number, number]; up: [number, number, number] }
> = {
  top: { dir: [0, 1, 0], up: [0, 0, -1] },
  bottom: { dir: [0, -1, 0], up: [0, 0, 1] },
  front: { dir: [0, 0, 1], up: [0, 1, 0] },
  back: { dir: [0, 0, -1], up: [0, 1, 0] },
  left: { dir: [-1, 0, 0], up: [0, 1, 0] },
  right: { dir: [1, 0, 0], up: [0, 1, 0] },
  iso: { dir: [1, 1, 1], up: [0, 1, 0] },
};

export class CameraRig {
  private mode: CameraMode = 'perspective';
  readonly perspective: PerspectiveCamera;
  readonly orthographic: OrthographicCamera;
  readonly controls: OrbitControls;
  private movingCamera = false;
  private tweenRaf = 0;
  private disposed = false;

  constructor(private deps: CameraRigDeps) {
    const { THREE, OrbitControls: OC, domElement } = deps;
    const rect = domElement.getBoundingClientRect();
    const aspect = rect.width / Math.max(rect.height, 1);

    this.perspective = new THREE.PerspectiveCamera(50, aspect, 0.001, 1000);
    this.perspective.position.set(2, 1.5, 2);

    this.orthographic = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 1000);
    this.orthographic.position.copy(this.perspective.position);

    const controls = new OC(this.perspective, domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;

    // OnShape-style: left=NULL (reserved for select/gizmo), middle=PAN, right=ROTATE.
    controls.mouseButtons = {
      LEFT: null as unknown as number,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
    };
    controls.touches = {
      ONE: THREE.TOUCH.ROTATE,
      TWO: THREE.TOUCH.DOLLY_PAN,
    };

    controls.addEventListener('change', () => deps.requestRender());
    controls.addEventListener('start', () => {
      this.movingCamera = true;
      deps.bus.emit({ type: 'user-interaction' });
    });
    controls.addEventListener('end', () => {
      this.movingCamera = false;
    });

    this.controls = controls;
  }

  get camera(): PerspectiveCamera | OrthographicCamera {
    return this.mode === 'perspective' ? this.perspective : this.orthographic;
  }

  active(): PerspectiveCamera | OrthographicCamera {
    return this.camera;
  }

  isMoving(): boolean {
    return this.movingCamera;
  }

  getCameraMode(): CameraMode {
    return this.mode;
  }

  setCameraMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    const old = this.camera;
    this.mode = mode;
    const next = this.camera;
    next.position.copy(old.position);
    next.up.copy(old.up);
    next.lookAt(this.controls.target);
    if (mode === 'orthographic') this.updateOrthoFrustum();
    (this.controls as unknown as { object: import('three').Camera }).object =
      next;
    next.updateProjectionMatrix();
    this.deps.requestRender();
  }

  /**
   * Sizes the orthographic frustum to match the perspective camera's
   * vertical extent at the current orbit distance, so a persp ↔ ortho
   * swap preserves framing.
   */
  private updateOrthoFrustum(): void {
    const { THREE } = this.deps;
    const dist = this.perspective.position.distanceTo(this.controls.target);
    const fov = THREE.MathUtils.degToRad(this.perspective.fov);
    const h = 2 * dist * Math.tan(fov / 2);
    const aspect = this.perspective.aspect;
    const w = h * aspect;
    this.orthographic.left = -w / 2;
    this.orthographic.right = w / 2;
    this.orthographic.top = h / 2;
    this.orthographic.bottom = -h / 2;
    this.orthographic.updateProjectionMatrix();
  }

  getPose(): CameraPose {
    const c = this.camera;
    const t = this.controls.target;
    return {
      position: [c.position.x, c.position.y, c.position.z],
      target: [t.x, t.y, t.z],
      zoom: c.zoom,
      up: [c.up.x, c.up.y, c.up.z],
    };
  }

  setPose(pose: CameraPose): void {
    this.camera.position.set(...pose.position);
    this.controls.target.set(...pose.target);
    if (pose.up) this.camera.up.set(...pose.up);
    this.camera.zoom = pose.zoom ?? 1;
    if (this.mode === 'orthographic') this.updateOrthoFrustum();
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.deps.requestRender();
  }

  /**
   * Snap-tween the camera to a named preset over 300ms. Preserves the
   * current orbit distance so a preset jump doesn't also rescale the model.
   */
  applyViewPreset(preset: ViewPreset, bounds?: Box3 | null): void {
    const { THREE } = this.deps;
    const def = PRESET_DIRECTIONS[preset];

    const target =
      bounds && !bounds.isEmpty()
        ? bounds.getCenter(new THREE.Vector3())
        : this.controls.target.clone();

    const orbitDist = this.camera.position.distanceTo(this.controls.target);
    const sizeDist =
      bounds && !bounds.isEmpty()
        ? bounds.getSize(new THREE.Vector3()).length() * 0.7
        : 4;
    const dist = orbitDist > 1e-4 ? orbitDist : sizeDist;

    const dir = new THREE.Vector3(...def.dir).normalize();
    const endPos = dir.multiplyScalar(dist).add(target);
    const endUp = new THREE.Vector3(...def.up);

    // ViewCube clicks bypass OrbitControls, so emit the same signal here so
    // scene authoring marks the active scene dirty.
    this.deps.bus.emit({ type: 'user-interaction' });
    this.tweenTo(endPos, target, endUp);
  }

  private tweenTo(endPos: Vector3, endTarget: Vector3, endUp: Vector3): void {
    if (this.tweenRaf) cancelAnimationFrame(this.tweenRaf);

    const startPos = this.camera.position.clone();
    const startTarget = this.controls.target.clone();
    const startUp = this.camera.up.clone();
    const startMs =
      typeof performance !== 'undefined' ? performance.now() : Date.now();

    const step = (now: number) => {
      if (this.disposed) return;
      const t = Math.min(1, (now - startMs) / PRESET_TWEEN_MS);
      const k = easeInOut(t);
      this.camera.position.lerpVectors(startPos, endPos, k);
      this.controls.target.lerpVectors(startTarget, endTarget, k);
      this.camera.up.lerpVectors(startUp, endUp, k).normalize();
      // Keep the inactive camera in sync so a mid-tween mode swap is sane.
      const other =
        this.mode === 'perspective' ? this.orthographic : this.perspective;
      other.position.copy(this.camera.position);
      other.up.copy(this.camera.up);

      if (this.mode === 'orthographic') this.updateOrthoFrustum();
      this.controls.update();
      this.deps.requestRender();

      if (t < 1) {
        this.tweenRaf = requestAnimationFrame(step);
      } else {
        this.tweenRaf = 0;
      }
    };
    this.tweenRaf = requestAnimationFrame(step);
  }

  fit(bounds: Box3 | null): void {
    if (!bounds || bounds.isEmpty()) return;
    const { THREE } = this.deps;
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    const fov = (this.perspective.fov * Math.PI) / 180;
    const dist = (maxDim / (2 * Math.tan(fov / 2))) * 1.5;

    this.perspective.position.set(
      center.x + dist * 0.7,
      center.y + dist * 0.5,
      center.z + dist * 0.7,
    );
    this.controls.target.copy(center);
    this.perspective.near = maxDim * 0.001;
    this.perspective.far = maxDim * 100;
    this.perspective.updateProjectionMatrix();

    this.orthographic.position.copy(this.perspective.position);
    this.orthographic.near = this.perspective.near;
    this.orthographic.far = this.perspective.far;
    this.updateOrthoFrustum();

    this.controls.update();
    this.deps.requestRender();
  }

  /** Normalized (target → position) direction of the current camera. */
  getDirection(): Vector3 {
    return new this.deps.THREE.Vector3()
      .subVectors(this.camera.position, this.controls.target)
      .normalize();
  }

  setControlsDamping(enabled: boolean): void {
    this.controls.enableDamping = enabled;
  }

  onResize(width: number, height: number): void {
    const aspect = width / Math.max(height, 1);
    this.perspective.aspect = aspect;
    this.perspective.updateProjectionMatrix();
    if (this.mode === 'orthographic') {
      this.updateOrthoFrustum();
    } else {
      // Keep ortho frustum aspect in sync even when inactive so a swap
      // doesn't flash a wrong aspect for one frame.
      const halfH = (this.orthographic.top - this.orthographic.bottom) / 2;
      this.orthographic.left = -halfH * aspect;
      this.orthographic.right = halfH * aspect;
      this.orthographic.updateProjectionMatrix();
    }
  }

  update(): void {
    this.controls.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.tweenRaf) cancelAnimationFrame(this.tweenRaf);
    this.controls.dispose();
  }
}
