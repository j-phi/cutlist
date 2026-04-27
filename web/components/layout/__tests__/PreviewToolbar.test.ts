// @vitest-environment nuxt
import { describe, expect, it, beforeEach, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import PreviewToolbar from '../PreviewToolbar.vue';

const bladeWidth = ref<number | undefined>(3);
const distanceUnit = ref<'mm' | 'in' | undefined>('mm');
const margin = ref<number | undefined>(0);
const optimize = ref<'Auto' | 'CNC' | undefined>('Auto');
const showPartNumbers = ref<boolean | undefined>(true);
const stock = ref<string | undefined>('');
const isLoading = ref(false);

mockNuxtImport('useProjectSettings', () => () => ({
  bladeWidth,
  distanceUnit,
  margin,
  optimize,
  showPartNumbers,
  stock,
  isLoading,
}));
mockNuxtImport('useUnitConverter', () => () => undefined);

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
          emit(
            'update:modelValue',
            Number((event.target as HTMLInputElement).value),
          ),
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
        (props.items as string[]).map((it) => h('option', { value: it }, it)),
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
    optimize.value = 'Auto';
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
      // 2 number inputs (blade, margin)
      expect(component.findAll('input[type="number"]')).toHaveLength(2);
      // 1 checkbox
      expect(component.findAll('input[type="checkbox"]')).toHaveLength(1);
    });
  });

  describe('v-model bindings', () => {
    it('Should write back to optimize when the select changes', async () => {
      const component = getComponent();

      await component.get('select').setValue('CNC');

      expect(optimize.value).toBe('CNC');
    });

    it('Should write back to bladeWidth when its number input changes', async () => {
      const component = getComponent();
      const numberInputs = component.findAll('input[type="number"]');

      await numberInputs[0].setValue('5');

      expect(bladeWidth.value).toBe(5);
    });

    it('Should write back to margin when its number input changes', async () => {
      const component = getComponent();
      const numberInputs = component.findAll('input[type="number"]');

      await numberInputs[1].setValue('2');

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
