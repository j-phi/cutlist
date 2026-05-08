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

const tab = ref<string>('layout');
mockNuxtImport('useProjectTab', () => () => tab);

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

function makeLeftover(
  material: string,
  thicknessM: number,
  partNumber: number,
) {
  return { material, thicknessM, partNumber };
}

const UButtonStub = defineComponent({
  props: { icon: { type: String, default: '' } },
  emits: ['click'],
  setup(_, { emit, slots }) {
    return () =>
      h(
        'button',
        {
          'data-testid': 'configure-stock-button',
          onClick: () => emit('click'),
        },
        slots.default?.(),
      );
  },
});

describe('CutlistPreview', () => {
  function getComponent() {
    return shallowMount(CutlistPreview, {
      global: {
        stubs: {
          UIcon: true,
          USelect: USelectStub,
          UButton: UButtonStub,
          LayoutList: {
            template:
              '<div data-testid="layout-list" :data-count="layouts.length" />',
            props: ['layouts'],
          },
          PreviewToolbar: true,
          RulerToggle: true,
          ScaleController: true,
          ExportPdfButton: true,
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
    tab.value = 'layout';
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

    it('Should render the no-parts empty state when there are no layouts and no leftovers', () => {
      data.value = { layouts: [], leftovers: [] };
      const component = getComponent();

      expect(component.text()).toContain('No board layouts yet');
      expect(component.text()).toContain('Add parts in the BOM tab');
      // Configure-stock CTA does not apply here.
      expect(
        component.find('[data-testid="configure-stock-button"]').exists(),
      ).toBe(false);
    });

    it('Should render the no-matching-stock empty state when parts exist but no layouts were produced', () => {
      data.value = {
        layouts: [],
        leftovers: [makeLeftover('Plywood', 0.018, 1)],
      };
      const component = getComponent();

      expect(component.text()).toContain('No matching stock');
      expect(component.text()).toContain(
        "couldn't find any boards in your stock",
      );
      expect(
        component.find('[data-testid="configure-stock-button"]').exists(),
      ).toBe(true);
    });

    it('Should suppress the leftover banner when the empty state is showing', () => {
      data.value = {
        layouts: [],
        leftovers: [makeLeftover('Plywood', 0.018, 1)],
      };
      const component = getComponent();

      // Empty-state CTA shows once; the redundant leftover banner does not.
      expect(component.text()).not.toContain('could not be placed on');
    });

    it('Should still show the leftover banner when some layouts placed but others did not', () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018)],
        leftovers: [makeLeftover('MDF', 0.012, 1)],
      };
      const component = getComponent();

      expect(component.text()).toContain(
        'could not be placed on matching stock',
      );
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

  describe('Configure stock CTA', () => {
    it('Should switch to the boards tab when clicked', async () => {
      data.value = {
        layouts: [],
        leftovers: [makeLeftover('Plywood', 0.018, 1)],
      };
      const component = getComponent();

      await component
        .get('[data-testid="configure-stock-button"]')
        .trigger('click');

      expect(tab.value).toBe('boards');
    });
  });

  describe('On stock filter change', () => {
    it('Should filter layouts by stock key', async () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018), makeLayout('MDF', 0.012)],
        leftovers: [],
      };
      const component = getComponent();
      await nextTick();

      const select = component.get('[data-testid="stock-filter"]');
      // Plywood key = "Plywood__0.018__1.22__2.44"
      await select.setValue('Plywood__0.018__1.22__2.44');
      await nextTick();

      const list = component.get('[data-testid="layout-list"]');
      expect(list.attributes('data-count')).toBe('1');
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
