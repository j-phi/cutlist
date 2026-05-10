// @vitest-environment nuxt
import { describe, expect, it, beforeEach } from 'vitest';
import type { Algorithm } from 'cutlist';
import { defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import PreviewToolbar from '../PreviewToolbar.vue';

const bladeWidth = ref<number | undefined>(3);
const distanceUnit = ref<'mm' | 'in' | undefined>('mm');
const margin = ref<number | undefined>(0);
const defaultAlgorithm = ref<Algorithm | undefined>('auto');
const showPartNumbers = ref<boolean | undefined>(true);
const stock = ref<string | undefined>('');
const isLoading = ref(false);

mockNuxtImport('useProjectSettings', () => () => ({
  bladeWidth,
  distanceUnit,
  margin,
  defaultAlgorithm,
  showPartNumbers,
  stock,
  isLoading,
}));

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

const USelectStub = defineComponent({
  props: {
    modelValue: { type: [String, Number], default: '' },
    items: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          value: String(props.modelValue),
          onChange: (event: Event) =>
            emit(
              'update:modelValue',
              (event.target as HTMLSelectElement).value,
            ),
        },
        (props.items as Array<string | { label: string; value: string }>).map(
          (it) => {
            const value = typeof it === 'string' ? it : it.value;
            const label = typeof it === 'string' ? it : it.label;
            return h('option', { value }, label);
          },
        ),
      );
  },
});

const UCheckboxStub = defineComponent({
  props: {
    modelValue: { type: Boolean, default: false },
  },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('input', {
        type: 'checkbox',
        checked: props.modelValue,
        onChange: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).checked),
      });
  },
});

describe('PreviewToolbar', () => {
  beforeEach(() => {
    bladeWidth.value = 3;
    distanceUnit.value = 'mm';
    margin.value = 0;
    defaultAlgorithm.value = 'auto';
    showPartNumbers.value = true;
    isLoading.value = false;
  });

  function getComponent() {
    return shallowMount(PreviewToolbar, {
      global: {
        stubs: {
          UInput: UInputStub,
          USelect: USelectStub,
          UCheckbox: UCheckboxStub,
        },
      },
    });
  }

  describe('Rendering', () => {
    it('Should render nothing while settings are loading', () => {
      isLoading.value = true;
      const component = getComponent();

      expect(component.find('select').exists()).toBe(false);
      expect(component.find('input').exists()).toBe(false);
    });

    it('Should render all controls when ready', () => {
      const component = getComponent();

      expect(component.find('select').exists()).toBe(true);
      // 2 text inputs (blade, margin)
      expect(component.findAll('input[type="text"]')).toHaveLength(2);
      // 1 checkbox
      expect(component.findAll('input[type="checkbox"]')).toHaveLength(1);
    });
  });

  describe('v-model bindings', () => {
    it('Should write back to defaultAlgorithm when the select changes', async () => {
      const component = getComponent();

      await component.get('select').setValue('cnc');

      expect(defaultAlgorithm.value).toBe('cnc');
    });

    it('Should write bladeWidth back as mm when typed in mm mode', async () => {
      bladeWidth.value = 3;
      distanceUnit.value = 'mm';
      const component = getComponent();
      const inputs = component.findAll('input[type="text"]');

      await inputs[0].setValue('5');

      expect(bladeWidth.value).toBe(5);
    });

    it('Should convert imperial input to mm when writing bladeWidth', async () => {
      bladeWidth.value = 3.175;
      distanceUnit.value = 'in';
      const component = getComponent();
      const inputs = component.findAll('input[type="text"]');

      await inputs[0].setValue('1/4');

      expect(bladeWidth.value).toBeCloseTo(6.35, 5);
    });

    it('Should write margin back as mm when typed in mm mode', async () => {
      margin.value = 0;
      distanceUnit.value = 'mm';
      const component = getComponent();
      const inputs = component.findAll('input[type="text"]');

      await inputs[1].setValue('2');

      expect(margin.value).toBe(2);
    });

    it('Should write back to showPartNumbers when the checkbox toggles', async () => {
      const component = getComponent();
      const checkbox = component.get('input[type="checkbox"]');

      await checkbox.setValue(false);

      expect(showPartNumbers.value).toBe(false);
    });
  });
});
