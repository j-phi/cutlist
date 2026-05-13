// @vitest-environment nuxt
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { StockMatrix } from 'cutlist';

import ColorMappingPanel from '../ColorMappingPanel.vue';
import { UInputStub, USelectStub } from '~/test-utils/stubs';

const DEFAULT_STOCKS: StockMatrix[] = [
  {
    kind: 'sheet',
    material: 'Plywood',
    color: '#d2b996',
    sizes: [{ width: 1220, length: 2440, thickness: [18, 12] }],
  },
  {
    kind: 'sheet',
    material: 'MDF',
    color: '#b09078',
    sizes: [{ width: 1220, length: 2440, thickness: [18] }],
  },
];

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
const stocks = ref<StockMatrix[]>(DEFAULT_STOCKS);

const enabledModels = ref<
  Array<{
    parts: Array<{ colorKey: string; partNumber: number; name: string }>;
  }>
>([]);

const updateColorMap = vi.fn();
const toggleColorExcluded = vi.fn();
const batchRenameByColor = vi.fn();

mockNuxtImport('useProjects', () => () => ({
  activeId,
  allColors,
  activeProject,
  enabledModels,
  updateColorMap,
  toggleColorExcluded,
  batchRenameByColor,
}));
mockNuxtImport('useProjectSettings', () => () => ({ stocks }));

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

describe('ColorMappingPanel', () => {
  beforeEach(() => {
    updateColorMap.mockClear();
    toggleColorExcluded.mockClear();
    batchRenameByColor.mockClear();
    activeId.value = 'p1';
    enabledModels.value = [];
    allColors.value = [
      { key: 'red', rgb: [1, 0, 0], count: 3 },
      { key: 'blue', rgb: [0, 0, 1], count: 1 },
    ];
    activeProject.value = {
      colorMap: { red: 'Plywood' },
      excludedColors: [],
    };
    stocks.value = DEFAULT_STOCKS;
  });

  function getComponent() {
    return shallowMount(ColorMappingPanel, {
      global: {
        stubs: {
          UCheckbox: UCheckboxStub,
          UInput: UInputStub,
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
      stocks.value = [];
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

  describe('Batch rename by color', () => {
    it('Should render a name input per color row', () => {
      const component = getComponent();
      const textInputs = component.findAll('input[type="text"]');

      expect(textInputs).toHaveLength(2);
      expect(textInputs[0].attributes('placeholder')).toBe('Name (optional)');
    });

    it('Should show common name when all parts of a color share one', () => {
      enabledModels.value = [
        {
          parts: [
            { colorKey: 'red', partNumber: 1, name: 'Shelf' },
            { colorKey: 'red', partNumber: 1, name: 'Shelf' },
            { colorKey: 'red', partNumber: 2, name: 'Shelf' },
          ],
        },
      ];
      const component = getComponent();
      const textInputs = component.findAll('input[type="text"]');

      expect((textInputs[0].element as HTMLInputElement).value).toBe('Shelf');
    });

    it('Should show empty when parts of a color have different names', () => {
      enabledModels.value = [
        {
          parts: [
            { colorKey: 'red', partNumber: 1, name: 'Shelf' },
            { colorKey: 'red', partNumber: 2, name: 'Rail' },
          ],
        },
      ];
      const component = getComponent();
      const textInputs = component.findAll('input[type="text"]');

      expect((textInputs[0].element as HTMLInputElement).value).toBe('');
    });

    it('Should call batchRenameByColor on Enter', async () => {
      const component = getComponent();
      const input = component.findAll('input[type="text"]')[0];

      await input.setValue('Shelf');
      await input.trigger('keydown', { key: 'Enter' });

      expect(batchRenameByColor).toHaveBeenCalledWith('p1', 'red', 'Shelf');
    });

    it('Should call batchRenameByColor with undefined when clearing', async () => {
      const component = getComponent();
      const input = component.findAll('input[type="text"]')[0];

      await input.setValue('');
      await input.trigger('keydown', { key: 'Enter' });

      expect(batchRenameByColor).toHaveBeenCalledWith('p1', 'red', undefined);
    });

    it('Should not call batchRenameByColor when no draft was typed', async () => {
      const component = getComponent();
      const input = component.findAll('input[type="text"]')[0];

      await input.trigger('blur');

      expect(batchRenameByColor).not.toHaveBeenCalled();
    });
  });
});
