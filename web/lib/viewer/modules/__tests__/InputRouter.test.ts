import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../EventBus';
import { InputRouter, type PickHandler } from '../InputRouter';
import type { PickResult, ViewerEvent } from '../../types';

class FakeCanvas extends EventTarget {
  style: { cursor: string } = { cursor: '' };
}

function makeEvent(
  type: string,
  init: { button?: number; clientX?: number; clientY?: number } = {},
): PointerEvent {
  const e = new Event(type) as PointerEvent;
  Object.defineProperty(e, 'button', { value: init.button ?? 0 });
  Object.defineProperty(e, 'clientX', { value: init.clientX ?? 0 });
  Object.defineProperty(e, 'clientY', { value: init.clientY ?? 0 });
  return e;
}

function flushRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

describe('InputRouter', () => {
  let dom: FakeCanvas;
  let bus: EventBus<ViewerEvent>;
  let raycast: ReturnType<
    typeof vi.fn<(x: number, y: number) => PickResult | null>
  >;
  let isCameraMoving: ReturnType<typeof vi.fn<() => boolean>>;
  let router: InputRouter;
  let nowSpy: ReturnType<typeof vi.spyOn>;
  let currentTime = 0;

  beforeEach(() => {
    dom = new FakeCanvas();
    bus = new EventBus<ViewerEvent>();
    raycast = vi.fn<(x: number, y: number) => PickResult | null>();
    isCameraMoving = vi.fn<() => boolean>(() => false);
    currentTime = 0;
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
    router = new InputRouter({
      domElement: dom as unknown as HTMLElement,
      bus,
      raycast,
      isCameraMoving,
    });
  });

  afterEach(() => {
    router.dispose();
    nowSpy.mockRestore();
  });

  it('Should emit selection-changed on a clean left click in select mode', () => {
    const result: PickResult = {
      groupId: 7,
      worldPoint: { x: 0, y: 0, z: 0 } as unknown as PickResult['worldPoint'],
      worldNormal: { x: 0, y: 1, z: 0 } as unknown as PickResult['worldNormal'],
    };
    raycast.mockReturnValue(result);
    const handler = vi.fn();
    bus.on('selection-changed', handler);

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 10, clientY: 10 }));
    currentTime = 50;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 11, clientY: 10 }));

    expect(handler).toHaveBeenCalledWith({
      type: 'selection-changed',
      groupIds: [7],
    });
  });

  it('Should emit empty selection when the click misses every Object', () => {
    raycast.mockReturnValue(null);
    const handler = vi.fn();
    bus.on('selection-changed', handler);

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    currentTime = 30;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 0, clientY: 0 }));

    expect(handler).toHaveBeenCalledWith({
      type: 'selection-changed',
      groupIds: [],
    });
  });

  it('Should suppress selection when pointer drifts past the threshold', () => {
    const handler = vi.fn();
    bus.on('selection-changed', handler);

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    currentTime = 50;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 30, clientY: 0 }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('Should ignore non-left mouse buttons entirely', () => {
    const handler = vi.fn();
    bus.on('selection-changed', handler);

    dom.dispatchEvent(makeEvent('pointerdown', { button: 2 }));
    dom.dispatchEvent(makeEvent('pointerup', { button: 2 }));

    expect(handler).not.toHaveBeenCalled();
  });

  it('Should route pick-mode clicks to the registered handler', () => {
    const onClick = vi.fn();
    const pick: PickHandler = { onClick };
    router.setMode('pick', pick);

    const selection = vi.fn();
    bus.on('selection-changed', selection);

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 5, clientY: 5 }));
    currentTime = 50;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 5, clientY: 5 }));

    expect(onClick).toHaveBeenCalledWith({ x: 5, y: 5 });
    expect(selection).not.toHaveBeenCalled();
  });

  it('Should call pick handler onPointerMove, throttled to one per frame', async () => {
    const onPointerMove = vi.fn();
    router.setMode('pick', { onPointerMove });

    dom.dispatchEvent(makeEvent('pointermove', { clientX: 1, clientY: 1 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 2, clientY: 2 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 3, clientY: 3 }));

    await flushRaf();

    expect(onPointerMove).toHaveBeenCalledTimes(1);
    expect(onPointerMove).toHaveBeenLastCalledWith({ x: 3, y: 3 });
  });

  it('Should fire onEsc when Escape is pressed in pick mode', () => {
    const onEsc = vi.fn();
    router.setMode('pick', { onEsc });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(onEsc).toHaveBeenCalled();
  });

  it('Should not call any handler when Escape is pressed in select mode', () => {
    const onEsc = vi.fn();
    router.setMode('select');
    // Register a pick handler then back out — onEsc should not fire.
    router.setPickHandler({ onEsc });
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(onEsc).not.toHaveBeenCalled();
  });

  it('Should require a handler when entering pick mode', () => {
    expect(() => router.setMode('pick')).toThrow();
  });

  it('Should suppress hover raycasts while the camera is moving', async () => {
    isCameraMoving.mockReturnValue(true);
    raycast.mockReturnValue(null);

    dom.dispatchEvent(makeEvent('pointermove', { clientX: 1, clientY: 1 }));
    await flushRaf();

    expect(raycast).not.toHaveBeenCalled();
  });
});
