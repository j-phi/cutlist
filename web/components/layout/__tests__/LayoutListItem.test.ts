// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';

import type { SheetBoardLayout, SheetBoardLayoutPlacement } from 'cutlist';

import LayoutListItem from '../LayoutListItem.vue';

const requestGrainLockChange = vi.fn();
const isRulerActive = ref(false);
const boardMeasurements = ref<unknown[]>([]);

mockNuxtImport('useGetPx', () => () => (m: number) => `${m * 100}px`);
mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) => (m == null ? '' : `${m}m`),
);
mockNuxtImport('useGrainLockConfirm', () => () => ({
  requestGrainLockChange,
}));
mockNuxtImport('useRulerStore', () => () => ({
  isRulerActive,
  getMeasurementsForBoard: () => computed(() => boardMeasurements.value),
}));
mockNuxtImport('getMaterialColor', () => (_hex: string | undefined) => ({
  board: '#000001',
  part: '#000002',
  partHover: '#000003',
  text: '#000004',
  textHover: '#000005',
  grain: '#000006',
}));

function makePlacement(
  overrides: Partial<SheetBoardLayoutPlacement> = {},
): SheetBoardLayoutPlacement {
  return {
    partNumber: 1,
    instanceNumber: 1,
    name: 'Side panel',
    material: 'Plywood',
    widthM: 0.3,
    lengthM: 0.6,
    thicknessM: 0.018,
    leftM: 0,
    rightM: 0.3,
    topM: 0.6,
    bottomM: 0,
    ...overrides,
  };
}

function makeLayout(
  placements: SheetBoardLayoutPlacement[] = [makePlacement()],
): SheetBoardLayout {
  return {
    kind: 'sheet',
    stock: {
      material: 'Plywood',
      widthM: 1.0,
      lengthM: 2.0,
      thicknessM: 0.018,
      color: '#abcdef',
    },
    placements,
    marginM: 0,
    algorithm: 'compact',
  };
}

describe('LayoutListItem', () => {
  function getComponent(layout: SheetBoardLayout, boardIndex = 0) {
    return shallowMount(LayoutListItem, {
      props: { layout, boardIndex },
      global: {
        stubs: {
          PartListItem: true,
          BoardRulerOverlay: true,
          PartDetailsTooltip: true,
          Teleport: true,
        },
      },
      attachTo: document.body,
    });
  }

  afterEach(() => {
    requestGrainLockChange.mockClear();
    isRulerActive.value = false;
    boardMeasurements.value = [];
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('Should render all five --part-* CSS variables in boardStyle', () => {
      const component = getComponent(makeLayout());
      const board = component.find('.rounded.relative');
      const style = board.attributes('style') ?? '';

      expect(style).toContain('--part-color: #000002');
      expect(style).toContain('--part-hover: #000003');
      expect(style).toContain('--part-text: #000004');
      expect(style).toContain('--part-text-hover: #000005');
      expect(style).toContain('--part-grain: #000006');
      expect(style).toContain('background: #000001');
    });
  });

  describe('On board pointer interaction', () => {
    function setBoardRect(component: ReturnType<typeof getComponent>) {
      const board = component.find('.rounded.relative').element as HTMLElement;
      Object.defineProperty(board, 'getBoundingClientRect', {
        configurable: true,
        value: () => ({
          // Board is 1m × 2m → 100px × 200px in our mocked getPx
          left: 0,
          top: 0,
          right: 100,
          bottom: 200,
          width: 100,
          height: 200,
          x: 0,
          y: 0,
          toJSON() {
            return this;
          },
        }),
      });
      return board;
    }

    it('Should call requestGrainLockChange on a near-stationary click over a placement', async () => {
      // Placement: leftM=0, widthM=0.3, bottomM=0, lengthM=0.6.
      // Board mapped 1m × 2m → 100 × 200 px. Place pointer at (15, 170) which
      // maps to xM=0.15, yM=0.3 — inside the placement.
      const placement = makePlacement({
        partNumber: 11,
        grainLock: 'length',
      });
      const component = getComponent(makeLayout([placement]));
      setBoardRect(component);

      const board = component.find('.rounded.relative');
      await board.trigger('pointerdown', { clientX: 15, clientY: 170 });
      document.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 16, clientY: 170 }),
      );

      expect(requestGrainLockChange).toHaveBeenCalledTimes(1);
      expect(requestGrainLockChange).toHaveBeenCalledWith(
        11,
        'length',
        placement,
      );
    });

    it('Should NOT call requestGrainLockChange when isRulerActive is true', async () => {
      isRulerActive.value = true;
      const component = getComponent(makeLayout());
      setBoardRect(component);

      const board = component.find('.rounded.relative');
      await board.trigger('pointerdown', { clientX: 15, clientY: 170 });
      document.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 15, clientY: 170 }),
      );

      expect(requestGrainLockChange).not.toHaveBeenCalled();
    });

    it('Should NOT call requestGrainLockChange when pointerdown misses every placement', async () => {
      const component = getComponent(makeLayout());
      setBoardRect(component);

      // (90, 10) maps to xM=0.9, yM=1.95 — outside the only placement.
      const board = component.find('.rounded.relative');
      await board.trigger('pointerdown', { clientX: 90, clientY: 10 });
      document.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 90, clientY: 10 }),
      );

      expect(requestGrainLockChange).not.toHaveBeenCalled();
    });
  });
});
