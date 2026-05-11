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
    it('renders cross-section dimensions in the active unit (mm)', () => {
      const { thickness, width } = crossSectionInputs(
        mountInput(makeCls(), 'mm'),
      );
      expect((thickness.element as HTMLInputElement).value).toBe('38');
      expect((width.element as HTMLInputElement).value).toBe('89');
    });

    it('renders cross-section dimensions in inches (nominal lumber)', () => {
      const { thickness, width } = crossSectionInputs(
        mountInput(makePine24(), 'in'),
      );
      // Pine 2×4 nominal: 1 1/2" × 3 1/2"
      expect((thickness.element as HTMLInputElement).value).toBe('1 1/2');
      expect((width.element as HTMLInputElement).value).toBe('3 1/2');
    });

    it('editing cross-section thickness in mm commits to size.crossSectionThickness on blur', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      const { thickness } = crossSectionInputs(wrapper);
      await thickness.setValue('44');
      await thickness.trigger('blur');
      expect(emittedLatest(wrapper)?.size.crossSectionThickness).toBe(44);
    });

    it('editing cross-section width in inches converts to mm on commit', async () => {
      const wrapper = mountInput(makePine24(), 'in');
      const { width } = crossSectionInputs(wrapper);
      await width.setValue('5 1/2');
      await width.trigger('blur');
      // 5.5" = 139.7mm
      expect(emittedLatest(wrapper)?.size.crossSectionWidth).toBeCloseTo(
        139.7,
        1,
      );
    });

    it('invalid cross-section input is discarded without emitting', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      const { thickness } = crossSectionInputs(wrapper);
      await thickness.setValue('not a number');
      await thickness.trigger('blur');
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
    });
  });

  describe('Length editing', () => {
    it('renders one editable row per length in modelValue', () => {
      expect(lengthInputs(mountInput(makeCls(), 'mm'))).toHaveLength(4);
    });

    it('removing a row emits update:modelValue without that length', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      // Second row corresponds to 3000mm (lengths are sorted asc).
      await wrapper
        .findAll('[data-testid="linear-length-remove"]')[1]
        .trigger('click');
      expect(emittedLatest(wrapper)?.size.lengths).toEqual([2400, 3600, 4800]);
    });

    it('adding a length seeds the longest current length', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      await wrapper.find('[data-testid="linear-length-add"]').trigger('click');
      // 4800 duplicated (it was already the max).
      expect(emittedLatest(wrapper)?.size.lengths).toEqual([
        2400, 3000, 3600, 4800, 4800,
      ]);
    });

    it('adding to an empty list seeds 96″ in inch mode', async () => {
      const empty = { ...makeCls(), size: { ...makeCls().size, lengths: [] } };
      const wrapper = mountInput(empty, 'in');
      await wrapper.find('[data-testid="linear-length-add"]').trigger('click');
      const lengths = emittedLatest(wrapper)?.size.lengths;
      // 96″ = 2438.4 mm.
      expect(lengths).toHaveLength(1);
      expect(lengths![0]).toBeCloseTo(2438.4, 1);
    });

    it('adding to an empty list seeds 2400mm in metric mode', async () => {
      const empty = { ...makeCls(), size: { ...makeCls().size, lengths: [] } };
      const wrapper = mountInput(empty, 'mm');
      await wrapper.find('[data-testid="linear-length-add"]').trigger('click');
      expect(emittedLatest(wrapper)?.size.lengths).toEqual([2400]);
    });

    it('editing in mm commits the typed value on blur', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      const inputs = lengthInputs(wrapper);
      // Type "2500" into the second row, then blur.
      await inputs[1].setValue('2500');
      await inputs[1].trigger('blur');
      // 3000 replaced with 2500; result re-sorted ascending.
      expect(emittedLatest(wrapper)?.size.lengths).toEqual([
        2400, 2500, 3600, 4800,
      ]);
    });

    it('editing in inches converts to mm on commit', async () => {
      const wrapper = mountInput(makePine24(), 'in');
      const inputs = lengthInputs(wrapper);
      await inputs[0].setValue('100');
      await inputs[0].trigger('blur');
      // 100″ = 2540mm. Sorted ascending.
      const lengths = emittedLatest(wrapper)?.size.lengths;
      expect(lengths?.[0]).toBeCloseTo(2540, 1);
    });

    it('invalid input is discarded without emitting', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      const inputs = lengthInputs(wrapper);
      await inputs[0].setValue('not a number');
      await inputs[0].trigger('blur');
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
    });
  });
});
