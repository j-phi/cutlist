// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import {
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  type LinearStockMatrix,
} from 'cutlist';

import LinearStockInput from '../LinearStockInput.vue';

const UInputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue', 'blur'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
        onBlur: (event: FocusEvent) => emit('blur', event),
      });
  },
});

const UButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  setup(_props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default ? slots.default() : undefined,
      );
  },
});

const MaterialColorPickerStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  template: '<div class="color-picker" :data-color="modelValue" />',
});

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
  return mount(LinearStockInput, {
    props: { modelValue, distanceUnit: unit, precision },
    global: {
      stubs: {
        UInput: UInputStub,
        UButton: UButtonStub,
        UIcon: true,
        MaterialColorPicker: MaterialColorPickerStub,
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

describe('LinearStockInput', () => {
  describe('Cross-section display', () => {
    it('renders cross-section in mm when distanceUnit is mm', () => {
      const text = mountInput(makeCls(), 'mm')
        .find('[data-testid="linear-cross-section"]')
        .text();
      expect(text).toContain('38');
      expect(text).toContain('89');
      expect(text).toContain('mm');
    });

    it('renders cross-section in inches when distanceUnit is in', () => {
      // Pine 2×4 nominal: 1 1/2" × 3 1/2"
      const text = mountInput(makePine24(), 'in')
        .find('[data-testid="linear-cross-section"]')
        .text();
      expect(text).toContain('1 1/2');
      expect(text).toContain('3 1/2');
      expect(text).toContain('"');
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

  describe('Material name', () => {
    it('typing emits update:modelValue with the new name', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      await wrapper
        .find('[data-testid="linear-material-name"]')
        .setValue('My Lumber');
      expect(emittedLatest(wrapper)?.material).toBe('My Lumber');
    });
  });

  describe('Remove', () => {
    it('clicking remove emits remove', async () => {
      const wrapper = mountInput(makeCls(), 'mm');
      await wrapper.find('[data-testid="linear-remove"]').trigger('click');
      expect(wrapper.emitted('remove')).toBeTruthy();
    });
  });
});
