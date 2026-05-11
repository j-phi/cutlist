// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import {
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  type LinearStockMatrix,
} from 'cutlist';

import LinearDimensions from '../LinearDimensions.vue';
import { UButtonStub, UInputStub } from '~/test-utils/stubs';

function makePine24(): LinearStockMatrix {
  return {
    kind: 'linear',
    material: 'Pine 2×4',
    color: '#d2b996',
    size: {
      crossSectionWidth: 88.9,
      crossSectionThickness: 38.1,
      lengths: [2438.4, 3048, 3657.6, 4876.8],
    },
  };
}

function makeCls(): LinearStockMatrix {
  return {
    kind: 'linear',
    material: 'CLS 38×89',
    color: '#d2b996',
    size: {
      crossSectionWidth: 89,
      crossSectionThickness: 38,
      lengths: [2400, 3000, 3600, 4800],
    },
  };
}

function mountInput(modelValue: LinearStockMatrix, unit: 'mm' | 'in' = 'mm') {
  const precision =
    unit === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION;
  return mount(LinearDimensions, {
    props: { modelValue, distanceUnit: unit, precision },
    global: {
      stubs: {
        UInput: UInputStub,
        UButton: UButtonStub,
        UIcon: true,
      },
    },
  });
}

function emittedLatest(
  wrapper: ReturnType<typeof mountInput>,
): LinearStockMatrix | undefined {
  const events = wrapper.emitted('update:modelValue');
  if (!events?.length) return undefined;
  return events[events.length - 1][0] as LinearStockMatrix;
}

function lengthInputs(wrapper: ReturnType<typeof mountInput>) {
  return wrapper
    .findAll('[data-testid="linear-length-row"] input')
    .filter((el) => el.attributes('data-length-mm') != null);
}

function crossSectionInputs(wrapper: ReturnType<typeof mountInput>) {
  return {
    thickness: wrapper.find('[data-testid="linear-cross-thickness"]'),
    width: wrapper.find('[data-testid="linear-cross-width"]'),
  };
}

describe('LinearDimensions', () => {
  describe('Cross-section editing', () => {
    it.each([
      ['mm', makeCls, '38', '89'],
      ['in', makePine24, '1 1/2', '3 1/2'], // Pine 2×4 nominal
    ] as const)(
      'renders cross-section in the active unit (%s)',
      (unit, factory, t, w) => {
        const { thickness, width } = crossSectionInputs(
          mountInput(factory(), unit),
        );
        expect((thickness.element as HTMLInputElement).value).toBe(t);
        expect((width.element as HTMLInputElement).value).toBe(w);
      },
    );

    it('commits typed cross-section value on blur, converting inches to mm', async () => {
      const wrapper = mountInput(makePine24(), 'in');
      const { width } = crossSectionInputs(wrapper);
      await width.setValue('5 1/2');
      await width.trigger('blur');
      expect(emittedLatest(wrapper)?.size.crossSectionWidth).toBeCloseTo(
        139.7,
        1,
      );
    });

    it('discards invalid input without emitting', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      const { thickness } = crossSectionInputs(wrapper);
      await thickness.setValue('not a number');
      await thickness.trigger('blur');
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
    });
  });

  describe('Length editing', () => {
    it('removes a row by index, preserving the rest sorted asc', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      await wrapper
        .findAll('[data-testid="linear-length-remove"]')[1]
        .trigger('click');
      expect(emittedLatest(wrapper)?.size.lengths).toEqual([2400, 3600, 4800]);
    });

    it('seeds the longest existing length when adding to a non-empty list', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      await wrapper.find('[data-testid="linear-length-add"]').trigger('click');
      expect(emittedLatest(wrapper)?.size.lengths).toEqual([
        2400, 3000, 3600, 4800, 4800,
      ]);
    });

    it.each([
      ['mm', 2400],
      ['in', 2438.4], // 96″
    ] as const)(
      'seeds the unit-appropriate default when adding to an empty list (%s)',
      async (unit, expectedMm) => {
        const empty = {
          ...makeCls(),
          size: { ...makeCls().size, lengths: [] },
        };
        const wrapper = mountInput(empty, unit);
        await wrapper
          .find('[data-testid="linear-length-add"]')
          .trigger('click');
        const lengths = emittedLatest(wrapper)?.size.lengths;
        expect(lengths).toHaveLength(1);
        expect(lengths![0]).toBeCloseTo(expectedMm, 1);
      },
    );

    it('commits a typed length on blur, re-sorting ascending', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      const inputs = lengthInputs(wrapper);
      await inputs[1].setValue('2500');
      await inputs[1].trigger('blur');
      expect(emittedLatest(wrapper)?.size.lengths).toEqual([
        2400, 2500, 3600, 4800,
      ]);
    });

    it('converts inch input to mm on commit', async () => {
      const wrapper = mountInput(makePine24(), 'in');
      const inputs = lengthInputs(wrapper);
      await inputs[0].setValue('100');
      await inputs[0].trigger('blur');
      expect(emittedLatest(wrapper)?.size.lengths?.[0]).toBeCloseTo(2540, 1);
    });
  });
});
