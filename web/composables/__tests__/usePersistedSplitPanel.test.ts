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

/** Mount a tiny component that calls the composable, so lifecycle hooks fire. */
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
  return { result, wrapper, containerRef, enabledRef };
}

function firePointer(
  target: EventTarget,
  type: string,
  init: PointerEventInit = {},
) {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, ...init }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  hoisted.getNum.mockReset().mockReturnValue(null);
  hoisted.setNum.mockReset();
  document.body.style.cursor = '';
  document.body.style.userSelect = '';
});

describe('usePersistedSplitPanel', () => {
  // ── Initialization ──────────────────────────────────────────────────────

  describe('initialization', () => {
    it('uses default ratio when no stored value', async () => {
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
        defaultPanelRatio: 1 / 2,
        horizontal: { minPanelPx: 200, minMainPx: 300 },
      });
      await nextTick();
      expect(result.panelSize.value).toBe(500);
      wrapper.unmount();
    });

    it('reads stored value from localStorage', async () => {
      hoisted.getNum.mockReturnValue(400);
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
        horizontal: { minPanelPx: 200, minMainPx: 300 },
      });
      await nextTick();
      expect(result.panelSize.value).toBe(400);
      wrapper.unmount();
    });

    it('clamps stored value to max (container - minMain)', async () => {
      hoisted.getNum.mockReturnValue(900);
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
        horizontal: { minPanelPx: 200, minMainPx: 400 },
      });
      await nextTick();
      expect(result.panelSize.value).toBe(600);
      wrapper.unmount();
    });

    it('clamps stored value to minPanel', async () => {
      hoisted.getNum.mockReturnValue(50);
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
        horizontal: { minPanelPx: 200, minMainPx: 300 },
      });
      await nextTick();
      expect(result.panelSize.value).toBe(200);
      wrapper.unmount();
    });

    it('stays at 0 when disabled', async () => {
      const { result, wrapper } = setup(makeContainer(1000, 600), false, {
        storageKey: 'k',
      });
      await nextTick();
      expect(result.panelSize.value).toBe(0);
      wrapper.unmount();
    });
  });

  // ── Horizontal drag ─────────────────────────────────────────────────────

  describe('horizontal drag', () => {
    it('tracks pointer and updates panelSize', async () => {
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
        horizontal: { minPanelPx: 200, minMainPx: 300 },
      });
      await nextTick();

      result.startResize(new PointerEvent('pointerdown', { button: 0 }));
      expect(result.isResizing.value).toBe(true);

      // panelSize = bounds.right - clientX = 1000 - 350 = 650
      firePointer(window, 'pointermove', { clientX: 350 });
      expect(result.panelSize.value).toBe(650);

      // Move again → 1000 - 600 = 400
      firePointer(window, 'pointermove', { clientX: 600 });
      expect(result.panelSize.value).toBe(400);

      firePointer(window, 'pointerup');
      expect(result.isResizing.value).toBe(false);
      wrapper.unmount();
    });

    it('clamps during drag', async () => {
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
        horizontal: { minPanelPx: 200, minMainPx: 300 },
      });
      await nextTick();
      result.startResize(new PointerEvent('pointerdown', { button: 0 }));

      // Exceed max: 1000 - 50 = 950, clamped to 700 (1000 - 300)
      firePointer(window, 'pointermove', { clientX: 50 });
      expect(result.panelSize.value).toBe(700);

      // Below min: 1000 - 900 = 100, clamped to 200
      firePointer(window, 'pointermove', { clientX: 900 });
      expect(result.panelSize.value).toBe(200);

      firePointer(window, 'pointerup');
      wrapper.unmount();
    });

    it('persists to localStorage on pointerup', async () => {
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
        horizontal: { minPanelPx: 200, minMainPx: 300 },
      });
      await nextTick();

      result.startResize(new PointerEvent('pointerdown', { button: 0 }));
      firePointer(window, 'pointermove', { clientX: 500 });
      firePointer(window, 'pointerup');

      expect(hoisted.setNum).toHaveBeenCalledWith('k', 500);
      wrapper.unmount();
    });

    it('sets col-resize cursor and resets on pointerup', async () => {
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
      });
      await nextTick();

      result.startResize(new PointerEvent('pointerdown', { button: 0 }));
      expect(document.body.style.cursor).toBe('col-resize');
      expect(document.body.style.userSelect).toBe('none');

      firePointer(window, 'pointerup');
      expect(document.body.style.cursor).toBe('');
      expect(document.body.style.userSelect).toBe('');
      wrapper.unmount();
    });
  });

  // ── Vertical drag ───────────────────────────────────────────────────────

  describe('vertical drag', () => {
    it('tracks pointer vertically', async () => {
      const { result, wrapper } = setup(makeContainer(400, 800), true, {
        storageKey: 'k',
        direction: 'vertical',
        vertical: { minPanelPx: 100, minMainPx: 200 },
      });
      await nextTick();

      result.startResize(new PointerEvent('pointerdown', { button: 0 }));

      // panelSize = clientY - bounds.top = 300
      firePointer(window, 'pointermove', { clientY: 300 });
      expect(result.panelSize.value).toBe(300);

      firePointer(window, 'pointerup');
      expect(result.isResizing.value).toBe(false);
      wrapper.unmount();
    });

    it('sets row-resize cursor for vertical direction', async () => {
      const { result, wrapper } = setup(makeContainer(400, 800), true, {
        storageKey: 'k',
        direction: 'vertical',
      });
      await nextTick();

      result.startResize(new PointerEvent('pointerdown', { button: 0 }));
      expect(document.body.style.cursor).toBe('row-resize');

      firePointer(window, 'pointerup');
      expect(document.body.style.cursor).toBe('');
      wrapper.unmount();
    });

    it('uses vertical constraints for initialization and clamping', async () => {
      const { result, wrapper } = setup(makeContainer(400, 800), true, {
        storageKey: 'k',
        direction: 'vertical',
        vertical: { minPanelPx: 100, minMainPx: 200 },
        defaultPanelRatio: 1 / 2,
      });
      await nextTick();
      expect(result.panelSize.value).toBe(400); // 800 * 0.5

      result.startResize(new PointerEvent('pointerdown', { button: 0 }));

      // Exceed max: max = 800 - 200 = 600
      firePointer(window, 'pointermove', { clientY: 750 });
      expect(result.panelSize.value).toBe(600);

      // Below min
      firePointer(window, 'pointermove', { clientY: 50 });
      expect(result.panelSize.value).toBe(100);

      firePointer(window, 'pointerup');
      wrapper.unmount();
    });
  });

  // ── Reactive direction (simulates mobile ↔ desktop switch) ─────────────

  describe('reactive direction', () => {
    it('reinitializes when storage key changes with direction', async () => {
      const dir = ref<'horizontal' | 'vertical'>('horizontal');
      const key = ref('width-key');
      hoisted.getNum.mockImplementation((k: string) =>
        k === 'height-key' ? 250 : null,
      );

      const containerRef = ref(makeContainer(1000, 600));
      const enabledRef = ref(true);
      let result!: SetupResult;
      const wrapper = mount(
        defineComponent({
          setup() {
            result = usePersistedSplitPanel(containerRef as any, enabledRef, {
              storageKey: key,
              direction: dir,
              horizontal: { minPanelPx: 200, minMainPx: 300 },
              vertical: { minPanelPx: 100, minMainPx: 200 },
              defaultPanelRatio: 1 / 3,
            });
            return () => null;
          },
        }),
        { attachTo: document.body },
      );
      await nextTick();

      const initial = result.panelSize.value;
      expect(initial).toBeGreaterThan(0);

      // Switch to vertical with a different storage key
      dir.value = 'vertical';
      key.value = 'height-key';
      await nextTick();

      expect(result.panelSize.value).toBe(250);
      wrapper.unmount();
    });
  });

  // ── Edge cases ──────────────────────────────────────────────────────────

  describe('edge cases', () => {
    it('ignores non-primary button', async () => {
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
      });
      await nextTick();

      result.startResize(new PointerEvent('pointerdown', { button: 2 }));
      expect(result.isResizing.value).toBe(false);
      wrapper.unmount();
    });

    it('ignores startResize if already resizing', async () => {
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
        horizontal: { minPanelPx: 200, minMainPx: 300 },
      });
      await nextTick();

      result.startResize(new PointerEvent('pointerdown', { button: 0 }));
      expect(result.isResizing.value).toBe(true);

      firePointer(window, 'pointermove', { clientX: 400 });
      const size = result.panelSize.value;

      // Second startResize should be a no-op
      result.startResize(new PointerEvent('pointerdown', { button: 0 }));
      firePointer(window, 'pointermove', { clientX: 200 });
      expect(result.panelSize.value).not.toBe(size); // still tracking original drag

      firePointer(window, 'pointerup');
      wrapper.unmount();
    });

    it('cleans up listeners on unmount', async () => {
      const { result, wrapper } = setup(makeContainer(1000, 600), true, {
        storageKey: 'k',
        horizontal: { minPanelPx: 200, minMainPx: 300 },
      });
      await nextTick();

      result.startResize(new PointerEvent('pointerdown', { button: 0 }));
      expect(result.isResizing.value).toBe(true);

      wrapper.unmount();
      expect(result.isResizing.value).toBe(false);
      expect(document.body.style.cursor).toBe('');
    });
  });
});
