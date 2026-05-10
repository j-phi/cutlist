// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest';
import { computed, defineComponent, h, ref } from 'vue';
import YAML from 'js-yaml';
import { mount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { DEFAULT_INCH_PRECISION, DEFAULT_MM_PRECISION } from 'cutlist';

import { STOCK_PRESETS, presetToMmStock } from '~/utils/settings';
import StockTab from '../StockTab.vue';

const stock = ref<string | undefined>(undefined);
const distanceUnit = ref<'mm' | 'in'>('mm');
const precision = computed(() =>
  distanceUnit.value === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION,
);

mockNuxtImport('useProjectSettings', () => () => ({
  stock,
  distanceUnit,
  precision,
}));

const addMaterialSpy = vi.fn();
const scrollToBottomSpy = vi.fn();
const commitSpy = vi.fn(() => true);

const StockMatrixInputStub = defineComponent({
  props: {
    modelValue: { type: String, required: true },
  },
  emits: ['update:modelValue'],
  setup(_props, { expose }) {
    expose({
      addMaterial: addMaterialSpy,
      scrollToBottom: scrollToBottomSpy,
      commit: commitSpy,
    });
    return () => h('div', { 'data-testid': 'stock-matrix-input' });
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

interface DropdownItem {
  label: string;
  type?: 'label' | 'separator' | 'link';
  onSelect?: () => void;
}

const UDropdownMenuStub = defineComponent({
  props: {
    items: {
      type: Array as () => DropdownItem[] | DropdownItem[][],
      default: () => [],
    },
  },
  setup(props, { slots }) {
    // Flatten group-arrays (Nuxt UI groups items via nested arrays). Render
    // a "group-label" attribute on rows so tests can assert grouping.
    const groups: DropdownItem[][] = Array.isArray(props.items[0])
      ? (props.items as DropdownItem[][])
      : [props.items as DropdownItem[]];
    return () =>
      h('div', [
        slots.default ? slots.default() : undefined,
        h(
          'ul',
          { 'data-testid': 'preset-items' },
          groups.flatMap((group, gIdx) => {
            const labelItem = group.find((i) => i.type === 'label');
            const groupLabel = labelItem?.label ?? `group-${gIdx}`;
            return group
              .filter((i) => i.type !== 'label')
              .map((item) =>
                h(
                  'li',
                  {},
                  h(
                    'button',
                    {
                      type: 'button',
                      'data-preset-label': item.label,
                      'data-group-label': groupLabel,
                      onClick: () => item.onSelect?.(),
                    },
                    item.label,
                  ),
                ),
              );
          }),
        ),
      ]);
  },
});

const LinearStockInputStub = defineComponent({
  props: {
    modelValue: { type: Object, required: true },
    distanceUnit: { type: String, required: true },
    precision: { type: Object, required: true },
    availableLengths: { type: Array, default: undefined },
  },
  emits: ['update:modelValue', 'remove'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          'data-testid': 'linear-stock-input',
          'data-material': (props.modelValue as { material: string }).material,
        },
        [
          h(
            'button',
            {
              type: 'button',
              'data-testid': 'linear-stub-remove',
              onClick: () => emit('remove'),
            },
            'remove',
          ),
        ],
      );
  },
});

function getComponent() {
  return mount(StockTab, {
    global: {
      stubs: {
        UButton: UButtonStub,
        UIcon: true,
        UDropdownMenu: UDropdownMenuStub,
        StockMatrixInput: StockMatrixInputStub,
        LinearStockInput: LinearStockInputStub,
      },
    },
  });
}

function getButton(component: ReturnType<typeof getComponent>, text: string) {
  const button = component.findAll('button').find((b) => b.text() === text);
  if (!button) throw new Error(`Missing button: ${text}`);
  return button;
}

describe('StockTab', () => {
  afterEach(() => {
    stock.value = undefined;
    distanceUnit.value = 'mm';
    addMaterialSpy.mockReset();
    scrollToBottomSpy.mockReset();
    commitSpy.mockReset();
    vi.restoreAllMocks();
  });

  function firstSheet() {
    return STOCK_PRESETS.find((p) => p.stock.kind === 'sheet')!;
  }

  function firstTimber() {
    return STOCK_PRESETS.find((p) => p.stock.kind === 'linear')!;
  }

  describe('Add custom', () => {
    it('Should call addMaterial and scrollToBottom on the StockMatrixInput', async () => {
      stock.value = YAML.dump([STOCK_PRESETS[0].stock]);

      const component = getComponent();

      await getButton(component, 'Add custom').trigger('click');

      expect(addMaterialSpy).toHaveBeenCalledTimes(1);
      expect(scrollToBottomSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Add preset dropdown', () => {
    it('Should append the chosen preset to the YAML stock and call scrollToBottom', async () => {
      const initialStock = [STOCK_PRESETS[0].stock];
      stock.value = YAML.dump(initialStock);

      const component = getComponent();
      const presetButton = component
        .findAll('button')
        .find(
          (b) => b.attributes('data-preset-label') === STOCK_PRESETS[1].label,
        );
      expect(presetButton).toBeDefined();

      await presetButton!.trigger('click');

      expect(stock.value).toBeTypeOf('string');
      const parsed = YAML.load(stock.value!) as Array<{ material: string }>;
      expect(parsed).toHaveLength(2);
      expect(parsed[0].material).toBe(STOCK_PRESETS[0].stock.material);
      expect(parsed[1].material).toBe(STOCK_PRESETS[1].stock.material);
      expect(scrollToBottomSpy).toHaveBeenCalledTimes(1);
    });

    it('Should group sheet and timber presets under separate labels', async () => {
      stock.value = YAML.dump([firstSheet().stock]);
      const component = getComponent();

      const sheetButtons = component
        .findAll('button')
        .filter((b) => b.attributes('data-group-label') === 'Sheet');
      const timberButtons = component
        .findAll('button')
        .filter((b) => b.attributes('data-group-label') === 'Timber');

      expect(sheetButtons.length).toBeGreaterThan(0);
      expect(timberButtons.length).toBeGreaterThan(0);
      // Each side should contain at least one preset of its kind.
      expect(
        sheetButtons.some(
          (b) => b.attributes('data-preset-label') === firstSheet().label,
        ),
      ).toBe(true);
      expect(
        timberButtons.some(
          (b) => b.attributes('data-preset-label') === firstTimber().label,
        ),
      ).toBe(true);
    });

    it('Should append a kind:linear row when a timber preset is selected', async () => {
      stock.value = YAML.dump([firstSheet().stock]);
      const component = getComponent();

      const timberBtn = component
        .findAll('button')
        .find((b) => b.attributes('data-preset-label') === firstTimber().label);
      expect(timberBtn).toBeDefined();

      await timberBtn!.trigger('click');

      const parsed = YAML.load(stock.value!) as Array<{ kind: string }>;
      expect(parsed).toHaveLength(2);
      expect(parsed.some((p) => p.kind === 'linear')).toBe(true);
    });

    it('Should replace invalid YAML stock with a single-preset list (catch path)', async () => {
      stock.value = 'this: is: not: valid: yaml: [';

      const component = getComponent();
      const presetButton = component
        .findAll('button')
        .find(
          (b) => b.attributes('data-preset-label') === STOCK_PRESETS[0].label,
        );
      expect(presetButton).toBeDefined();

      await presetButton!.trigger('click');

      expect(stock.value).toBeTypeOf('string');
      const parsed = YAML.load(stock.value!) as Array<{ material: string }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].material).toBe(STOCK_PRESETS[0].stock.material);
      expect(scrollToBottomSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Linear rendering', () => {
    it('Should render both StockMatrixInput and LinearStockInput for a mixed stock list', () => {
      const sheet = firstSheet();
      const timber = firstTimber();
      stock.value = YAML.dump([
        presetToMmStock(sheet),
        presetToMmStock(timber),
      ]);

      const component = getComponent();

      expect(
        component.find('[data-testid="stock-matrix-input"]').exists(),
      ).toBe(true);
      const linears = component.findAll('[data-testid="linear-stock-input"]');
      expect(linears).toHaveLength(1);
      expect(linears[0].attributes('data-material')).toBe(
        timber.stock.material,
      );
    });

    it('Should drop a linear entry from YAML when LinearStockInput emits remove', async () => {
      const sheet = firstSheet();
      const timber = firstTimber();
      stock.value = YAML.dump([
        presetToMmStock(sheet),
        presetToMmStock(timber),
      ]);

      const component = getComponent();
      await component
        .find('[data-testid="linear-stub-remove"]')
        .trigger('click');

      const parsed = YAML.load(stock.value!) as Array<{ kind: string }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].kind).toBe('sheet');
    });
  });
});
