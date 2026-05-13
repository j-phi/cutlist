// @vitest-environment nuxt
import { mount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RulerMeasurement } from '~/composables/useRulerStore';
import { mmToUm, type Micrometres } from 'cutlist';

import DimensionAnnotation from '../DimensionAnnotation.vue';

mockNuxtImport(
  'useFormatDistance',
  () => () => (um: Micrometres | undefined | null) =>
    um == null ? '' : `${um}um`,
);

function makeMeasurement(
  overrides: Partial<RulerMeasurement> = {},
): RulerMeasurement {
  return {
    id: 'm1',
    boardIndex: 0,
    axis: 'x',
    anchorAUm: mmToUm(100),
    anchorBUm: mmToUm(500),
    offsetUm: mmToUm(200),
    ...overrides,
  };
}

const SvgWrapper = {
  components: { DimensionAnnotation },
  props: {
    measurement: { type: Object, required: true },
    boardWidthUm: { type: Number, required: true },
    boardLengthUm: { type: Number, required: true },
    preview: { type: Boolean, default: false },
  },
  emits: ['remove', 'updateOffset'],
  template: `
    <svg ref="svgEl" width="500" height="1000">
      <DimensionAnnotation
        :measurement="measurement"
        :board-width-um="boardWidthUm"
        :board-length-um="boardLengthUm"
        :preview="preview"
        @remove="$emit('remove')"
        @update-offset="$emit('updateOffset', $event)"
      />
    </svg>
  `,
};

describe('DimensionAnnotation', () => {
  function getComponent(
    props: {
      measurement?: Partial<RulerMeasurement>;
      boardWidthUm?: Micrometres;
      boardLengthUm?: Micrometres;
      preview?: boolean;
    } = {},
  ) {
    const wrapper = mount(SvgWrapper, {
      props: {
        measurement: makeMeasurement(props.measurement),
        boardWidthUm: props.boardWidthUm ?? mmToUm(1000),
        boardLengthUm: props.boardLengthUm ?? mmToUm(2000),
        preview: props.preview ?? false,
      },
      attachTo: document.body,
    });

    // Stub the <svg> bounding rect so coordinate math is deterministic. The
    // SVG's frame is left=0, top=0, w=500, h=1000.
    const svg = wrapper.find('svg').element as SVGElement;
    Object.defineProperty(svg, 'getBoundingClientRect', {
      configurable: true,
      value: () => ({
        left: 0,
        top: 0,
        right: 500,
        bottom: 1000,
        width: 500,
        height: 1000,
        x: 0,
        y: 0,
        toJSON() {
          return this;
        },
      }),
    });

    return wrapper;
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('On pointer interaction', () => {
    it('Should emit updateOffset on pointermove for an x-axis measurement', async () => {
      const component = getComponent({
        measurement: { axis: 'x' },
        boardLengthUm: mmToUm(2000),
      });

      const g = component.find('g');
      await g.trigger('pointerdown', { clientX: 100, clientY: 800 });
      await g.trigger('pointermove', { clientX: 100, clientY: 800 });

      // fracY = (1000 - 800) / 1000 = 0.2 → newOffset = 0.2 * 2_000_000 µm = 400_000 µm.
      const last = (component.emitted('updateOffset') as number[][]).at(-1)!;
      expect(last[0]).toBe(400_000);
    });

    it('Should emit updateOffset for a y-axis measurement based on x position', async () => {
      const component = getComponent({
        measurement: {
          axis: 'y',
          anchorAUm: mmToUm(100),
          anchorBUm: mmToUm(400),
          offsetUm: mmToUm(100),
        },
        boardWidthUm: mmToUm(1000),
      });

      const g = component.find('g');
      await g.trigger('pointerdown', { clientX: 50, clientY: 50 });
      await g.trigger('pointermove', { clientX: 250, clientY: 50 });

      // fracX = 250 / 500 = 0.5 → newOffset = 0.5 * 1_000_000 µm = 500_000 µm.
      const last = (component.emitted('updateOffset') as number[][]).at(-1)!;
      expect(last[0]).toBe(500_000);
    });

    it('Should emit remove on pointerup after dragging well past the board edge', async () => {
      const component = getComponent({
        measurement: { axis: 'x' },
        boardLengthUm: mmToUm(2000),
      });

      const g = component.find('g');
      await g.trigger('pointerdown', { clientX: 100, clientY: 100 });
      // fracY = (1000 - (-100)) / 1000 = 1.1 → newOffset = 2_200_000 µm,
      // which is 200 mm past the board (slop = 20 mm) → pendingRemove.
      await g.trigger('pointermove', { clientX: 100, clientY: -100 });
      await g.trigger('pointerup');

      expect(component.emitted('remove')).toEqual([[]]);
    });

    it('Should NOT emit remove on pointerup when the offset stays within the board', async () => {
      const component = getComponent({
        measurement: { axis: 'x' },
        boardLengthUm: mmToUm(2000),
      });

      const g = component.find('g');
      await g.trigger('pointerdown', { clientX: 100, clientY: 800 });
      await g.trigger('pointermove', { clientX: 100, clientY: 600 });
      await g.trigger('pointerup');

      expect(component.emitted('remove')).toBeUndefined();
    });
  });
});
