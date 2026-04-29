/**
 * Pointer routing for the viewer canvas. Spec 03 layers in the OnShape-style
 * click-vs-drag threshold and the pick-mode FSM; this version provides the
 * minimum surface — pointer-move emits hover picks, click emits select picks
 * — and a `setMode` switch for future kinds (`'pick'` mode hands raw events
 * to a registered handler instead of toggling selection).
 */

import type { EventBus } from './EventBus';
import type { InteractionMode, PickResult, ViewerEvent } from '../types';

interface InputRouterDeps {
  domElement: HTMLElement;
  bus: EventBus<ViewerEvent>;
  raycast: (clientX: number, clientY: number) => PickResult | null;
  /** True while OrbitControls is mid-drag — suppresses hover updates. */
  isCameraMoving: () => boolean;
}

export class InputRouter {
  private mode: InteractionMode = 'select';
  private rafPending = false;
  private lastPointer: PointerEvent | null = null;
  private pickHandler: ((event: PointerEvent) => void) | null = null;
  private disposed = false;

  constructor(private deps: InputRouterDeps) {
    deps.domElement.addEventListener('pointermove', this.onPointerMove, {
      passive: true,
    });
    deps.domElement.addEventListener('click', this.onClick);
  }

  setMode(mode: InteractionMode): void {
    this.mode = mode;
  }

  setPickHandler(cb: ((event: PointerEvent) => void) | null): void {
    this.pickHandler = cb;
  }

  private onPointerMove = (event: PointerEvent) => {
    if (this.deps.isCameraMoving()) return;
    if (this.mode === 'pick' && this.pickHandler) {
      this.pickHandler(event);
      return;
    }
    this.lastPointer = event;
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (this.disposed || !this.lastPointer) return;
      const result = this.deps.raycast(
        this.lastPointer.clientX,
        this.lastPointer.clientY,
      );
      this.deps.bus.emit({ type: 'pick', result });
      this.deps.domElement.style.cursor = result ? 'pointer' : '';
    });
  };

  private onClick = (event: MouseEvent) => {
    if (this.mode === 'pick' && this.pickHandler) {
      this.pickHandler(event as PointerEvent);
      return;
    }
    const result = this.deps.raycast(event.clientX, event.clientY);
    this.deps.bus.emit({
      type: 'selection-changed',
      groupIds: result ? [result.groupId] : [],
    });
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.deps.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.deps.domElement.removeEventListener('click', this.onClick);
  }
}
