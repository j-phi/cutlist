// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import CutlistPreview from '../CutlistPreview.vue';
import { USelectStub } from '~/test-utils/stubs';

type SheetLayout = {
  stock: {
    material: string;
    thicknessUm: number;
    widthUm: number;
    lengthUm: number;
  };
};

type LinearLayout = {
  kind: 'linear';
  stock: {
    material: string;
    crossSectionWidthUm: number;
    crossSectionThicknessUm: number;
    lengthUm: number;
  };
};

type LayoutResult = {
  layouts: SheetLayout[];
  linearLayouts: LinearLayout[];
  leftovers: Array<{
    material: string;
    thicknessUm: number;
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

const activeId = ref<string | null>('proj-1');
mockNuxtImport('useProjects', () => () => ({ activeId }));

const parsedStock = ref<Array<unknown>>([{ material: 'Plywood' }]);
mockNuxtImport('useProjectSettings', () => () => ({ parsedStock }));

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

function makeLayout(
  material: string,
  thicknessUm: number,
  widthUm = 1.22,
  lengthUm = 2.44,
): SheetLayout {
  return { stock: { material, thicknessUm, widthUm, lengthUm } };
}

function makeLinearLayout(
  material: string,
  lengthUm: number,
  crossSectionWidthUm = 0.0889,
  crossSectionThicknessUm = 0.0381,
): LinearLayout {
  return {
    kind: 'linear',
    stock: { material, crossSectionWidthUm, crossSectionThicknessUm, lengthUm },
  };
}

function makeLeftover(
  material: string,
  thicknessUm: number,
  partNumber: number,
) {
  return { material, thicknessUm, partNumber };
}

// CutlistPreview's only meaningful UButton usage is the configure-stock CTA.
// We tag it with a testid so the click target is unambiguous; falls back to
// the shared stub's surface otherwise.
const TaggedUButton = {
  inheritAttrs: false,
  template:
    '<button data-testid="configure-stock-button" type="button" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>',
  emits: ['click'],
};

function getComponent() {
  return shallowMount(CutlistPreview, {
    global: {
      stubs: {
        UIcon: true,
        USelect: USelectStub,
        UButton: TaggedUButton,
        LayoutList: {
          template:
            '<div data-testid="layout-list" :data-count="layouts.length" />',
          props: ['layouts'],
        },
        LinearLayoutList: {
          template:
            '<div data-testid="linear-layout-list" :data-count="layouts.length" />',
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
  parsedStock.value = [{ material: 'Plywood' }];
  scale.value = 1;
  resetZoom.mockClear();
  zoomIn.mockClear();
  zoomOut.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('CutlistPreview', () => {
  describe('State rendering', () => {
    it.each([
      {
        scenario: 'error overrides everything',
        setup: () => {
          error.value = 'Boom';
        },
        expect: (text: string) => {
          expect(text).toContain('Boom');
        },
        layoutListVisible: false,
      },
      {
        scenario: 'computing indicator when no data and busy',
        setup: () => {
          isComputing.value = true;
        },
        expect: (text: string) => {
          expect(text).toContain('Computing layouts');
        },
        layoutListVisible: false,
      },
      {
        scenario: 'no-parts empty state when no layouts and no leftovers',
        setup: () => {
          data.value = { layouts: [], linearLayouts: [], leftovers: [] };
        },
        expect: (text: string) => {
          expect(text).toContain('No board layouts yet');
          expect(text).toContain('Add parts in the BOM tab');
        },
        layoutListVisible: false,
      },
    ])('$scenario', ({ setup, expect: assert, layoutListVisible }) => {
      setup();
      const component = getComponent();
      assert(component.text());
      expect(component.find('[data-testid="layout-list"]').exists()).toBe(
        layoutListVisible,
      );
    });

    it('Should render the no-stock empty state with a configure-stock CTA when no stock is configured', () => {
      parsedStock.value = [];
      data.value = { layouts: [], linearLayouts: [], leftovers: [] };
      const component = getComponent();

      expect(component.text()).toContain('No stock configured');
      expect(
        component.find('[data-testid="configure-stock-button"]').exists(),
      ).toBe(true);
    });

    it('Should render the no-matching-stock empty state with a configure-stock CTA when parts exist but no layouts were produced, and suppress the leftover banner', () => {
      data.value = {
        layouts: [],
        linearLayouts: [],
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
      // Empty-state CTA shows once; redundant leftover banner does not.
      expect(component.text()).not.toContain('could not be placed on');
    });

    it('Should still show the leftover banner when some layouts placed but others did not', () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018)],
        linearLayouts: [],
        leftovers: [makeLeftover('MDF', 0.012, 1)],
      };
      expect(getComponent().text()).toContain(
        'could not be placed on matching stock',
      );
    });
  });

  describe('Stock filter', () => {
    it.each([
      {
        scenario: 'hidden when only one stock option is present',
        layouts: [makeLayout('Plywood', 0.018)],
        visible: false,
      },
      {
        scenario: 'visible when multiple distinct stocks exist',
        layouts: [makeLayout('Plywood', 0.018), makeLayout('MDF', 0.012)],
        visible: true,
      },
    ])('$scenario', ({ layouts, visible }) => {
      data.value = { layouts, linearLayouts: [], leftovers: [] };
      expect(getComponent().find('select').exists()).toBe(visible);
    });

    it('Should filter layouts by stock key on change and reset to __all__ when the selected option disappears', async () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018), makeLayout('MDF', 0.012)],
        linearLayouts: [],
        leftovers: [],
      };
      const component = getComponent();
      await nextTick();

      const select = component.get('select');
      await select.setValue('MDF__0.012__1.22__2.44');
      await nextTick();

      const list = component.get('[data-testid="layout-list"]');
      expect(list.attributes('data-count')).toBe('1');

      // Drop MDF; selection must reset.
      data.value = {
        layouts: [makeLayout('Plywood', 0.018)],
        linearLayouts: [],
        leftovers: [],
      };
      await nextTick();
      // With one option remaining, dropdown is hidden.
      expect(component.find('select').exists()).toBe(false);

      data.value = {
        layouts: [makeLayout('Plywood', 0.018), makeLayout('Birch', 0.018)],
        linearLayouts: [],
        leftovers: [],
      };
      await nextTick();
      const restored = component.get('select');
      expect((restored.element as HTMLSelectElement).value).toBe('__all__');
    });

    it('Should not include linear stock in the sheet stock filter', () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018)],
        linearLayouts: [makeLinearLayout('Pine 2x4', 2.4384)],
        leftovers: [],
      };
      // One sheet stock + one linear stock → sheet filter is hidden because
      // the sheet side has only one option. Linear stock must not pad the
      // sheet's option count.
      expect(getComponent().find('select').exists()).toBe(false);
    });
  });

  describe('Sheet vs linear branching', () => {
    it('Should render both lists with their respective counts when the project mixes sheet and linear', () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018)],
        linearLayouts: [
          makeLinearLayout('Pine 2x4', 2.4384),
          makeLinearLayout('Pine 2x4', 3.048),
        ],
        leftovers: [],
      };
      const component = getComponent();

      expect(
        component.get('[data-testid="layout-list"]').attributes('data-count'),
      ).toBe('1');
      expect(
        component
          .get('[data-testid="linear-layout-list"]')
          .attributes('data-count'),
      ).toBe('2');
    });

    it('Should render only the linear list for a pure-linear project', () => {
      data.value = {
        layouts: [],
        linearLayouts: [makeLinearLayout('Pine 2x4', 2.4384)],
        leftovers: [],
      };
      const component = getComponent();

      expect(component.find('[data-testid="layout-list"]').exists()).toBe(
        false,
      );
      expect(
        component
          .get('[data-testid="linear-layout-list"]')
          .attributes('data-count'),
      ).toBe('1');
    });

    it('Should render only the sheet list for a pure-sheet project', () => {
      data.value = {
        layouts: [makeLayout('Plywood', 0.018)],
        linearLayouts: [],
        leftovers: [],
      };
      const component = getComponent();

      expect(component.find('[data-testid="layout-list"]').exists()).toBe(true);
      expect(
        component.find('[data-testid="linear-layout-list"]').exists(),
      ).toBe(false);
    });
  });

  it('points the configure-stock CTA at the boards tab URL', () => {
    data.value = {
      layouts: [],
      linearLayouts: [],
      leftovers: [makeLeftover('Plywood', 0.018, 1)],
    };
    const component = getComponent();
    expect(
      component.get('[data-testid="configure-stock-button"]').attributes('to'),
    ).toBe('/build/proj-1/boards');
  });
});
