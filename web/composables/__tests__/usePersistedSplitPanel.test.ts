import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ref, nextTick, defineComponent } from 'vue';
import { mount } from '@vue/test-utils';

const hoisted = vi.hoisted(() => ({
  getNum: vi.fn((_key: string): number | null => null),
  setNum: vi.fn((_key: string, _value: number) => {}),
}));

vi.mock('~/utils/localStorage', () => ({
  getLocalStorageNumber: hoisted.getNum,
  setLocalStorageNumber: hoisted.setNum,
}));

import usePersistedSplitPanel from '../usePersistedSplitPanel';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeContainer(width: number, height: number): HTMLElement {
  const el = document.createElement('div');
  Object.defineProperties(el, {
    clientWidth: { get: () => width, configurable: true },
    clientHeight: { get: () => height, configurable: true },
  });
  el.getBoundingClientRect = () =>
    ({
      x: 0,
      y: 0,
      left: 0,
      top: 0,
      right: width,
      bottom: height,
      width,
      height,
      toJSON() {
        return this;
      },
    }) as DOMRect;
  return el;
}

type SetupResult = ReturnType<typeof usePersistedSplitPanel>;

function setup(
  containerEl: HTMLElement | null,
  enabled: boolean,
  options: Parameters<typeof usePersistedSplitPanel>[2],
) {
  const containerRef = ref(containerEl);
  const enabledRef = ref(enabled);
  let result!: SetupResult;
  const wrapper = mount(
    defineComponent({
      setup() {
        result = usePersistedSplitPanel(
          containerRef as any,
          enabledRef,
          options,
        );
        return () => null;
      },
    }),
    { attachTo: document.body },
  );
  return { result, wrapper };
}

function firePointer(
  target: EventTarget,
  type: string,
  init: PointerEventInit = {},
) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }));
}

beforeEach(() => {
  hoisted.getNum.mockReset().mockReturnValue(null);
  hoisted.setNum.mockReset();
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

// ---------------------------------------------------------------------------
// Tests — focused on the three real bug classes:
//  (1) persisted ratio overrides the default on mount
//  (2) min-panel / min-main clamping during drag
//  (3) persistence write happens on drag end
// ---------------------------------------------------------------------------

describe('usePersistedSplitPanel', () => {
  it('uses the persisted ratio over the default on mount', async () => {
    hoisted.getNum.mockReturnValue(400);
    const { result } = setup(makeContainer(1000, 600), true, {
      storageKey: 'k',
      defaultPanelRatio: 1 / 2,
      horizontal: { minPanelPx: 200, minMainPx: 300 },
    });
    await nextTick();
    expect(result.panelSize.value).toBe(400);
  });

  it('falls back to defaultPanelRatio when no value is persisted', async () => {
    const { result } = setup(makeContainer(1000, 600), true, {
      storageKey: 'k',
      defaultPanelRatio: 1 / 2,
      horizontal: { minPanelPx: 200, minMainPx: 300 },
    });
    await nextTick();
    expect(result.panelSize.value).toBe(500);
  });

  it('clamps drag to minPanel (cannot collapse panel below floor)', async () => {
    const { result } = setup(makeContainer(1000, 600), true, {
      storageKey: 'k',
      horizontal: { minPanelPx: 200, minMainPx: 300 },
    });
    await nextTick();

    result.startResize(new PointerEvent('pointerdown', { button: 0 }));
    // 1000 - 900 = 100, clamped up to 200
    firePointer(window, 'pointermove', { clientX: 900 });
    expect(result.panelSize.value).toBe(200);
    firePointer(window, 'pointerup');
  });

  it('clamps drag to (container - minMain) (cannot squeeze main below floor)', async () => {
    const { result } = setup(makeContainer(1000, 600), true, {
      storageKey: 'k',
      horizontal: { minPanelPx: 200, minMainPx: 300 },
    });
    await nextTick();

    result.startResize(new PointerEvent('pointerdown', { button: 0 }));
    // 1000 - 50 = 950, clamped down to 700 (1000 - 300)
    firePointer(window, 'pointermove', { clientX: 50 });
    expect(result.panelSize.value).toBe(700);
    firePointer(window, 'pointerup');
  });

  it('persists current size to localStorage on pointerup', async () => {
    const { result } = setup(makeContainer(1000, 600), true, {
      storageKey: 'k',
      horizontal: { minPanelPx: 200, minMainPx: 300 },
    });
    await nextTick();

    result.startResize(new PointerEvent('pointerdown', { button: 0 }));
    firePointer(window, 'pointermove', { clientX: 500 });
    firePointer(window, 'pointerup');

    expect(hoisted.setNum).toHaveBeenCalledWith('k', 500);
    expect(result.isResizing.value).toBe(false);
  });
});
