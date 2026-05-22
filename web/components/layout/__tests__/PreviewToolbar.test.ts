// @vitest-environment nuxt
import { describe, expect, it, beforeEach } from 'vitest';
import {
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  mmToUm,
  type Algorithm,
  type Micrometres,
} from 'cutlist';
import { computed, defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import PreviewToolbar from '../PreviewToolbar.vue';

const bladeWidth = ref<Micrometres | undefined>(mmToUm(3));
const distanceUnit = ref<'mm' | 'in' | undefined>('mm');
const margin = ref<Micrometres | undefined>(mmToUm(0));
const defaultAlgorithm = ref<Algorithm | undefined>('auto');
const showPartNumbers = ref<boolean | undefined>(true);
const showBomName = ref<boolean | undefined>(true);
const stock = ref<string | undefined>('');
const isLoading = ref(false);
const precision = computed(() =>
  distanceUnit.value === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION,
);

mockNuxtImport('useProjectSettings', () => () => ({
  bladeWidth,
  distanceUnit,
  margin,
  defaultAlgorithm,
  showPartNumbers,
  showBomName,
  stock,
  isLoading,
  precision,
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
    bladeWidth.value = mmToUm(3);
    distanceUnit.value = 'mm';
    margin.value = mmToUm(0);
    defaultAlgorithm.value = 'auto';
    showPartNumbers.value = true;
    showBomName.value = true;
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
      expect(component.findAll('input[type="text"]')).toHaveLength(2);
      expect(component.findAll('input[type="checkbox"]')).toHaveLength(2);
    });
  });

  describe('v-model bindings', () => {
    it('Should write back to defaultAlgorithm when the select changes', async () => {
      const component = getComponent();

      await component.get('select').setValue('cnc');

      expect(defaultAlgorithm.value).toBe('cnc');
    });

    it('Should write bladeWidth back in µm when typed in mm mode', async () => {
      bladeWidth.value = mmToUm(3);
      distanceUnit.value = 'mm';
      const component = getComponent();
      const inputs = component.findAll('input[type="text"]');

      await inputs[0].setValue('5');

      expect(bladeWidth.value).toBe(mmToUm(5));
    });

    it('Should convert imperial input to µm when writing bladeWidth', async () => {
      bladeWidth.value = mmToUm(3.175);
      distanceUnit.value = 'in';
      const component = getComponent();
      const inputs = component.findAll('input[type="text"]');

      await inputs[0].setValue('1/4');

      expect(bladeWidth.value).toBe(mmToUm(6.35));
    });

    it('Should write margin back in µm when typed in mm mode', async () => {
      margin.value = mmToUm(0);
      distanceUnit.value = 'mm';
      const component = getComponent();
      const inputs = component.findAll('input[type="text"]');

      await inputs[1].setValue('2');

      expect(margin.value).toBe(mmToUm(2));
    });

    it('Should write back to showPartNumbers when the checkbox toggles', async () => {
      const component = getComponent();
      const checkbox = component.get('input[type="checkbox"]');

      await checkbox.setValue(false);

      expect(showPartNumbers.value).toBe(false);
    });
  });
});
