/**
 * Outcome-based tests. Pattern: real EventBus, capture emissions into an
 * array, assert on event payloads. Marquee is a recording stand-in (not a
 * mock object) — its method invocations are observed via captured events
 * and a typed call log, not `toHaveBeenCalled`. The `performance.now` spy
 * is unavoidable: InputRouter reads time directly to gate the click
 * threshold, and the spy controls the input rather than asserting calls.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EventBus } from '../EventBus';
import { InputRouter, type PickHandler } from '../InputRouter';
import type { GroupId } from '~/utils/types';
import type { PickResult, ViewerEvent } from '../../types';

class FakeCanvas extends EventTarget {
  style: { cursor: string } = { cursor: '' };
  // Pointer capture is best-effort in production and unobservable in tests —
  // no-op stubs are sufficient.
  setPointerCapture(_id: number): void {}
  releasePointerCapture(_id: number): void {}
}

function makeEvent(
  type: string,
  init: {
    button?: number;
    clientX?: number;
    clientY?: number;
    shiftKey?: boolean;
    pointerId?: number;
    pointerType?: string;
  } = {},
): PointerEvent {
  const e = new Event(type) as PointerEvent;
  Object.defineProperty(e, 'button', { value: init.button ?? 0 });
  Object.defineProperty(e, 'clientX', { value: init.clientX ?? 0 });
  Object.defineProperty(e, 'clientY', { value: init.clientY ?? 0 });
  Object.defineProperty(e, 'shiftKey', { value: init.shiftKey ?? false });
  Object.defineProperty(e, 'pointerId', { value: init.pointerId ?? 1 });
  Object.defineProperty(e, 'pointerType', {
    value: init.pointerType ?? 'mouse',
  });
  return e;
}

type Marquee = NonNullable<
  ConstructorParameters<typeof InputRouter>[0]['marquee']
>;

interface RecordingMarquee {
  asDep: Marquee;
  beginCalls: Array<{
    x: number;
    y: number;
    shift: boolean;
    baseline: GroupId[];
  }>;
  updateCalls: Array<{ x: number; y: number; order: number }>;
  endCalls: Array<{ committed: boolean; order: number }>;
}

function makeRecordingMarquee(): RecordingMarquee {
  let order = 0;
  const beginCalls: RecordingMarquee['beginCalls'] = [];
  const updateCalls: RecordingMarquee['updateCalls'] = [];
  const endCalls: RecordingMarquee['endCalls'] = [];
  const asDep = {
    begin(x: number, y: number, shift: boolean, baseline: GroupId[]) {
      beginCalls.push({ x, y, shift, baseline: [...baseline] });
    },
    update(x: number, y: number) {
      updateCalls.push({ x, y, order: order++ });
    },
    end(committed: boolean) {
      endCalls.push({ committed, order: order++ });
    },
    isActive: () => false,
    computeRect: () => ({ x: 0, y: 0, w: 0, h: 0, mode: 'window' as const }),
  } as unknown as Marquee;
  return { asDep, beginCalls, updateCalls, endCalls };
}

function flushRafTwice(): Promise<void> {
  return new Promise((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
}

function flushRaf(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

/** Simple recording raycast: lookup table by client coords, default null. */
function makeRaycast(result: PickResult | null = null) {
  const log: Array<{ x: number; y: number }> = [];
  const fn = (x: number, y: number): PickResult | null => {
    log.push({ x, y });
    return result;
  };
  return { fn, log };
}

describe('InputRouter', () => {
  let dom: FakeCanvas;
  let bus: EventBus<ViewerEvent>;
  let captured: ViewerEvent[];
  let cameraMoving: boolean;
  let router: InputRouter;
  let nowSpy: ReturnType<typeof vi.spyOn>;
  let currentTime: number;

  beforeEach(() => {
    dom = new FakeCanvas();
    bus = new EventBus<ViewerEvent>();
    captured = [];
    bus.on('selection-changed', (e) => captured.push(e));
    bus.on('pick', (e) => captured.push(e));
    cameraMoving = false;
    currentTime = 0;
    nowSpy = vi.spyOn(performance, 'now').mockImplementation(() => currentTime);
  });

  afterEach(() => {
    router.dispose();
    nowSpy.mockRestore();
  });

  function buildRouter(
    overrides: Partial<ConstructorParameters<typeof InputRouter>[0]> & {
      raycast?: (x: number, y: number) => PickResult | null;
    } = {},
  ): void {
    const { raycast = () => null, ...rest } = overrides;
    router = new InputRouter({
      domElement: dom as unknown as HTMLElement,
      bus,
      raycast,
      isCameraMoving: () => cameraMoving,
      ...rest,
    });
  }

  it('Should emit selection-changed on a clean left click in select mode', () => {
    const result: PickResult = {
      groupId: 7,
      worldPoint: { x: 0, y: 0, z: 0 } as unknown as PickResult['worldPoint'],
      worldNormal: { x: 0, y: 1, z: 0 } as unknown as PickResult['worldNormal'],
    };
    buildRouter({ raycast: () => result });

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 10, clientY: 10 }));
    currentTime = 50;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 11, clientY: 10 }));

    expect(captured).toEqual([
      { type: 'selection-changed', groupIds: [7], shiftKey: false },
    ]);
  });

  it('Should emit empty selection when the click misses every Object', () => {
    buildRouter({ raycast: () => null });

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    currentTime = 30;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 0, clientY: 0 }));

    expect(captured).toEqual([
      { type: 'selection-changed', groupIds: [], shiftKey: false },
    ]);
  });

  it('Should suppress selection when pointer drifts past the threshold', () => {
    buildRouter();

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    currentTime = 50;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 30, clientY: 0 }));

    expect(captured).toEqual([]);
  });

  it('Should ignore non-left mouse buttons entirely', () => {
    buildRouter();

    dom.dispatchEvent(makeEvent('pointerdown', { button: 2 }));
    dom.dispatchEvent(makeEvent('pointerup', { button: 2 }));

    expect(captured).toEqual([]);
  });

  it('Should route pick-mode clicks to the registered handler', () => {
    const clicks: Array<{ x: number; y: number }> = [];
    const pick: PickHandler = {
      onClick: (c) => clicks.push(c),
    };
    buildRouter();
    router.setMode('pick', pick);

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 5, clientY: 5 }));
    currentTime = 50;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 5, clientY: 5 }));

    expect(clicks).toEqual([{ x: 5, y: 5 }]);
    expect(captured).toEqual([]);
  });

  it('Should call pick handler onPointerMove, throttled to one per frame', async () => {
    const moves: Array<{ x: number; y: number }> = [];
    buildRouter();
    router.setMode('pick', { onPointerMove: (c) => moves.push(c) });

    dom.dispatchEvent(makeEvent('pointermove', { clientX: 1, clientY: 1 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 2, clientY: 2 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 3, clientY: 3 }));

    await flushRaf();

    expect(moves).toEqual([{ x: 3, y: 3 }]);
  });

  it('Should fire onEsc when Escape is pressed in pick mode', () => {
    let escFired = 0;
    buildRouter();
    router.setMode('pick', { onEsc: () => escFired++ });

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(escFired).toBe(1);
  });

  it('Should not call any handler when Escape is pressed in select mode', () => {
    let escFired = 0;
    buildRouter();
    router.setMode('pick', { onEsc: () => escFired++ });
    router.setMode('select');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(escFired).toBe(0);
  });

  it('Should require a handler when entering pick mode', () => {
    buildRouter();
    expect(() => router.setMode('pick')).toThrow();
  });

  it('Should suppress hover raycasts while the camera is moving', async () => {
    const rc = makeRaycast(null);
    cameraMoving = true;
    buildRouter({ raycast: rc.fn });

    dom.dispatchEvent(makeEvent('pointermove', { clientX: 1, clientY: 1 }));
    await flushRaf();

    expect(rc.log).toEqual([]);
  });

  it('Should begin a marquee when LMB drags past the click threshold', async () => {
    const marquee = makeRecordingMarquee();
    let lockHeld = 0;
    buildRouter({
      marquee: marquee.asDep,
      acquireInteractionLock: () => {
        lockHeld++;
        return () => {
          lockHeld--;
        };
      },
      getSelectionSnapshot: () => [10, 11],
    });

    currentTime = 0;
    dom.dispatchEvent(
      makeEvent('pointerdown', { clientX: 50, clientY: 50, shiftKey: true }),
    );
    // 10px drift > 5px threshold.
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 60, clientY: 50 }));
    await flushRafTwice();

    expect(marquee.beginCalls).toEqual([
      { x: 50, y: 50, shift: true, baseline: [10, 11] },
    ]);
    expect(lockHeld).toBe(1);
    expect(marquee.updateCalls.length).toBeGreaterThan(0);
  });

  it('Should commit the marquee on pointerup and skip the click selection-changed', async () => {
    const marquee = makeRecordingMarquee();
    let lockHeld = 0;
    buildRouter({
      marquee: marquee.asDep,
      acquireInteractionLock: () => {
        lockHeld++;
        return () => {
          lockHeld--;
        };
      },
      getSelectionSnapshot: () => [],
    });

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 30, clientY: 30 }));
    await flushRafTwice();
    currentTime = 80;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 30, clientY: 30 }));

    expect(marquee.endCalls).toEqual([
      { committed: true, order: marquee.endCalls[0].order },
    ]);
    expect(lockHeld).toBe(0);
    expect(captured.filter((e) => e.type === 'selection-changed')).toEqual([]);
  });

  it('Should cancel the marquee with committed=false on Escape', async () => {
    const marquee = makeRecordingMarquee();
    let lockHeld = 0;
    buildRouter({
      marquee: marquee.asDep,
      acquireInteractionLock: () => {
        lockHeld++;
        return () => {
          lockHeld--;
        };
      },
      getSelectionSnapshot: () => [],
    });

    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 30, clientY: 30 }));
    await flushRafTwice();

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));

    expect(marquee.endCalls.map((c) => c.committed)).toEqual([false]);
    expect(lockHeld).toBe(0);
  });

  it('Should flush the final pointerup position into the marquee before committing', async () => {
    const marquee = makeRecordingMarquee();
    buildRouter({
      marquee: marquee.asDep,
      acquireInteractionLock: () => () => {},
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

    const lastUpdate = marquee.updateCalls.at(-1)!;
    expect({ x: lastUpdate.x, y: lastUpdate.y }).toEqual({ x: 90, y: 90 });
    expect(marquee.endCalls[0].order).toBeGreaterThan(lastUpdate.order);
  });

  it('Should not restart a marquee on the move that follows an Escape cancel', async () => {
    const marquee = makeRecordingMarquee();
    buildRouter({
      marquee: marquee.asDep,
      acquireInteractionLock: () => () => {},
      getSelectionSnapshot: () => [],
    });

    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 0, clientY: 0 }));
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 30, clientY: 30 }));
    await flushRafTwice();
    expect(marquee.beginCalls.length).toBe(1);

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(marquee.endCalls.map((c) => c.committed)).toEqual([false]);

    // The user is still dragging (no pointerup yet). A subsequent move
    // must NOT relight the marquee — Escape clears the recorded down state.
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 60, clientY: 60 }));
    await flushRafTwice();
    expect(marquee.beginCalls.length).toBe(1);
  });

  it('Should still emit selection-changed for a near-stationary click below the threshold', () => {
    const marquee = makeRecordingMarquee();
    const result: PickResult = {
      groupId: 5,
      worldPoint: { x: 0, y: 0, z: 0 } as unknown as PickResult['worldPoint'],
      worldNormal: { x: 0, y: 1, z: 0 } as unknown as PickResult['worldNormal'],
    };
    buildRouter({
      raycast: () => result,
      marquee: marquee.asDep,
      acquireInteractionLock: () => () => {},
      getSelectionSnapshot: () => [],
    });

    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 10, clientY: 10 }));
    currentTime = 20;
    // 2px drift — below CLICK_PIXEL_THRESHOLD.
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 12, clientY: 10 }));

    expect(marquee.beginCalls).toEqual([]);
    const sel = captured.find((e) => e.type === 'selection-changed');
    expect(sel).toMatchObject({ groupIds: [5] });
  });

  it('Should not begin a marquee on touch drag — single-finger orbit owns the gesture', async () => {
    const marquee = makeRecordingMarquee();
    let lockHeld = 0;
    buildRouter({
      marquee: marquee.asDep,
      acquireInteractionLock: () => {
        lockHeld++;
        return () => {
          lockHeld--;
        };
      },
      getSelectionSnapshot: () => [],
    });

    currentTime = 0;
    dom.dispatchEvent(
      makeEvent('pointerdown', {
        clientX: 50,
        clientY: 50,
        pointerType: 'touch',
      }),
    );
    dom.dispatchEvent(
      makeEvent('pointermove', {
        clientX: 80,
        clientY: 50,
        pointerType: 'touch',
      }),
    );
    await flushRafTwice();

    expect(marquee.beginCalls).toEqual([]);
    expect(lockHeld).toBe(0);
  });

  it('Should still emit selection-changed on a touch tap', () => {
    const marquee = makeRecordingMarquee();
    const result: PickResult = {
      groupId: 9,
      worldPoint: { x: 0, y: 0, z: 0 } as unknown as PickResult['worldPoint'],
      worldNormal: { x: 0, y: 1, z: 0 } as unknown as PickResult['worldNormal'],
    };
    buildRouter({
      raycast: () => result,
      marquee: marquee.asDep,
      acquireInteractionLock: () => () => {},
      getSelectionSnapshot: () => [],
    });

    currentTime = 0;
    dom.dispatchEvent(
      makeEvent('pointerdown', {
        clientX: 20,
        clientY: 20,
        pointerType: 'touch',
      }),
    );
    currentTime = 60;
    dom.dispatchEvent(
      makeEvent('pointerup', {
        clientX: 21,
        clientY: 20,
        pointerType: 'touch',
      }),
    );

    expect(captured).toEqual([
      { type: 'selection-changed', groupIds: [9], shiftKey: false },
    ]);
  });

  it('Should suppress hover and clicks while the input lock is held', async () => {
    let locked = false;
    const rc = makeRaycast(null);
    buildRouter({
      raycast: rc.fn,
      isInputLocked: () => locked,
    });

    locked = true;
    dom.dispatchEvent(makeEvent('pointermove', { clientX: 1, clientY: 1 }));
    await flushRaf();
    expect(rc.log).toEqual([]);

    // pointerdown is dropped while locked, so the matching pointerup can't
    // emit a stray selection-changed even after the lock releases.
    currentTime = 0;
    dom.dispatchEvent(makeEvent('pointerdown', { clientX: 5, clientY: 5 }));
    locked = false;
    currentTime = 30;
    dom.dispatchEvent(makeEvent('pointerup', { clientX: 5, clientY: 5 }));
    expect(captured.filter((e) => e.type === 'selection-changed')).toEqual([]);
  });
});
