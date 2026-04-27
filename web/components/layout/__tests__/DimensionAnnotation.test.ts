// @vitest-environment nuxt
import { mount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { RulerMeasurement } from '~/composables/useRulerStore';
import { PX_PER_M } from '~/composables/useGetPx';

import DimensionAnnotation from '../DimensionAnnotation.vue';

mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) => (m == null ? '' : `${m}m`),
);

function makeMeasurement(
  overrides: Partial<RulerMeasurement> = {},
): RulerMeasurement {
  return {
    id: 'm1',
    boardIndex: 0,
    axis: 'x',
    anchorA: 0.1,
    anchorB: 0.5,
    offsetM: 0.2,
    ...overrides,
  };
}

const SvgWrapper = {
  components: { DimensionAnnotation },
  props: {
    measurement: { type: Object, required: true },
    boardWidthM: { type: Number, required: true },
    boardLengthM: { type: Number, required: true },
    preview: { type: Boolean, default: false },
  },
  emits: ['remove', 'updateOffset'],
  template: `
    <svg ref="svgEl" width="500" height="1000">
      <DimensionAnnotation
        :measurement="measurement"
        :board-width-m="boardWidthM"
        :board-length-m="boardLengthM"
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
      boardWidthM?: number;
      boardLengthM?: number;
      preview?: boolean;
    } = {},
  ) {
    const wrapper = mount(SvgWrapper, {
      props: {
        measurement: makeMeasurement(props.measurement),
        boardWidthM: props.boardWidthM ?? 1.0,
        boardLengthM: props.boardLengthM ?? 2.0,
        preview: props.preview ?? false,
      },
      attachTo: document.body,
    });

    // Stub the <svg> bounding rect so coordinate math is deterministic. The
    // SVG's frame is left=0, top=0, w=500, h=1000 (matches its viewport).
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

  describe('Rendering', () => {
    it('Should render an x-axis label without a rotate transform', () => {
      const component = getComponent({
        measurement: { axis: 'x', offsetM: 0.2 },
      });
      const transform = component.find('text').attributes('transform');

      // X-axis: scale + translate, no rotate.
      expect(transform).toContain('scale(1,-1)');
      expect(transform).not.toContain('rotate');
    });

    it('Should render a y-axis label with a rotate(-90) transform', () => {
      const component = getComponent({
        measurement: { axis: 'y', anchorA: 0.1, anchorB: 0.4, offsetM: 0.2 },
      });
      const transform = component.find('text').attributes('transform');

      expect(transform).toContain('rotate(-90');
      expect(transform).toContain('scale(1,-1)');
    });

    it('Should render arrowhead points strings on both ends', () => {
      const component = getComponent({
        measurement: { axis: 'x', anchorA: 0.1, anchorB: 0.5, offsetM: 0.2 },
      });

      const polygons = component.findAll('polygon');
      expect(polygons).toHaveLength(2);
      // minPx = 0.1 * 500 = 50, maxPx = 0.5 * 500 = 250, offsetPx = 100
      expect(polygons[0].attributes('points')).toBe('50,100 56,97 56,103');
      expect(polygons[1].attributes('points')).toBe('250,100 244,97 244,103');
    });
  });

  describe('On pointer interaction', () => {
    it('Should be a no-op on pointerdown when preview is true', async () => {
      const component = getComponent({ preview: true });

      await component
        .find('g')
        .trigger('pointerdown', { clientX: 100, clientY: 100 });

      // Move should also be ignored because dragging never started.
      await component
        .find('g')
        .trigger('pointermove', { clientX: 200, clientY: 200 });

      expect(component.emitted('updateOffset')).toBeUndefined();
      expect(component.emitted('remove')).toBeUndefined();
    });

    it('Should emit updateOffset with the new offset in m on pointermove', async () => {
      const component = getComponent({
        measurement: { axis: 'x' },
        boardLengthM: 2.0,
      });

      const g = component.find('g');
      await g.trigger('pointerdown', { clientX: 100, clientY: 800 });
      await g.trigger('pointermove', { clientX: 100, clientY: 800 });

      // axis x: fracY = (1000 - 800) / 1000 = 0.2 → newOffsetM = 0.2 * 2.0 = 0.4
      expect(component.emitted('updateOffset')).toBeDefined();
      const last = (component.emitted('updateOffset') as number[][]).at(-1)!;
      expect(last[0]).toBeCloseTo(0.4, 5);
    });

    it('Should emit updateOffset for a y-axis measurement based on x position', async () => {
      const component = getComponent({
        measurement: { axis: 'y', anchorA: 0.1, anchorB: 0.4, offsetM: 0.1 },
        boardWidthM: 1.0,
      });

      const g = component.find('g');
      await g.trigger('pointerdown', { clientX: 50, clientY: 50 });
      await g.trigger('pointermove', { clientX: 250, clientY: 50 });

      // axis y: fracX = (250 - 0) / 500 = 0.5 → newOffsetM = 0.5 * 1.0 = 0.5
      expect(component.emitted('updateOffset')).toBeDefined();
      const last = (component.emitted('updateOffset') as number[][]).at(-1)!;
      expect(last[0]).toBeCloseTo(0.5, 5);
    });

    it('Should emit remove on pointerup when pendingRemove is true', async () => {
      const component = getComponent({
        measurement: { axis: 'x' },
        boardLengthM: 2.0,
      });

      const g = component.find('g');
      // Start a drag, then move outside the board (clientY way above the top).
      await g.trigger('pointerdown', { clientX: 100, clientY: 100 });
      // fracY = (1000 - (-100)) / 1000 = 1.1 → newOffsetM = 2.2 > 2.02 → pendingRemove
      await g.trigger('pointermove', { clientX: 100, clientY: -100 });
      await g.trigger('pointerup');

      expect(component.emitted('remove')).toEqual([[]]);
    });

    it('Should NOT emit remove on pointerup when within the board', async () => {
      const component = getComponent({
        measurement: { axis: 'x' },
        boardLengthM: 2.0,
      });

      const g = component.find('g');
      await g.trigger('pointerdown', { clientX: 100, clientY: 800 });
      await g.trigger('pointermove', { clientX: 100, clientY: 600 });
      await g.trigger('pointerup');

      expect(component.emitted('remove')).toBeUndefined();
    });
  });

  describe('Geometry', () => {
    it('Should place the dimension line at offsetM × PX_PER_M', () => {
      const component = getComponent({
        measurement: { axis: 'x', anchorA: 0.0, anchorB: 0.5, offsetM: 0.3 },
      });

      // The dimension line is the third <line> (after two extension lines).
      const lines = component.findAll('line');
      const dimLine = lines[2];
      const expected = String(0.3 * PX_PER_M);
      expect(dimLine.attributes('y1')).toBe(expected);
      expect(dimLine.attributes('y2')).toBe(expected);
    });
  });
});
