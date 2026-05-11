// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest';
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

const SheetStockInputStub = defineComponent({
  props: {
    modelValue: { type: Object, required: true },
    distanceUnit: { type: String, required: true },
    precision: { type: Object, required: true },
  },
  emits: ['update:modelValue', 'remove'],
  setup(props, { emit }) {
    return () =>
      h(
        'div',
        {
          'data-testid': 'sheet-stock-input',
          'data-material': (props.modelValue as { material: string }).material,
        },
        [
          h(
            'button',
            {
              type: 'button',
              'data-testid': 'sheet-stub-remove',
              onClick: () => emit('remove'),
            },
            'remove',
          ),
        ],
      );
  },
});

const LinearStockInputStub = defineComponent({
  props: {
    modelValue: { type: Object, required: true },
    distanceUnit: { type: String, required: true },
    precision: { type: Object, required: true },
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
        SheetStockInput: SheetStockInputStub,
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

function firstSheet() {
  return STOCK_PRESETS.find((p) => p.stock.kind === 'sheet')!;
}

function firstTimber() {
  return STOCK_PRESETS.find((p) => p.stock.kind === 'linear')!;
}

describe('StockTab', () => {
  afterEach(() => {
    stock.value = undefined;
    distanceUnit.value = 'mm';
  });

  describe('Flat rendering', () => {
    it('renders one row per entry, dispatched by kind, in order', () => {
      stock.value = YAML.dump([
        presetToMmStock(firstSheet()),
        presetToMmStock(firstTimber()),
        presetToMmStock(firstSheet()),
      ]);
      const component = getComponent();
      const rows = component.findAll(
        '[data-testid="sheet-stock-input"], [data-testid="linear-stock-input"]',
      );
      expect(rows).toHaveLength(3);
      expect(rows[0].attributes('data-testid')).toBe('sheet-stock-input');
      expect(rows[1].attributes('data-testid')).toBe('linear-stock-input');
      expect(rows[2].attributes('data-testid')).toBe('sheet-stock-input');
    });
  });

  describe('Add custom', () => {
    it('appends a blank kind:sheet entry to the YAML', async () => {
      stock.value = YAML.dump([presetToMmStock(firstSheet())]);
      const component = getComponent();

      await getButton(component, 'Add custom').trigger('click');

      const parsed = YAML.load(stock.value!) as Array<{
        kind: string;
        material: string;
        sizes: unknown[];
      }>;
      expect(parsed).toHaveLength(2);
      expect(parsed[1].kind).toBe('sheet');
      expect(parsed[1].material).toBe('New Material');
      expect(parsed[1].sizes).toEqual([]);
    });
  });

  describe('Add preset dropdown', () => {
    it('appends a sheet preset to the YAML', async () => {
      const sheet = firstSheet();
      stock.value = YAML.dump([presetToMmStock(sheet)]);

      const component = getComponent();
      const presetButton = component
        .findAll('button')
        .find(
          (b) =>
            b.attributes('data-preset-label') === sheet.label &&
            b.attributes('data-group-label') === 'Sheet',
        );
      expect(presetButton).toBeDefined();

      await presetButton!.trigger('click');

      const parsed = YAML.load(stock.value!) as Array<{ material: string }>;
      expect(parsed).toHaveLength(2);
      expect(parsed[1].material).toBe(sheet.stock.material);
    });

    it('appends a kind:linear row when a timber preset is selected', async () => {
      stock.value = YAML.dump([presetToMmStock(firstSheet())]);
      const component = getComponent();

      const timberBtn = component
        .findAll('button')
        .find((b) => b.attributes('data-preset-label') === firstTimber().label);
      expect(timberBtn).toBeDefined();

      await timberBtn!.trigger('click');

      const parsed = YAML.load(stock.value!) as Array<{ kind: string }>;
      expect(parsed).toHaveLength(2);
      expect(parsed[1].kind).toBe('linear');
    });

    it('groups sheet and timber presets under separate labels', () => {
      stock.value = YAML.dump([presetToMmStock(firstSheet())]);
      const component = getComponent();

      const sheetButtons = component
        .findAll('button')
        .filter((b) => b.attributes('data-group-label') === 'Sheet');
      const timberButtons = component
        .findAll('button')
        .filter((b) => b.attributes('data-group-label') === 'Timber');

      expect(sheetButtons.length).toBeGreaterThan(0);
      expect(timberButtons.length).toBeGreaterThan(0);
    });
  });

  describe('Remove', () => {
    it('removes a sheet entry when SheetStockInput emits remove', async () => {
      stock.value = YAML.dump([
        presetToMmStock(firstSheet()),
        presetToMmStock(firstTimber()),
      ]);
      const component = getComponent();

      await component
        .find('[data-testid="sheet-stub-remove"]')
        .trigger('click');

      const parsed = YAML.load(stock.value!) as Array<{ kind: string }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].kind).toBe('linear');
    });

    it('removes a linear entry when LinearStockInput emits remove', async () => {
      stock.value = YAML.dump([
        presetToMmStock(firstSheet()),
        presetToMmStock(firstTimber()),
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
