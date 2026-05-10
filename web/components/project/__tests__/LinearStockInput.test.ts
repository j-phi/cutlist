// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { computed, defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import {
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  type LinearStockMatrix,
} from 'cutlist';

import LinearStockInput from '../LinearStockInput.vue';

const UInputStub = defineComponent({
  props: {
    modelValue: { type: [String, Number], default: '' },
  },
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

function makeWrapper(modelValue: LinearStockMatrix, unit: 'mm' | 'in' = 'mm') {
  const Host = defineComponent({
    components: { LinearStockInput },
    props: {
      initial: { type: Object, required: true },
      unit: { type: String, required: true },
    },
    setup(props) {
      const value = ref<LinearStockMatrix>(props.initial as LinearStockMatrix);
      const precision = computed(() =>
        props.unit === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION,
      );
      return { value, precision };
    },
    template: `<LinearStockInput
      :model-value="value"
      :distance-unit="unit"
      :precision="precision"
      @update:model-value="value = $event"
      @remove="$emit('remove')"
    />`,
  });

  return mount(Host, {
    props: { initial: modelValue, unit },
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

function inner(host: ReturnType<typeof makeWrapper>) {
  return host.findComponent(LinearStockInput);
}

function lengthInputs(host: ReturnType<typeof makeWrapper>) {
  return host
    .findAll('[data-testid="linear-length-row"] input')
    .filter((el) => el.attributes('data-length-mm') != null);
}

describe('LinearStockInput', () => {
  describe('Cross-section display', () => {
    it('Renders cross-section in mm when distanceUnit is mm', () => {
      const host = makeWrapper(makeCls(), 'mm');
      const text = host.find('[data-testid="linear-cross-section"]').text();
      expect(text).toContain('38');
      expect(text).toContain('89');
      expect(text).toContain('mm');
    });

    it('Renders cross-section in inches when distanceUnit is in', () => {
      const host = makeWrapper(makePine24(), 'in');
      const text = host.find('[data-testid="linear-cross-section"]').text();
      // Pine 2×4 nominal: 1 1/2" × 3 1/2"
      expect(text).toContain('1 1/2');
      expect(text).toContain('3 1/2');
      expect(text).toContain('"');
    });
  });

  describe('Length editing', () => {
    it('Renders one editable row per length in modelValue', () => {
      const host = makeWrapper(makeCls(), 'mm');
      expect(lengthInputs(host)).toHaveLength(4);
    });

    it('Removing a row emits update:modelValue without that length', async () => {
      const host = makeWrapper(makeCls(), 'mm');
      const removeButtons = host.findAll(
        '[data-testid="linear-length-remove"]',
      );
      expect(removeButtons).toHaveLength(4);
      // Second row corresponds to 3000mm (lengths are sorted asc).
      await removeButtons[1].trigger('click');

      const events = inner(host).emitted('update:modelValue');
      expect(events).toBeTruthy();
      const next = (events as unknown[][])[0][0] as LinearStockMatrix;
      expect(next.size.lengths).toEqual([2400, 3600, 4800]);
    });

    it('Adding a length appends a copy of the longest length the user can then edit', async () => {
      const host = makeWrapper(makeCls(), 'mm');
      await host.find('[data-testid="linear-length-add"]').trigger('click');

      const events = inner(host).emitted('update:modelValue');
      expect(events).toBeTruthy();
      const next = (events as unknown[][])[0][0] as LinearStockMatrix;
      // 4800 duplicated (it was already the max).
      expect(next.size.lengths).toEqual([2400, 3000, 3600, 4800, 4800]);
    });

    it('Adding a length to an empty list seeds 96″ in inch mode', async () => {
      const empty = makeCls();
      empty.size.lengths = [];
      const host = makeWrapper(empty, 'in');
      await host.find('[data-testid="linear-length-add"]').trigger('click');

      const events = inner(host).emitted('update:modelValue');
      const next = (events as unknown[][])[0][0] as LinearStockMatrix;
      expect(next.size.lengths).toHaveLength(1);
      // 96″ = 2438.4 mm.
      expect(next.size.lengths[0]).toBeCloseTo(2438.4, 1);
    });

    it('Adding a length to an empty list seeds 2400mm in metric mode', async () => {
      const empty = makeCls();
      empty.size.lengths = [];
      const host = makeWrapper(empty, 'mm');
      await host.find('[data-testid="linear-length-add"]').trigger('click');

      const events = inner(host).emitted('update:modelValue');
      const next = (events as unknown[][])[0][0] as LinearStockMatrix;
      expect(next.size.lengths).toEqual([2400]);
    });

    it('Editing a length and committing on blur emits the parsed mm value', async () => {
      const host = makeWrapper(makeCls(), 'mm');
      const inputs = lengthInputs(host);
      // Type "2500" into the second row, then blur.
      await inputs[1].setValue('2500');
      await inputs[1].trigger('blur');

      const events = inner(host).emitted('update:modelValue');
      expect(events).toBeTruthy();
      const next = (events as unknown[][])[0][0] as LinearStockMatrix;
      // 3000 replaced with 2500; result re-sorted ascending.
      expect(next.size.lengths).toEqual([2400, 2500, 3600, 4800]);
    });

    it('Editing in inches commits the converted mm value', async () => {
      const host = makeWrapper(makePine24(), 'in');
      const inputs = lengthInputs(host);
      await inputs[0].setValue('100');
      await inputs[0].trigger('blur');

      const events = inner(host).emitted('update:modelValue');
      const next = (events as unknown[][])[0][0] as LinearStockMatrix;
      // 100″ = 2540mm. Lengths re-sorted.
      const sorted = [...next.size.lengths].sort((a, b) => a - b);
      expect(sorted[0]).toBeCloseTo(2540, 1);
    });

    it('Invalid input on commit discards the draft (does not emit)', async () => {
      const host = makeWrapper(makeCls(), 'mm');
      const inputs = lengthInputs(host);
      await inputs[0].setValue('not a number');
      await inputs[0].trigger('blur');

      // Nothing was emitted for the bad commit.
      expect(inner(host).emitted('update:modelValue')).toBeFalsy();
    });
  });

  describe('Material name', () => {
    it('Editing the material name emits update:modelValue with the new name', async () => {
      const host = makeWrapper(makeCls(), 'mm');
      const input = host.find('[data-testid="linear-material-name"]');
      await input.setValue('My Lumber');

      const events = inner(host).emitted('update:modelValue');
      expect(events).toBeTruthy();
      const next = (events as unknown[][])[0][0] as LinearStockMatrix;
      expect(next.material).toBe('My Lumber');
    });
  });

  describe('Remove', () => {
    it('Clicking remove emits remove', async () => {
      const host = makeWrapper(makeCls(), 'mm');
      await host.find('[data-testid="linear-remove"]').trigger('click');
      expect(inner(host).emitted('remove')).toBeTruthy();
    });
  });
});
