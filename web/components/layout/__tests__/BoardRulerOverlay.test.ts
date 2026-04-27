// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { computed, ref } from 'vue';
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

const snapEdgesRef = ref<SnapEdge[]>([]);
mockNuxtImport('useSnapEdges', () => () => computed(() => snapEdgesRef.value));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeLayout(widthM = 1, lengthM = 2): BoardLayout {
  return {
    stock: { material: 'Plywood', widthM, lengthM, thicknessM: 0.018 },
    placements: [],
    marginM: 0,
  };
}

function getComponent(boardIndex = 0, layout = makeLayout()) {
  const component = shallowMount(BoardRulerOverlay, {
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
  return component;
}

function dispatchMouseMove(
  component: ReturnType<typeof getComponent>,
  clientX: number,
  clientY: number,
) {
  const svg = component.find('svg').element as SVGSVGElement;
  // Provide a deterministic bounding rect so position math is predictable.
  const rect = {
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
  svg.getBoundingClientRect = () => rect;
  const event = new MouseEvent('mousemove', {
    clientX,
    clientY,
    bubbles: true,
  });
  svg.dispatchEvent(event);
}

function dispatchClick(
  component: ReturnType<typeof getComponent>,
  clientX: number,
  clientY: number,
) {
  const svg = component.find('svg').element as SVGSVGElement;
  const rect = {
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
  svg.getBoundingClientRect = () => rect;
  const event = new MouseEvent('click', {
    clientX,
    clientY,
    bubbles: true,
  });
  svg.dispatchEvent(event);
}

beforeEach(() => {
  isRulerActive.value = false;
  pendingClick.value = null;
  measurementsForBoard.value = [];
  snapEdgesRef.value = [];
  startMeasurement.mockClear();
  completeMeasurement.mockClear();
  removeMeasurement.mockClear();
  updateMeasurementOffset.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('BoardRulerOverlay', () => {
  describe('On mousemove', () => {
    it('Should be a no-op when the ruler is inactive', () => {
      snapEdgesRef.value = [{ axis: 'x', positionM: 0, boardIndex: 0 }];
      const component = getComponent();

      dispatchMouseMove(component, 250, 500);

      // No pre-click highlight rendered.
      expect(component.html()).not.toContain('stroke-opacity="0.4"');
    });

    it('Should highlight the nearest edge when active and pendingClick is null', async () => {
      isRulerActive.value = true;
      // Vertical edge at x=0.5m on a 1m wide board.
      snapEdgesRef.value = [{ axis: 'x', positionM: 0.5, boardIndex: 0 }];
      const component = getComponent();

      // Hover near x=250px (= 0.5m on a 500px wide rect).
      dispatchMouseMove(component, 252, 500);
      await component.vm.$nextTick();

      // Pre-click highlight line is rendered with stroke-opacity 0.4.
      expect(component.html()).toContain('stroke-opacity="0.4"');
    });
  });

  describe('On click', () => {
    it('Should call startMeasurement when no click is pending', () => {
      isRulerActive.value = true;
      const edge: SnapEdge = { axis: 'x', positionM: 0.5, boardIndex: 0 };
      snapEdgesRef.value = [edge];
      const component = getComponent();

      // Click near the snap edge.
      dispatchClick(component, 250, 500);

      expect(startMeasurement).toHaveBeenCalledTimes(1);
      expect(startMeasurement.mock.calls[0][0]).toMatchObject({
        axis: 'x',
        positionM: 0.5,
      });
    });

    it('Should call completeMeasurement on the second click', () => {
      isRulerActive.value = true;
      const firstEdge: SnapEdge = { axis: 'x', positionM: 0.0, boardIndex: 0 };
      const secondEdge: SnapEdge = { axis: 'x', positionM: 1.0, boardIndex: 0 };
      snapEdgesRef.value = [firstEdge, secondEdge];
      pendingClick.value = { edge: firstEdge, boardIndex: 0 };
      const component = getComponent();

      // Click near x=500px which is 1.0m → second edge.
      dispatchClick(component, 498, 500);

      expect(completeMeasurement).toHaveBeenCalledTimes(1);
      const arg = completeMeasurement.mock.calls[0][0] as SnapEdge;
      expect(arg.positionM).toBe(1.0);
    });
  });

  describe('Preview measurement', () => {
    it('Should render the preview only on the matching boardIndex', async () => {
      isRulerActive.value = true;
      const firstEdge: SnapEdge = { axis: 'x', positionM: 0.0, boardIndex: 0 };
      const secondEdge: SnapEdge = { axis: 'x', positionM: 1.0, boardIndex: 0 };
      snapEdgesRef.value = [firstEdge, secondEdge];
      pendingClick.value = { edge: firstEdge, boardIndex: 0 };

      const matching = getComponent(0);
      const nonMatching = getComponent(1);

      // Hover near second edge on each.
      dispatchMouseMove(matching, 498, 500);
      dispatchMouseMove(nonMatching, 498, 500);
      await matching.vm.$nextTick();
      await nonMatching.vm.$nextTick();

      const previewMatching = matching.find('[data-id="__preview__"]');
      const previewNonMatching = nonMatching.find('[data-id="__preview__"]');
      expect(previewMatching.exists()).toBe(true);
      expect(previewMatching.attributes('data-preview')).toBe('true');
      expect(previewNonMatching.exists()).toBe(false);
    });
  });
});

// TODO(test): keyboard ESC handling is in useRulerStore (separate composable).
// TODO(test): existing measurement annotations passed to DimensionAnnotation —
//   one-line v-for delegation; covered by the store unit tests.
// TODO(test): handleMouseLeave clearing — small bookkeeping branch.
