// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest';
import { computed, defineComponent, h, ref } from 'vue';
import { mount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import {
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  type StockMatrix,
} from 'cutlist';

import { STOCK_PRESETS, presetToMmStock } from '~/utils/settings';
import { uniqueMaterialName } from '~/composables/useStockMutations';
import { UTextareaStub, UModalStub } from '~/test-utils/stubs';
import StockTab from '../StockTab.vue';

const stocks = ref<StockMatrix[]>([]);
const distanceUnit = ref<'mm' | 'in'>('mm');
const activeId = ref<string | null>('p1');
const precision = computed(() =>
  distanceUnit.value === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION,
);

// `add` records into the reactive stocks list (mirrors the real mutation's
// observable effect) so assertions are over outcome, not mock metadata.
const addCalls: StockMatrix[][] = [];

mockNuxtImport('useProjectSettings', () => () => ({
  stocks,
  distanceUnit,
  precision,
}));

mockNuxtImport('useProjects', () => () => ({ activeId }));

mockNuxtImport('useStockMutations', () => () => ({
  add: (matrices: StockMatrix[]) => {
    addCalls.push(matrices);
    // Mirror the real mutation's name-dedup so collision tests stay honest.
    const list = stocks.value.slice();
    for (const m of matrices) {
      list.push({ ...m, material: uniqueMaterialName(m.material, list) });
    }
    stocks.value = list;
  },
  update: (idx: number, m: StockMatrix) => {
    stocks.value = stocks.value.map((s, i) => (i === idx ? m : s));
  },
  remove: (idx: number) => {
    stocks.value = stocks.value.filter((_, i) => i !== idx);
  },
}));

mockNuxtImport('useToast', () => () => ({ add: () => {} }));

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
    duplicateName: { type: Boolean, default: false },
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
          'data-duplicate': String(props.duplicateName),
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
        UTextarea: UTextareaStub,
        UModal: UModalStub,
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

function fireDrop(component: ReturnType<typeof getComponent>, files: File[]) {
  const root = component.element as HTMLElement;
  const dt = new DataTransfer();
  for (const f of files) dt.items.add(f);
  const event = new DragEvent('drop', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'dataTransfer', { value: dt });
  root.dispatchEvent(event);
}

async function flush(component: ReturnType<typeof getComponent>) {
  await new Promise((r) => setTimeout(r, 0));
  await component.vm.$nextTick();
}

const VALID_TSV = [
  'Name\tWidth\tHeight\tThickness',
  'Birch Ply\t1220mm\t2440mm\t18mm',
  'Pine\t140mm\t3000mm\t19mm',
].join('\n');

describe('StockTab', () => {
  afterEach(() => {
    stocks.value = [];
    distanceUnit.value = 'mm';
    activeId.value = 'p1';
    addCalls.length = 0;
  });

  describe('Card list', () => {
    it('renders one StockCard per entry in order, with the right kind label', () => {
      stocks.value = [
        presetToMmStock(firstSheet()),
        presetToMmStock(firstTimber()),
        presetToMmStock(firstSheet()),
      ];
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
    it('renders empty-state guidance and the two add buttons', () => {
      stocks.value = [];
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
  });

  describe('Add custom', () => {
    it.each([
      ['sheet', 'Sheet', 'stock-empty-add-sheet'],
      ['timber', 'Timber', 'stock-empty-add-timber'],
    ] as const)(
      'appends a blank %s via empty-state button and dropdown',
      async (expectedKind, dropdownLabel, emptyTestId) => {
        // Empty-state path.
        stocks.value = [];
        let component = getComponent();
        await component.find(`[data-testid="${emptyTestId}"]`).trigger('click');
        expect(stocks.value[0].kind).toBe(
          expectedKind === 'sheet' ? 'sheet' : 'linear',
        );

        // Dropdown path on a non-empty list.
        stocks.value = [presetToMmStock(firstSheet())];
        component = getComponent();
        await clickItem(component, dropdownLabel);
        expect(stocks.value).toHaveLength(2);
        expect(stocks.value[1].kind).toBe(
          expectedKind === 'sheet' ? 'sheet' : 'linear',
        );
      },
    );

    it('seeds a timber row with positive cross-section + at least one length', async () => {
      stocks.value = [];
      await getComponent()
        .find('[data-testid="stock-empty-add-timber"]')
        .trigger('click');
      const added = stocks.value[0];
      if (added.kind !== 'linear') throw new Error('expected linear row');
      expect(added.size.crossSectionWidth).toBeGreaterThan(0);
      expect(added.size.crossSectionThickness).toBeGreaterThan(0);
      expect(added.size.lengths.length).toBeGreaterThan(0);
    });
  });

  describe('Add preset dropdown', () => {
    it.each(['mm', 'in'] as const)(
      'shows only %s presets in a %s project',
      (unit) => {
        distanceUnit.value = unit;
        stocks.value = [];
        const labels = getComponent()
          .findAll('button[data-item-label]')
          .filter((b) =>
            ['Sheet', 'Timber'].includes(
              b.attributes('data-group-label') ?? '',
            ),
          )
          .map((b) => b.attributes('data-item-label')!);
        expect(labels.length).toBeGreaterThan(0);
        for (const l of labels) {
          expect(l).toMatch(unit === 'mm' ? /\(mm\)$/ : /\(in\)$/);
        }
      },
    );

    it('appends the selected preset (kind preserved)', async () => {
      const timber = firstTimber();
      stocks.value = [];
      await clickItem(getComponent(), timber.label, 'Timber');
      const added = stocks.value[0];
      expect(added.kind).toBe('linear');
      expect(added.material).toBe(timber.stock.material);
    });
  });

  describe('Unique material names', () => {
    it('auto-suffixes a second "Add Sheet" so the new card does not collide', async () => {
      stocks.value = [];
      const component = getComponent();
      await clickItem(component, 'Sheet');
      await clickItem(component, 'Sheet');
      expect(stocks.value.map((r) => r.material)).toEqual([
        'New Material',
        'New Material (2)',
      ]);
    });

    it('flags trim+case-insensitive collisions as duplicate', () => {
      // "Pine", "pine ", and " PINE" are the same material to a human; the
      // packer keys by exact string, so the duplicate warning has to catch
      // these or the user silently gets distinct stock buckets.
      stocks.value = [
        { kind: 'sheet', material: 'Pine', sizes: [] },
        { kind: 'sheet', material: 'pine ', sizes: [] },
        { kind: 'sheet', material: 'Oak', sizes: [] },
      ];
      const cards = getComponent().findAll('[data-testid="stock-card-sheet"]');
      expect(cards[0].attributes('data-duplicate')).toBe('true');
      expect(cards[1].attributes('data-duplicate')).toBe('true');
      expect(cards[2].attributes('data-duplicate')).toBe('false');
    });
  });

  describe('Remove', () => {
    it('removes the entry when StockCard emits remove', async () => {
      stocks.value = [
        presetToMmStock(firstSheet()),
        presetToMmStock(firstTimber()),
      ];
      const component = getComponent();

      await component
        .findAll('[data-testid="stock-card-stub-remove"]')[0]
        .trigger('click');

      expect(stocks.value).toHaveLength(1);
      expect(stocks.value[0].kind).toBe('linear');
    });
  });

  describe('CSV import', () => {
    it('imports pasted TSV into sheet stock via the modal', async () => {
      stocks.value = [];
      const component = getComponent();

      await component.find('[data-testid="stock-import-csv"]').trigger('click');
      await component.find('textarea').setValue(VALID_TSV);
      await component
        .find('[data-testid="stock-import-rows"]')
        .trigger('click');
      await flush(component);

      expect(addCalls).toHaveLength(1);
      const matrices = addCalls[0];
      expect(matrices).toHaveLength(2);
      expect(matrices[0]).toMatchObject({
        kind: 'sheet',
        material: 'Birch Ply',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      });
      expect(matrices[1].material).toBe('Pine');
    });

    it('renders a skipped-row summary when some rows are invalid', async () => {
      stocks.value = [];
      const component = getComponent();
      const tsv = [
        'Name\tWidth\tHeight\tThickness',
        'Good\t1220mm\t2440mm\t18mm',
        '\t1220mm\t2440mm\t18mm', // missing name
      ].join('\n');

      await component.find('[data-testid="stock-import-csv"]').trigger('click');
      await component.find('textarea').setValue(tsv);
      await component
        .find('[data-testid="stock-import-rows"]')
        .trigger('click');
      await flush(component);

      const summary = component.find('[data-testid="stock-import-summary"]');
      expect(summary.exists()).toBe(true);
      expect(summary.text()).toMatch(/Imported 1 stock row/);
      expect(summary.text()).toMatch(/Skipped 1 row/);
    });

    it('retains the pasted text when no rows import, so the user can fix and retry', async () => {
      stocks.value = [];
      const component = getComponent();

      await component.find('[data-testid="stock-import-csv"]').trigger('click');
      // Header missing the required Thickness column → 0 rows imported.
      const tsv = ['Name\tWidth\tHeight', 'Good\t1220mm\t2440mm'].join('\n');
      const textarea = component.find('textarea');
      await textarea.setValue(tsv);
      await component
        .find('[data-testid="stock-import-rows"]')
        .trigger('click');
      await flush(component);

      expect(addCalls).toEqual([]);
      expect((textarea.element as HTMLTextAreaElement).value).not.toBe('');
    });

    it('adds sheet stock when a .csv file is dropped', async () => {
      stocks.value = [];
      const component = getComponent();

      fireDrop(component, [new File([VALID_TSV], 'stock.csv')]);
      await flush(component);

      expect(addCalls).toHaveLength(1);
      expect(addCalls[0]).toHaveLength(2);
      expect(addCalls[0][0].material).toBe('Birch Ply');
    });
  });
});
