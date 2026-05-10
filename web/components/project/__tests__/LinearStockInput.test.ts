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
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
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

const UCheckboxStub = defineComponent({
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        type: 'checkbox',
        checked: props.modelValue,
        onChange: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).checked),
      });
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

function makeWrapper(
  modelValue: LinearStockMatrix,
  unit: 'mm' | 'in' = 'mm',
  availableLengths?: number[],
) {
  const Host = defineComponent({
    components: { LinearStockInput },
    props: {
      initial: { type: Object, required: true },
      unit: { type: String, required: true },
      available: { type: Array, default: undefined },
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
      :available-lengths="available"
      @update:model-value="value = $event"
      @remove="$emit('remove')"
    />`,
  });

  return mount(Host, {
    props: { initial: modelValue, unit, available: availableLengths },
    global: {
      stubs: {
        UInput: UInputStub,
        UButton: UButtonStub,
        UCheckbox: UCheckboxStub,
        UIcon: true,
        MaterialColorPicker: MaterialColorPickerStub,
      },
    },
  });
}

function inner(host: ReturnType<typeof makeWrapper>) {
  return host.findComponent(LinearStockInput);
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

  describe('Length checkboxes', () => {
    it('Renders one checkbox per length in modelValue', () => {
      const host = makeWrapper(makeCls(), 'mm');
      const boxes = host.findAll('input[type="checkbox"]');
      expect(boxes).toHaveLength(4);
    });

    it('Renders all checkboxes ticked when all preset lengths are enabled', () => {
      const host = makeWrapper(makeCls(), 'mm');
      const boxes = host.findAll('input[type="checkbox"]');
      for (const b of boxes) {
        expect((b.element as HTMLInputElement).checked).toBe(true);
      }
    });

    it('Shows un-enabled preset lengths as unchecked when availableLengths is wider', () => {
      const entry = makeCls();
      entry.size.lengths = [2400, 3600];
      const host = makeWrapper(entry, 'mm', [2400, 3000, 3600, 4800]);
      const boxes = host.findAll('input[type="checkbox"]');
      expect(boxes).toHaveLength(4);
      const checkedCount = boxes.filter(
        (b) => (b.element as HTMLInputElement).checked,
      ).length;
      expect(checkedCount).toBe(2);
    });

    it('Toggling a length checkbox off emits update:modelValue without that length', async () => {
      const entry = makeCls();
      const host = makeWrapper(entry, 'mm');
      const box = host
        .findAll('input[type="checkbox"]')
        .find((b) => b.attributes('data-length-mm') === '3000');
      expect(box).toBeDefined();
      await box!.setValue(false);

      const events = inner(host).emitted('update:modelValue');
      expect(events).toBeTruthy();
      const next = (events as unknown[][])[0][0] as LinearStockMatrix;
      expect(next.size.lengths).toEqual([2400, 3600, 4800]);
    });

    it('Toggling a length checkbox on emits update:modelValue with that length added', async () => {
      const entry = makeCls();
      entry.size.lengths = [2400, 3600];
      const host = makeWrapper(entry, 'mm', [2400, 3000, 3600, 4800]);
      const box = host
        .findAll('input[type="checkbox"]')
        .find((b) => b.attributes('data-length-mm') === '3000');
      expect(box).toBeDefined();
      await box!.setValue(true);

      const events = inner(host).emitted('update:modelValue');
      expect(events).toBeTruthy();
      const next = (events as unknown[][])[0][0] as LinearStockMatrix;
      expect(next.size.lengths).toEqual([2400, 3000, 3600]);
    });

    it('Re-formats length labels when distanceUnit flips without changing checked state', async () => {
      const host = makeWrapper(makePine24(), 'in');
      const labelsIn = host.findAll('label').map((l) => l.text());
      expect(labelsIn.some((t) => t.includes('ft'))).toBe(true);

      await host.setProps({ unit: 'mm' });

      const labelsMm = host.findAll('label').map((l) => l.text());
      expect(labelsMm.some((t) => t.includes('mm'))).toBe(true);

      const boxes = host.findAll('input[type="checkbox"]');
      for (const b of boxes) {
        expect((b.element as HTMLInputElement).checked).toBe(true);
      }
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
