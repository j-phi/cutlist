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
 *                LMB drags above the click threshold start a marquee
 *                multi-select; `MarqueeSelector` owns the drag state and
 *                screen-space hit test.
 *   - 'pick'   — pointer move and click are routed to a `PickHandler`
 *                supplied via `setMode('pick', handler)`. Esc cancels.
 */

import type { EventBus } from './EventBus';
import type { MarqueeSelector } from './MarqueeSelector';
import type {
  InteractionMode,
  ObjectId,
  PickResult,
  ViewerEvent,
} from '../types';

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
  /**
   * True while a tool (gizmo drag, future annotation placement, etc.) holds
   * the viewer's interaction lock. Suppresses hover/pick the same way
   * `isCameraMoving` does, so only the active tool sees pointer events.
   */
  isInputLocked?: () => boolean;
  /** Marquee selector instance. Optional for tests; required in production. */
  marquee?: MarqueeSelector;
  /**
   * Called when a drag crosses the click threshold to acquire the same
   * interaction lock used by gizmos. Returns a release function called on
   * pointerup / Escape.
   */
  acquireInteractionLock?: () => () => void;
  /**
   * Snapshot of the currently selected groupIds at marquee-start, used as
   * the baseline for shift-XOR composition.
   */
  getSelectionSnapshot?: () => ObjectId[];
}

interface DownState {
  x: number;
  y: number;
  t: number;
  button: number;
  shiftKey: boolean;
  pointerId: number;
}

export class InputRouter {
  private mode: InteractionMode = 'select';
  private pickHandler: PickHandler | null = null;
  private rafPending = false;
  private lastPointer: { x: number; y: number } | null = null;
  private leftDown: DownState | null = null;
  private marqueeActive = false;
  private releaseLock: (() => void) | null = null;
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

  private now(): number {
    return typeof performance !== 'undefined' ? performance.now() : Date.now();
  }

  private onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0) return;
    // Tools register their own pointerdown listeners earlier and may
    // synchronously claim the click via the input lock (e.g. TransformControls
    // engaging a gizmo handle). Skip recording a leftDown so the matching
    // pointerup doesn't emit a stray `selection-changed`.
    if (this.deps.isInputLocked?.()) return;
    this.leftDown = {
      x: event.clientX,
      y: event.clientY,
      t: this.now(),
      button: event.button,
      shiftKey: event.shiftKey,
      pointerId: event.pointerId,
    };
  };

  private onPointerUp = (event: PointerEvent) => {
    if (event.button !== 0) return;
    const down = this.leftDown;
    this.leftDown = null;

    // Marquee owns the commit when it has been active. Push the pointerup
    // position through `update` first so the committed rect captures the
    // user's final cursor position even when pointerup races a pending
    // RAF callback.
    if (this.marqueeActive) {
      this.deps.marquee?.update(event.clientX, event.clientY);
      this.deps.marquee?.end(true);
      this.endMarquee(event.pointerId);
      return;
    }

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
    this.lastPointer = { x: event.clientX, y: event.clientY };

    // Detect drag-to-marquee transition. Runs before any lock check —
    // marquee acquires the lock itself, so a stale `isInputLocked()`
    // reading would prevent us from ever transitioning.
    if (
      !this.marqueeActive &&
      this.leftDown &&
      this.mode === 'select' &&
      this.deps.marquee &&
      this.deps.acquireInteractionLock
    ) {
      const dx = event.clientX - this.leftDown.x;
      const dy = event.clientY - this.leftDown.y;
      if (Math.hypot(dx, dy) > CLICK_PIXEL_THRESHOLD) {
        const baseline = this.deps.getSelectionSnapshot?.() ?? [];
        this.releaseLock = this.deps.acquireInteractionLock();
        this.marqueeActive = true;
        try {
          this.deps.domElement.setPointerCapture(this.leftDown.pointerId);
        } catch {
          // Pointer capture is best-effort; some test environments lack it.
        }
        this.deps.marquee.begin(
          this.leftDown.x,
          this.leftDown.y,
          this.leftDown.shiftKey,
          baseline,
        );
      }
    }

    if (this.marqueeActive) {
      if (this.rafPending) return;
      this.rafPending = true;
      requestAnimationFrame(() => {
        this.rafPending = false;
        if (this.disposed || !this.lastPointer) return;
        this.deps.marquee?.update(this.lastPointer.x, this.lastPointer.y);
      });
      return;
    }

    if (this.deps.isCameraMoving()) return;
    if (this.deps.isInputLocked?.()) return;
    if (this.rafPending) return;
    this.rafPending = true;
    requestAnimationFrame(() => {
      this.rafPending = false;
      if (this.disposed || !this.lastPointer) return;
      if (this.mode === 'pick') {
        this.pickHandler?.onPointerMove?.(this.lastPointer);
        return;
      }
      const result = this.deps.raycast(this.lastPointer.x, this.lastPointer.y);
      this.deps.bus.emit({ type: 'pick', result });
      this.deps.domElement.style.cursor = result ? 'pointer' : '';
    });
  };

  private onKeyDown = (event: KeyboardEvent) => {
    if (event.key !== 'Escape') return;
    if (this.marqueeActive) {
      this.deps.marquee?.end(false);
      this.endMarquee(this.leftDown?.pointerId);
      this.leftDown = null;
      event.stopPropagation();
      return;
    }
    if (this.mode === 'pick' && this.pickHandler?.onEsc) {
      this.pickHandler.onEsc();
      event.stopPropagation();
    }
  };

  private endMarquee(pointerId: number | undefined): void {
    this.marqueeActive = false;
    if (pointerId != null) {
      try {
        this.deps.domElement.releasePointerCapture(pointerId);
      } catch {
        // Already released or unsupported — safe to ignore.
      }
    }
    this.releaseLock?.();
    this.releaseLock = null;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    if (this.marqueeActive) {
      this.deps.marquee?.end(false);
      this.endMarquee(this.leftDown?.pointerId);
    }
    this.deps.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.deps.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.deps.domElement.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('keydown', this.onKeyDown, true);
  }
}
