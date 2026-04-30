import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../EventBus';
import { InputRouter, type PickHandler } from '../InputRouter';
import type { PickResult, ViewerEvent } from '../../types';

class FakeCanvas extends EventTarget {
  style: { cursor: string } = { cursor: '' };
  setPointerCapture = vi.fn();
  releasePointerCapture = vi.fn();
}

function makeEvent(
  type: string,
  init: {
    button?: number;
    clientX?: number;
    clientY?: number;
    shiftKey?: boolean;
    pointerId?: number;
  } = {},
): PointerEvent {
  const e = new Event(type) as PointerEvent;
  Object.defineProperty(e, 'button', { value: init.button ?? 0 });
  Object.defineProperty(e, 'clientX', { value: init.clientX ?? 0 });
  Object.defineProperty(e, 'clientY', { value: init.clientY ?? 0 });
  Object.defineProperty(e, 'shiftKey', { value: init.shiftKey ?? false });
  Object.defineProperty(e, 'pointerId', { value: init.pointerId ?? 1 });
  return e;
}

function makeFakeMarquee() {
  return {
    begin: vi.fn(),
    update: vi.fn(),
    end: vi.fn(),
    isActive: vi.fn(() => false),
    computeRect: vi.fn(),
  };
}

function flushRafTwice(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
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
      shiftKey: false,
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
      shiftKey: false,
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
    router.setMode('pick', { onEsc });
    router.setMode('select');
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

  it('Should begin a marquee when LMB drags past the click threshold', async () => {
    router.dispose();
    const marquee = makeFakeMarquee();
    const acquireInteractionLock = vi.fn(() => vi.fn());
    const getSelectionSnapshot = vi.fn(() => [10, 11]);
    router = new InputRouter({
      domElement: dom as unknown as HTMLElement,
      bus,
      raycast,
      isCameraMoving,
      marquee: marquee as unknown as ConstructorParameters<
        typeof InputRouter
      >[0]['marquee'],
      acquireInteractionLock,
      getSelectionSnapshot,
    });

    currentTime = 0;
    dom.dispatchEvent(
      makeEvent('pointerdown', { clientX: 50, clientY: 50, shiftKey: true }),
    );
    // 10px drift > 5px threshold.
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 60, clientY: 50 }));
    await flushRafTwice();

    expect(marquee.begin).toHaveBeenCalledWith(50, 50, true, [10, 11]);
    expect(acquireInteractionLock).toHaveBeenCalled();
    expect(marquee.update).toHaveBeenCalled();
  });

  it('Should commit the marquee on pointerup and skip the click selection-changed', async () => {
    router.dispose();
    const marquee = makeFakeMarquee();
    const release = vi.fn();
    const acquireInteractionLock = vi.fn(() => release);
    const selHandler = vi.fn();
    bus.on('selection-changed', selHandler);
    router = new InputRouter({
      domElement: dom as unknown as HTMLElement,
      bus,
      raycast,
      isCameraMoving,
      marquee: marquee as unknown as ConstructorParameters<
        typeof InputRouter
      >[0]['marquee'],
      acquireInteractionLock,
      getSelectionSnapshot: () => [],
    });

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 30, clientY: 30 }));
    await flushRafTwice();
    currentTime = 80;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 30, clientY: 30 }));

    expect(marquee.end).toHaveBeenCalledWith(true);
    expect(release).toHaveBeenCalled();
    expect(selHandler).not.toHaveBeenCalled();
  });

  it('Should cancel the marquee with committed=false on Escape', async () => {
    router.dispose();
    const marquee = makeFakeMarquee();
    const release = vi.fn();
    router = new InputRouter({
      domElement: dom as unknown as HTMLElement,
      bus,
      raycast,
      isCameraMoving,
      marquee: marquee as unknown as ConstructorParameters<
        typeof InputRouter
      >[0]['marquee'],
      acquireInteractionLock: vi.fn(() => release),
      getSelectionSnapshot: () => [],
    });

    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 30, clientY: 30 }));
    await flushRafTwice();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(marquee.end).toHaveBeenCalledWith(false);
    expect(release).toHaveBeenCalled();
  });

  it('Should flush the final pointerup position into the marquee before committing', async () => {
    router.dispose();
    const marquee = makeFakeMarquee();
    router = new InputRouter({
      domElement: dom as unknown as HTMLElement,
      bus,
      raycast,
      isCameraMoving,
      marquee: marquee as unknown as ConstructorParameters<
        typeof InputRouter
      >[0]['marquee'],
      acquireInteractionLock: vi.fn(() => vi.fn()),
      getSelectionSnapshot: () => [],
    });

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 30, clientY: 30 }));
    await flushRafTwice();
    // pointerup at a different position than the last RAF-flushed move.
    // The committed rect must reflect the pointerup coordinates so a
    // pre-RAF release doesn't lose the user's final position.
    currentTime = 80;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 90, clientY: 90 }));

    expect(marquee.update).toHaveBeenLastCalledWith(90, 90);
    const updateCallIdx = marquee.update.mock.invocationCallOrder.at(-1)!;
    const endCallIdx = marquee.end.mock.invocationCallOrder[0];
    expect(endCallIdx).toBeGreaterThan(updateCallIdx);
  });

  it('Should not restart a marquee on the move that follows an Escape cancel', async () => {
    router.dispose();
    const marquee = makeFakeMarquee();
    router = new InputRouter({
      domElement: dom as unknown as HTMLElement,
      bus,
      raycast,
      isCameraMoving,
      marquee: marquee as unknown as ConstructorParameters<
        typeof InputRouter
      >[0]['marquee'],
      acquireInteractionLock: vi.fn(() => vi.fn()),
      getSelectionSnapshot: () => [],
    });

    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 30, clientY: 30 }));
    await flushRafTwice();
    expect(marquee.begin).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(marquee.end).toHaveBeenCalledWith(false);

    // The user is still dragging (no pointerup yet). A subsequent move
    // must NOT relight the marquee — Escape clears the recorded down state.
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 60, clientY: 60 }));
    await flushRafTwice();
    expect(marquee.begin).toHaveBeenCalledTimes(1);
  });

  it('Should still emit selection-changed for a near-stationary click below the threshold', () => {
    router.dispose();
    const marquee = makeFakeMarquee();
    raycast.mockReturnValue({
      groupId: 5,
      worldPoint: { x: 0, y: 0, z: 0 } as unknown as PickResult['worldPoint'],
      worldNormal: { x: 0, y: 1, z: 0 } as unknown as PickResult['worldNormal'],
    });
    const selHandler = vi.fn();
    bus.on('selection-changed', selHandler);
    router = new InputRouter({
      domElement: dom as unknown as HTMLElement,
      bus,
      raycast,
      isCameraMoving,
      marquee: marquee as unknown as ConstructorParameters<
        typeof InputRouter
      >[0]['marquee'],
      acquireInteractionLock: vi.fn(() => vi.fn()),
      getSelectionSnapshot: () => [],
    });

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 10, clientY: 10 }));
    currentTime = 20;
    // 2px drift — below CLICK_PIXEL_THRESHOLD.
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 12, clientY: 10 }));

    expect(marquee.begin).not.toHaveBeenCalled();
    expect(selHandler).toHaveBeenCalledWith(
      expect.objectContaining({ groupIds: [5] }),
    );
  });

  it('Should suppress hover and clicks while the input lock is held', async () => {
    let locked = false;
    router.dispose();
    router = new InputRouter({
      domElement: dom as unknown as HTMLElement,
      bus,
      raycast,
      isCameraMoving,
      isInputLocked: () => locked,
    });

    raycast.mockReturnValue(null);
    const selHandler = vi.fn();
    bus.on('selection-changed', selHandler);

    locked = true;
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 1, clientY: 1 }));
    await flushRaf();
    expect(raycast).not.toHaveBeenCalled();

    // pointerdown is dropped while locked, so the matching pointerup can't
    // emit a stray selection-changed even after the lock releases.
    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 5, clientY: 5 }));
    locked = false;
    currentTime = 30;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 5, clientY: 5 }));
    expect(selHandler).not.toHaveBeenCalled();
  });
});
