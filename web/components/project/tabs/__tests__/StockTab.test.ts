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
    return () => {
      const items = props.items as DropdownItem[] | DropdownItem[][];
      const groups: DropdownItem[][] = Array.isArray(items[0])
        ? (items as DropdownItem[][])
        : [items as DropdownItem[]];
      return h('div', [
        slots.default ? slots.default() : undefined,
        h(
          'ul',
          { 'data-testid': 'dropdown-items' },
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
                      'data-item-label': item.label,
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
    };
  },
});

/**
 * Minimal StockCard stub — preserves the test surface of the old per-kind
 * stubs (`data-testid="stock-card-{kind}"`, `data-material`, remove button).
 */
const StockCardStub = defineComponent({
  props: {
    modelValue: { type: Object, required: true },
    distanceUnit: { type: String, required: true },
    precision: { type: Object, required: true },
  },
  emits: ['update:modelValue', 'remove'],
  setup(props, { emit }) {
    return () => {
      const mv = props.modelValue as {
        kind: 'sheet' | 'linear';
        material: string;
      };
      return h(
        'div',
        {
          'data-testid': `stock-card-${mv.kind === 'linear' ? 'timber' : 'sheet'}`,
          'data-material': mv.material,
        },
        [
          h(
            'button',
            {
              type: 'button',
              'data-testid': 'stock-card-stub-remove',
              onClick: () => emit('remove'),
            },
            'remove',
          ),
        ],
      );
    };
  },
});

function getComponent() {
  return mount(StockTab, {
    global: {
      stubs: {
        UButton: UButtonStub,
        UIcon: true,
        UDropdownMenu: UDropdownMenuStub,
        StockCard: StockCardStub,
      },
    },
  });
}

function firstSheet(unit: 'mm' | 'in' = 'mm') {
  return STOCK_PRESETS.find(
    (p) => p.stock.kind === 'sheet' && p.unit === unit,
  )!;
}

function firstTimber(unit: 'mm' | 'in' = 'mm') {
  return STOCK_PRESETS.find(
    (p) => p.stock.kind === 'linear' && p.unit === unit,
  )!;
}

function clickItem(
  component: ReturnType<typeof getComponent>,
  label: string,
  group?: string,
) {
  const button = component
    .findAll('button')
    .find(
      (b) =>
        b.attributes('data-item-label') === label &&
        (group == null || b.attributes('data-group-label') === group),
    );
  if (!button) {
    const available = component
      .findAll('button[data-item-label]')
      .map(
        (b) =>
          `${b.attributes('data-group-label')}/${b.attributes('data-item-label')}`,
      );
    throw new Error(
      `Missing dropdown item "${label}"${group ? ` in group "${group}"` : ''}. Available: ${available.join(', ')}`,
    );
  }
  return button.trigger('click');
}

describe('StockTab', () => {
  afterEach(() => {
    stock.value = undefined;
    distanceUnit.value = 'mm';
  });

  describe('Card list', () => {
    it('renders one StockCard per entry in order, with the right kind label', () => {
      stock.value = YAML.dump([
        presetToMmStock(firstSheet()),
        presetToMmStock(firstTimber()),
        presetToMmStock(firstSheet()),
      ]);
      const cards = getComponent().findAll(
        '[data-testid="stock-card-sheet"], [data-testid="stock-card-timber"]',
      );
      expect(cards).toHaveLength(3);
      expect(cards[0].attributes('data-testid')).toBe('stock-card-sheet');
      expect(cards[1].attributes('data-testid')).toBe('stock-card-timber');
      expect(cards[2].attributes('data-testid')).toBe('stock-card-sheet');
    });
  });

  describe('Empty state', () => {
    it('renders the empty-state guidance when there are no entries', () => {
      stock.value = YAML.dump([]);
      const component = getComponent();
      expect(component.find('[data-testid="stock-empty-state"]').exists()).toBe(
        true,
      );
      expect(
        component.find('[data-testid="stock-empty-add-sheet"]').exists(),
      ).toBe(true);
      expect(
        component.find('[data-testid="stock-empty-add-timber"]').exists(),
      ).toBe(true);
    });

    it('"Add sheet" in empty state appends a blank sheet', async () => {
      stock.value = YAML.dump([]);
      const component = getComponent();
      await component
        .find('[data-testid="stock-empty-add-sheet"]')
        .trigger('click');
      const parsed = YAML.load(stock.value!) as Array<{ kind: string }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].kind).toBe('sheet');
    });

    it('"Add timber" in empty state appends a blank linear with seeded defaults', async () => {
      stock.value = YAML.dump([]);
      const component = getComponent();
      await component
        .find('[data-testid="stock-empty-add-timber"]')
        .trigger('click');
      const parsed = YAML.load(stock.value!) as Array<{
        kind: string;
        size?: { lengths: number[] };
      }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].kind).toBe('linear');
      // Seed length > 0 so the user isn't dropped into a blank slate.
      expect(parsed[0].size!.lengths.length).toBeGreaterThan(0);
    });
  });

  describe('Add custom dropdown', () => {
    it('"Sheet" appends a blank kind:sheet entry', async () => {
      stock.value = YAML.dump([presetToMmStock(firstSheet())]);
      const component = getComponent();

      await clickItem(component, 'Sheet');

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

    it('"Timber" appends a blank kind:linear entry with seeded cross-section + length', async () => {
      stock.value = YAML.dump([presetToMmStock(firstSheet())]);
      const component = getComponent();

      await clickItem(component, 'Timber');

      const parsed = YAML.load(stock.value!) as Array<{
        kind: string;
        material: string;
        size: {
          crossSectionWidth: number;
          crossSectionThickness: number;
          lengths: number[];
        };
      }>;
      expect(parsed).toHaveLength(2);
      expect(parsed[1].kind).toBe('linear');
      expect(parsed[1].size.crossSectionWidth).toBeGreaterThan(0);
      expect(parsed[1].size.crossSectionThickness).toBeGreaterThan(0);
      expect(parsed[1].size.lengths.length).toBeGreaterThan(0);
    });
  });

  describe('Add preset dropdown', () => {
    it('shows only mm presets in an mm project', () => {
      distanceUnit.value = 'mm';
      stock.value = YAML.dump([]);
      const component = getComponent();
      const labels = component
        .findAll('button[data-item-label]')
        .filter((b) =>
          ['Sheet', 'Timber'].includes(b.attributes('data-group-label') ?? ''),
        )
        .map((b) => b.attributes('data-item-label')!);
      // Every visible preset must end with "(mm)".
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) {
        expect(l).toMatch(/\(mm\)$/);
      }
    });

    it('shows only inch presets in an in project', () => {
      distanceUnit.value = 'in';
      stock.value = YAML.dump([]);
      const component = getComponent();
      const labels = component
        .findAll('button[data-item-label]')
        .filter((b) =>
          ['Sheet', 'Timber'].includes(b.attributes('data-group-label') ?? ''),
        )
        .map((b) => b.attributes('data-item-label')!);
      expect(labels.length).toBeGreaterThan(0);
      for (const l of labels) {
        expect(l).toMatch(/\(in\)$/);
      }
    });

    it('appends a sheet preset to the YAML', async () => {
      const sheet = firstSheet();
      stock.value = YAML.dump([]);
      const component = getComponent();

      await clickItem(component, sheet.label, 'Sheet');

      const parsed = YAML.load(stock.value!) as Array<{ material: string }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].material).toBe(sheet.stock.material);
    });

    it('appends a kind:linear row when a timber preset is selected', async () => {
      const timber = firstTimber();
      stock.value = YAML.dump([]);
      const component = getComponent();

      await clickItem(component, timber.label, 'Timber');

      const parsed = YAML.load(stock.value!) as Array<{ kind: string }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].kind).toBe('linear');
    });
  });

  describe('Remove', () => {
    it('removes the entry when StockCard emits remove', async () => {
      stock.value = YAML.dump([
        presetToMmStock(firstSheet()),
        presetToMmStock(firstTimber()),
      ]);
      const component = getComponent();

      await component
        .findAll('[data-testid="stock-card-stub-remove"]')[0]
        .trigger('click');

      const parsed = YAML.load(stock.value!) as Array<{ kind: string }>;
      expect(parsed).toHaveLength(1);
      expect(parsed[0].kind).toBe('linear');
    });
  });
});
