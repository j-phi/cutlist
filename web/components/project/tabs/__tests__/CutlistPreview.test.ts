// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import CutlistPreview from '../CutlistPreview.vue';

type LayoutResult = {
  layouts: Array<{
    stock: {
      material: string;
      thicknessM: number;
      widthM: number;
      lengthM: number;
    };
  }>;
  leftovers: Array<{
    material: string;
    thicknessM: number;
    partNumber: number;
  }>;
};

const data = ref<LayoutResult | undefined>(undefined);
const isComputing = ref(false);
const error = ref<string | null>(null);
const partCountWarning = ref<string | null>(null);

mockNuxtImport('useBoardLayoutsQuery', () => () => ({
  data,
  isComputing,
  error,
  partCountWarning,
}));

const scale = ref<number | undefined>(1);
const resetZoom = vi.fn();
const zoomIn = vi.fn();
const zoomOut = vi.fn();

mockNuxtImport('usePanZoom', () => () => ({
  scale,
  resetZoom,
  zoomIn,
  zoomOut,
}));

mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) =>
    m == null ? '' : `${Math.round(m * 1000)}mm`,
);

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
          'data-testid': 'stock-filter',
          value: String(props.modelValue),
          onChange: (event: Event) =>
            emit(
              'update:modelValue',
              (event.target as HTMLSelectElement).value,
            ),
        },
        (props.items as Array<{ label: string; value: string }>).map((it) =>
          h('option', { value: it.value }, it.label),
        ),
      );
  },
});

function makeLayout(
  material: string,
  thicknessM: number,
  widthM = 1.22,
  lengthM = 2.44,
) {
  return { stock: { material, thicknessM, widthM, lengthM } };
}

describe('CutlistPreview', () => {
  function getComponent() {
    return shallowMount(CutlistPreview, {
      global: {
        stubs: {
          UIcon: true,
          USelect: USelectStub,
          LayoutList: {
            template:
              '<div data-testid="layout-list" :data-count="layouts.length" :data-leftovers="leftovers.length" />',
            props: ['layouts', 'leftovers'],
          },
          PreviewToolbar: true,
          RulerToggle: true,
          ScaleController: true,
        },
      },
    });
  }

  beforeEach(() => {
    data.value = undefined;
    isComputing.value = false;
    error.value = null;
    partCountWarning.value = null;
    scale.value = 1;
    resetZoom.mockClear();
    zoomIn.mockClear();
    zoomOut.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('Should render the error message when error is set', () => {
      error.value = 'Boom';
      const component = getComponent();

      expect(component.text()).toContain('Boom');
      expect(component.find('[data-testid="layout-list"]').exists()).toBe(
        false,
      );
    });

    it('Should render the computing indicator when data is null and isComputing is true', () => {
      data.value = undefined;
      isComputing.value = true;
      const component = getComponent();

      expect(component.text()).toContain('Computing layouts');
    });

    it('Should render the empty-state hint when both arrays are empty', () => {
      data.value = { layouts: [], leftovers: [] };
      const component = getComponent();

      expect(component.text()).toContain('No board layouts found');
    });

    it('Should not render the stock filter when only one stock option is present', () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018)],
        leftovers: [],
      };
      const component = getComponent();

      expect(component.find('[data-testid="stock-filter"]').exists()).toBe(
        false,
      );
    });

    it('Should render the stock filter when multiple distinct stocks exist', () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018), makeLayout('MDF', 0.012)],
        leftovers: [],
      };
      const component = getComponent();

      expect(component.find('[data-testid="stock-filter"]').exists()).toBe(
        true,
      );
    });
  });

  describe('On stock filter change', () => {
    it('Should filter layouts and leftovers by material__thicknessM prefix', async () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018), makeLayout('MDF', 0.012)],
        leftovers: [
          { material: 'Plywood', thicknessM: 0.018, partNumber: 1 },
          { material: 'MDF', thicknessM: 0.012, partNumber: 2 },
        ],
      };
      const component = getComponent();
      await nextTick();

      const select = component.get('[data-testid="stock-filter"]');
      // Plywood key = "Plywood__0.018__1.22__2.44"
      await select.setValue('Plywood__0.018__1.22__2.44');
      await nextTick();

      const list = component.get('[data-testid="layout-list"]');
      expect(list.attributes('data-count')).toBe('1');
      expect(list.attributes('data-leftovers')).toBe('1');
    });
  });

  describe('Watchers', () => {
    it('Should reset selectedStock to __all__ when its option disappears', async () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018), makeLayout('MDF', 0.012)],
        leftovers: [],
      };
      const component = getComponent();
      await nextTick();

      const select = component.get('[data-testid="stock-filter"]');
      await select.setValue('MDF__0.012__1.22__2.44');
      await nextTick();

      // Now drop MDF from the layout set.
      data.value = {
        layouts: [makeLayout('Plywood', 0.018)],
        leftovers: [],
      };
      await nextTick();
      // The stockOptions watcher should reset selection to __all__.
      // With only one option remaining, the filter dropdown is hidden.
      expect(component.find('[data-testid="stock-filter"]').exists()).toBe(
        false,
      );
      // Restore two stocks; selection should be __all__.
      data.value = {
        layouts: [makeLayout('Plywood', 0.018), makeLayout('Birch', 0.018)],
        leftovers: [],
      };
      await nextTick();
      const restored = component.get('[data-testid="stock-filter"]');
      expect((restored.element as HTMLSelectElement).value).toBe('__all__');
    });
  });
});

// TODO(test): partCountWarning banner — straightforward v-if pass-through.
// TODO(test): pan/zoom controls — handlers wired by props to ScaleController stub.
// TODO(test): canvas-grid + canvas-plane styling — not behavioral.
