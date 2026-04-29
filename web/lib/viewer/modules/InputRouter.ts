/**
 * Pointer routing for the viewer canvas.
 *
 * Implements the OnShape-style scheme: left-button is reserved for
 * selection / picking and is gated behind a click-vs-drag threshold so a
 * near-stationary mouseup still counts as a click. OrbitControls owns
 * right-button (orbit) and middle-button (pan) directly — `InputRouter`
 * never touches them.
 *
 * Two modes:
 *   - 'select' — clicks emit a `selection-changed` event, hover emits `pick`.
 *   - 'pick'   — pointer move and click are routed to a `PickHandler`
 *                supplied via `setMode('pick', handler)`. Esc cancels.
 */

import type { EventBus } from './EventBus';
import type { InteractionMode, PickResult, ViewerEvent } from '../types';

export const CLICK_PIXEL_THRESHOLD = 5;
export const CLICK_TIME_THRESHOLD_MS = 250;

export function isClick(
  downX: number,
  downY: number,
  downTime: number,
  upX: number,
  upY: number,
  upTime: number,
): boolean {
  const dx = upX - downX;
  const dy = upY - downY;
  return (
    Math.hypot(dx, dy) <= CLICK_PIXEL_THRESHOLD &&
    upTime - downTime <= CLICK_TIME_THRESHOLD_MS
  );
}

export interface PickHandler {
  onPointerMove?(client: { x: number; y: number }): void;
  onClick?(client: { x: number; y: number }): void;
  onEsc?(): void;
}

interface InputRouterDeps {
  domElement: HTMLElement;
  bus: EventBus<ViewerEvent>;
  raycast: (clientX: number, clientY: number) => PickResult | null;
  /** True while OrbitControls is mid-drag — suppresses hover updates. */
  isCameraMoving: () => boolean;
}

interface DownState {
  x: number;
  y: number;
  t: number;
  button: number;
}

export class InputRouter {
  private mode: InteractionMode = 'select';
  private pickHandler: PickHandler | null = null;
  private rafPending = false;
  private lastPointer: { x: number; y: number } | null = null;
  private leftDown: DownState | null = null;
  private disposed = false;

  constructor(private deps: InputRouterDeps) {
    deps.domElement.addEventListener('pointerdown', this.onPointerDown);
    deps.domElement.addEventListener('pointerup', this.onPointerUp);
    deps.domElement.addEventListener('pointermove', this.onPointerMove, {
      passive: true,
    });
    window.addEventListener('keydown', this.onKeyDown, true);
  }

  setMode(mode: InteractionMode, handler?: PickHandler | null): void {
    if (mode === 'pick' && !handler) {
      throw new Error('InputRouter: pick mode requires a handler');
    }
    this.mode = mode;
    this.pickHandler = mode === 'pick' ? (handler ?? null) : null;
  }

  /**
   * Legacy two-step setter retained for callers that wire mode and handler
   * separately. New code should prefer `setMode(mode, handler)`.
   */
  setPickHandler(handler: PickHandler | null): void {
    this.pickHandler = handler;
  }

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    this.leftDown = {
      x: event.clientX,
      y: event.clientY,
      t: this.now(),
      button: event.button,
    };
  };

  private onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const down = this.leftDown;
    this.leftDown = null;
    if (!down) return;
    if (
      !isClick(down.x, down.y, down.t, event.clientX, event.clientY, this.now())
    )
      return;
    if (this.mode === 'pick' && this.pickHandler?.onClick) {
      this.pickHandler.onClick({ x: event.clientX, y: event.clientY });
      return;
    }
    const result = this.deps.raycast(event.clientX, event.clientY);
    this.deps.bus.emit({
      type: 'selection-changed',
      groupIds: result ? [result.groupId] : [],
      shiftKey: event.shiftKey,
    });
  };

  private onPointerMove = (event: PointerEvent) => {
    if (this.deps.isCameraMoving()) return;
    if (this.mode === 'pick' && this.pickHandler?.onPointerMove) {
      // Throttle to 1/frame — pick handlers may do their own raycast.
      this.lastPointer = { x: event.clientX, y: event.clientY };
      if (this.rafPending) return;
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.rafPending = false;
        if (this.disposed || !this.lastPointer) return;
        this.pickHandler?.onPointerMove?.(this.lastPointer);
      });
      return;
    }
    this.lastPointer = { x: event.clientX, y: event.clientY };
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (this.disposed || !this.lastPointer) return;
      const result = this.deps.raycast(this.lastPointer.x, this.lastPointer.y);
      this.deps.bus.emit({ type: 'pick', result });
      this.deps.domElement.style.cursor = result ? 'pointer' : '';
    });
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (this.mode === 'pick' && this.pickHandler?.onEsc) {
      this.pickHandler.onEsc();
      event.stopPropagation();
    }
  };

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.deps.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.deps.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.deps.domElement.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('keydown', this.onKeyDown, true);
  }
}
