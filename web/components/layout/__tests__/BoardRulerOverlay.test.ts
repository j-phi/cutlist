// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import type { BoardLayout } from 'cutlist';
import type { SnapEdge } from '~/composables/useRulerStore';

import BoardRulerOverlay from '../BoardRulerOverlay.vue';

// ── Mocks ────────────────────────────────────────────────────────────────────

const isRulerActive = ref(false);
const pendingClick = ref<{ edge: SnapEdge; boardIndex: number } | null>(null);
const startMeasurement = vi.fn();
const completeMeasurement = vi.fn();
const removeMeasurement = vi.fn();
const updateMeasurementOffset = vi.fn();
const measurementsForBoard = ref<unknown[]>([]);

mockNuxtImport('useRulerStore', () => () => ({
  isRulerActive,
  pendingClick,
  startMeasurement,
  completeMeasurement,
  removeMeasurement,
  updateMeasurementOffset,
  getMeasurementsForBoard: () => measurementsForBoard,
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Snap edges are derived from the layout: board has edges at 0/widthM/0/lengthM
 * (axes x/y), and each placement contributes its own four edges. Tests construct
 * layouts whose snap edges are the inputs they need.
 */
function makeLayout(widthM = 1, lengthM = 2): BoardLayout {
  return {
    stock: { material: 'Plywood', widthM, lengthM, thicknessM: 0.018 },
    placements: [],
    marginM: 0,
    algorithm: 'compact',
  };
}

function getComponent(boardIndex = 0, layout = makeLayout()) {
  return shallowMount(BoardRulerOverlay, {
    props: { layout, boardIndex },
    global: {
      stubs: {
        DimensionAnnotation: {
          props: {
            measurement: { type: Object, required: true },
            boardWidthM: { type: Number, required: true },
            boardLengthM: { type: Number, required: true },
            preview: { type: Boolean, default: false },
          },
          template:
            '<g data-testid="dimension" :data-id="measurement.id" :data-preview="preview ? \'true\' : \'false\'" />',
        },
      },
    },
  });
}

const STD_RECT = {
  left: 0,
  top: 0,
  right: 500,
  bottom: 1000,
  width: 500,
  height: 1000,
  x: 0,
  y: 0,
  toJSON() {
    return {};
  },
} as DOMRect;

function dispatch(
  component: ReturnType<typeof getComponent>,
  type: 'mousemove' | 'click',
  clientX: number,
  clientY: number,
) {
  const svg = component.find('svg').element as SVGSVGElement;
  svg.getBoundingClientRect = () => STD_RECT;
  svg.dispatchEvent(new MouseEvent(type, { clientX, clientY, bubbles: true }));
}

beforeEach(() => {
  isRulerActive.value = false;
  pendingClick.value = null;
  measurementsForBoard.value = [];
  startMeasurement.mockClear();
  completeMeasurement.mockClear();
  removeMeasurement.mockClear();
  updateMeasurementOffset.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BoardRulerOverlay', () => {
  it('Should be a no-op on mousemove when the ruler is inactive', () => {
    const component = getComponent();

    dispatch(component, 'mousemove', 250, 500);

    expect(component.html()).not.toContain('stroke-opacity="0.4"');
  });

  it('Should highlight the nearest edge when active and pendingClick is null', async () => {
    isRulerActive.value = true;
    // 1m wide layout → board's right edge is a snap at x = 1m. Hover near
    // 498px (= ~0.996m on a 500px-wide rect) is within the 0.03m threshold.
    const component = getComponent(0, makeLayout(1, 2));

    dispatch(component, 'mousemove', 498, 500);
    await component.vm.$nextTick();

    expect(component.html()).toContain('stroke-opacity="0.4"');
  });

  it('Should call startMeasurement on first click near a snap edge', () => {
    isRulerActive.value = true;
    // 1m wide → snap edges at x=0 and x=1. Click at 498px snaps to x=1.
    const component = getComponent(0, makeLayout(1, 2));

    dispatch(component, 'click', 498, 500);

    expect(startMeasurement).toHaveBeenCalledTimes(1);
    expect(startMeasurement.mock.calls[0][0]).toMatchObject({
      axis: 'x',
      positionM: 1,
    });
  });

  it('Should call completeMeasurement on the second click', () => {
    isRulerActive.value = true;
    // 1m wide layout gives snap edges at x=0 and x=1.
    const layout = makeLayout(1, 2);
    pendingClick.value = {
      edge: { axis: 'x', positionM: 0, boardIndex: 0 },
      boardIndex: 0,
    };
    const component = getComponent(0, layout);

    dispatch(component, 'click', 498, 500);

    expect(completeMeasurement).toHaveBeenCalledTimes(1);
    const arg = completeMeasurement.mock.calls[0][0] as SnapEdge;
    expect(arg.positionM).toBe(1);
  });

  it('Should render the preview only on the matching boardIndex', async () => {
    isRulerActive.value = true;
    const layout = makeLayout(1, 2);
    pendingClick.value = {
      edge: { axis: 'x', positionM: 0, boardIndex: 0 },
      boardIndex: 0,
    };

    const matching = getComponent(0, layout);
    const nonMatching = getComponent(1, layout);

    dispatch(matching, 'mousemove', 498, 500);
    dispatch(nonMatching, 'mousemove', 498, 500);
    await matching.vm.$nextTick();
    await nonMatching.vm.$nextTick();

    expect(matching.find('[data-id="__preview__"]').exists()).toBe(true);
    expect(
      matching.find('[data-id="__preview__"]').attributes('data-preview'),
    ).toBe('true');
    expect(nonMatching.find('[data-id="__preview__"]').exists()).toBe(false);
  });
});
