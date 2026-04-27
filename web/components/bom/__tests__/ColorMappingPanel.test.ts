// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { defineComponent, h, ref, computed } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import ColorMappingPanel from '../ColorMappingPanel.vue';

const STOCK_YAML = `
- label: Plywood
  material: Plywood
  color: '#d2b996'
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18, 12]
- label: MDF
  material: MDF
  color: '#b09078'
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
`;

interface MockColor {
  key: string;
  rgb: [number, number, number];
  count: number;
}

const activeId = ref<string | null>('p1');
const allColors = ref<MockColor[]>([
  { key: 'red', rgb: [1, 0, 0], count: 3 },
  { key: 'blue', rgb: [0, 0, 1], count: 1 },
]);
const activeProject = ref<{
  colorMap: Record<string, string>;
  excludedColors?: string[];
} | null>({
  colorMap: { red: 'Plywood' },
  excludedColors: [],
});
const stock = ref<string | undefined>(STOCK_YAML);

const updateColorMap = vi.fn();
const toggleColorExcluded = vi.fn();

mockNuxtImport('useProjects', () => () => ({
  activeId,
  allColors,
  activeProject,
  updateColorMap,
  toggleColorExcluded,
}));
mockNuxtImport('useProjectSettings', () => () => ({ stock }));

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

const USelectStub = defineComponent({
  props: {
    modelValue: { type: String, default: '' },
    items: { type: Array, default: () => [] },
  },
  emits: ['update:modelValue'],
  setup(props, { attrs, emit }) {
    return () =>
      h(
        'select',
        {
          ...attrs,
          value: props.modelValue,
          onChange: (event: Event) =>
            emit(
              'update:modelValue',
              (event.target as HTMLSelectElement).value,
            ),
        },
        (props.items as Array<{ value: string; label: string }>).map((it) =>
          h('option', { value: it.value }, it.label),
        ),
      );
  },
});

describe('ColorMappingPanel', () => {
  beforeEach(() => {
    updateColorMap.mockClear();
    toggleColorExcluded.mockClear();
    activeId.value = 'p1';
    allColors.value = [
      { key: 'red', rgb: [1, 0, 0], count: 3 },
      { key: 'blue', rgb: [0, 0, 1], count: 1 },
    ];
    activeProject.value = {
      colorMap: { red: 'Plywood' },
      excludedColors: [],
    };
    stock.value = STOCK_YAML;
  });

  function getComponent() {
    return shallowMount(ColorMappingPanel, {
      global: {
        stubs: {
          UCheckbox: UCheckboxStub,
          USelect: USelectStub,
          UIcon: true,
        },
      },
    });
  }

  describe('Rendering', () => {
    it('Should not render when there are no colors', () => {
      allColors.value = [];
      const component = getComponent();

      expect(
        component
          .find('button[aria-label="Map colors to stock materials"]')
          .exists(),
      ).toBe(false);
    });

    it('Should not render when there is no active project', () => {
      activeProject.value = null;
      const component = getComponent();

      expect(
        component
          .find('button[aria-label="Map colors to stock materials"]')
          .exists(),
      ).toBe(false);
    });

    it('Should render a row per color when colors and project exist', () => {
      const component = getComponent();
      const selects = component.findAll('select');

      expect(selects).toHaveLength(2);
      // First color (red) is mapped to Plywood
      expect((selects[0].element as HTMLSelectElement).value).toBe('Plywood');
      // Second color (blue) has no mapping -> __none__
      expect((selects[1].element as HTMLSelectElement).value).toBe('__none__');
    });

    it('Should warn when no materials are defined', () => {
      stock.value = '[]';
      const component = getComponent();

      expect(component.text()).toContain('No stock materials defined');
      expect(component.find('.text-amber-400').exists()).toBe(true);
    });
  });

  describe('On collapse toggle', () => {
    it('Should flip aria-expanded', async () => {
      const component = getComponent();
      const toggle = component.get(
        'button[aria-label="Map colors to stock materials"]',
      );

      expect(toggle.attributes('aria-expanded')).toBe('true');

      await toggle.trigger('click');

      expect(toggle.attributes('aria-expanded')).toBe('false');
    });
  });

  describe('On material select', () => {
    it('Should call updateColorMap with the chosen material', async () => {
      const component = getComponent();

      await component.findAll('select')[1].setValue('MDF');

      expect(updateColorMap).toHaveBeenCalledWith('p1', 'blue', 'MDF');
    });

    it('Should map __none__ to empty string', async () => {
      const component = getComponent();

      await component.findAll('select')[0].setValue('__none__');

      expect(updateColorMap).toHaveBeenCalledWith('p1', 'red', '');
    });
  });

  describe('On checkbox toggle', () => {
    it('Should call toggleColorExcluded', async () => {
      const component = getComponent();

      await component.findAll('input[type="checkbox"]')[0].setValue(false);

      expect(toggleColorExcluded).toHaveBeenCalledWith('p1', 'red');
    });
  });
});
