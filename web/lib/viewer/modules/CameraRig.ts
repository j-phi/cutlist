/**
 * Persp + ortho cameras and the OrbitControls that drive them. Spec 04 will
 * fill in view presets, ortho mode, and fit-to-bounds tween polish; this
 * version provides the surface (`getCameraMode`, `setCameraMode`, `getPose`,
 * `setPose`, `applyViewPreset`, `fit`) so callers can be wired up now.
 *
 * OrbitControls is configured with right-mouse=ROTATE, middle=PAN, left=NULL
 * (Spec 03's OnShape mapping). Left-button is reserved for selection / gizmo.
 */

import type { EventBus } from './EventBus';
import type { CameraMode, CameraPose, ViewerEvent, ViewPreset } from '../types';

type PerspectiveCamera = import('three').PerspectiveCamera;
type OrthographicCamera = import('three').OrthographicCamera;
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

export class CameraRig {
  private mode: CameraMode = 'perspective';
  readonly perspective: PerspectiveCamera;
  readonly orthographic: OrthographicCamera;
  readonly controls: OrbitControls;
  private movingCamera = false;
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
    controls.dampingFactor = 0.1;

    // OnShape-style: left=NULL (reserved for select/gizmo), middle=PAN, right=ROTATE.
    controls.mouseButtons = {
      LEFT: null as unknown as number,
      MIDDLE: THREE.MOUSE.PAN,
      RIGHT: THREE.MOUSE.ROTATE,
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

  isMoving(): boolean {
    return this.movingCamera;
  }

  getCameraMode(): CameraMode {
    return this.mode;
  }

  setCameraMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    // OrbitControls binds one camera at construction; swap by re-targeting.
    (this.controls as unknown as { object: import('three').Camera }).object =
      this.camera;
    this.deps.requestRender();
  }

  getPose(): CameraPose {
    const c = this.camera;
    const t = this.controls.target;
    return {
      position: [c.position.x, c.position.y, c.position.z],
      target: [t.x, t.y, t.z],
    };
  }

  setPose(pose: CameraPose): void {
    this.camera.position.set(...pose.position);
    this.controls.target.set(...pose.target);
    this.controls.update();
    this.deps.requestRender();
  }

  applyViewPreset(preset: ViewPreset, bounds?: Box3 | null): void {
    const t =
      bounds && !bounds.isEmpty()
        ? bounds.getCenter(new this.deps.THREE.Vector3())
        : new this.deps.THREE.Vector3();
    const size =
      bounds && !bounds.isEmpty()
        ? bounds.getSize(new this.deps.THREE.Vector3()).length()
        : 4;
    const dist = size * 1.2 || 4;
    const pos = new this.deps.THREE.Vector3();
    switch (preset) {
      case 'front':
        pos.set(0, 0, dist);
        break;
      case 'back':
        pos.set(0, 0, -dist);
        break;
      case 'left':
        pos.set(-dist, 0, 0);
        break;
      case 'right':
        pos.set(dist, 0, 0);
        break;
      case 'top':
        pos.set(0, dist, 0);
        break;
      case 'bottom':
        pos.set(0, -dist, 0);
        break;
      case 'iso':
        pos.set(dist * 0.7, dist * 0.5, dist * 0.7);
        break;
    }
    pos.add(t);
    this.setPose({
      position: [pos.x, pos.y, pos.z],
      target: [t.x, t.y, t.z],
    });
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

    // Mirror onto ortho camera so a mode swap is reasonable.
    this.orthographic.position.copy(this.perspective.position);
    const halfH = maxDim * 0.7;
    const aspect = this.perspective.aspect;
    this.orthographic.left = -halfH * aspect;
    this.orthographic.right = halfH * aspect;
    this.orthographic.top = halfH;
    this.orthographic.bottom = -halfH;
    this.orthographic.near = this.perspective.near;
    this.orthographic.far = this.perspective.far;
    this.orthographic.updateProjectionMatrix();

    this.controls.update();
    this.deps.requestRender();
  }

  onResize(width: number, height: number): void {
    const aspect = width / Math.max(height, 1);
    this.perspective.aspect = aspect;
    this.perspective.updateProjectionMatrix();
    const halfH = (this.orthographic.top - this.orthographic.bottom) / 2;
    this.orthographic.left = -halfH * aspect;
    this.orthographic.right = halfH * aspect;
    this.orthographic.updateProjectionMatrix();
  }

  update(): void {
    this.controls.update();
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.controls.dispose();
  }
}
