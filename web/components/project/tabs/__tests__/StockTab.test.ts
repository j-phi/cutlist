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
import { consolidateStock } from '~/utils/consolidateStock';
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
    // Mirror the real mutation: append as-is, no dedup.
    stocks.value = [...stocks.value, ...matrices];
  },
  update: (idx: number, m: StockMatrix) => {
    stocks.value = stocks.value.map((s, i) => (i === idx ? m : s));
  },
  remove: (idx: number) => {
    stocks.value = stocks.value.filter((_, i) => i !== idx);
  },
  consolidate: () => {
    const { result, removed } = consolidateStock(stocks.value);
    if (removed > 0) stocks.value = result;
    return removed;
  },
}));

mockNuxtImport('useToast', () => () => ({ add: () => {} }));

// Buy-projection deps. Default to an empty layout so the projection stays
// hidden; the projection test overrides `layoutData` per case.
const layoutData = ref<{ layouts: unknown[] } | undefined>(undefined);
mockNuxtImport('useBoardLayoutsQuery', () => () => ({ data: layoutData }));
mockNuxtImport(
  'useFormatDistance',
  () => () => (um: number | null | undefined) =>
    um == null ? undefined : `${um}mm`,
);

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
    materialOptions: { type: Array, default: () => [] },
    duplicateName: { type: Boolean, default: false },
    showQuantity: { type: Boolean, default: false },
  },
  emits: ['update:modelValue', 'remove'],
  setup(props, { emit }) {
    return () => {
      const mv = props.modelValue as {
        kind: 'sheet' | 'linear';
        name?: string;
        material: string;
      };
      return h(
        'div',
        {
          'data-testid': `stock-card-${mv.kind === 'linear' ? 'timber' : 'sheet'}`,
          'data-name': mv.name ?? '',
          'data-material': mv.material,
          'data-material-options': (props.materialOptions as string[]).join(
            ',',
          ),
          'data-duplicate': String(props.duplicateName),
          'data-show-quantity': String(props.showQuantity),
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
          h(
            'button',
            {
              type: 'button',
              'data-testid': 'stock-card-stub-rename',
              // Emit a renamed copy so the parent's update(idx) is exercised
              // against whichever real index this card maps to.
              onClick: () =>
                emit('update:modelValue', {
                  ...(props.modelValue as object),
                  material: `${mv.material}!`,
                }),
            },
            'rename',
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
    layoutData.value = undefined;
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
      ['sheet', 'Sheet', 'stock-empty-add-sheet', 'New sheet'],
      ['timber', 'Timber', 'stock-empty-add-timber', 'New timber'],
    ] as const)(
      'appends a blank %s (named, Uncategorized) via empty-state button and dropdown',
      async (expectedKind, dropdownLabel, emptyTestId, expectedName) => {
        // Empty-state path.
        stocks.value = [];
        let component = getComponent();
        await component.find(`[data-testid="${emptyTestId}"]`).trigger('click');
        expect(stocks.value[0].kind).toBe(
          expectedKind === 'sheet' ? 'sheet' : 'linear',
        );
        expect(stocks.value[0].name).toBe(expectedName);
        expect(stocks.value[0].material).toBe('Uncategorized');

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

  describe('Duplicate names', () => {
    it('flags trim+case-insensitive duplicate NAMES across all entries', () => {
      // Names are advisory labels; the warning catches human-equal labels
      // ("Sides", "sides ") so two pieces don't read identically on the Layout
      // page. Distinct names — even sharing a category — are not flagged.
      stocks.value = [
        { kind: 'sheet', name: 'Sides', material: 'Plywood', sizes: [] },
        { kind: 'sheet', name: 'sides ', material: 'MDF', sizes: [] },
        { kind: 'sheet', name: 'Top', material: 'Plywood', sizes: [] },
      ];
      const cards = getComponent().findAll('[data-testid="stock-card-sheet"]');
      expect(cards[0].attributes('data-duplicate')).toBe('true');
      expect(cards[1].attributes('data-duplicate')).toBe('true');
      // Shares the "Plywood" category with card 0 but has a unique name.
      expect(cards[2].attributes('data-duplicate')).toBe('false');
    });

    it('flags a duplicate name shared between an offcut and a general row', () => {
      // No offcut exemption: names must be unambiguous across both tiers.
      stocks.value = [
        { kind: 'sheet', name: 'Scrap', material: 'Plywood', sizes: [] },
        {
          kind: 'sheet',
          name: 'Scrap',
          material: 'Plywood',
          role: 'offcut',
          sizes: [{ width: 600, length: 600, thickness: [18], quantity: 1 }],
        },
      ];
      const component = getComponent();
      const offcut = component
        .find('[data-testid="stock-offcuts-section"]')
        .find('[data-material]');
      const general = component
        .find('[data-testid="stock-general-section"]')
        .find('[data-material]');
      expect(offcut.attributes('data-duplicate')).toBe('true');
      expect(general.attributes('data-duplicate')).toBe('true');
    });
  });

  describe('Material category suggestions', () => {
    it('passes the distinct non-empty categories to every card', () => {
      stocks.value = [
        { kind: 'sheet', name: 'A', material: 'Plywood', sizes: [] },
        { kind: 'sheet', name: 'B', material: 'MDF', sizes: [] },
        { kind: 'sheet', name: 'C', material: 'Plywood', sizes: [] },
        { kind: 'sheet', name: 'D', material: '', sizes: [] },
      ];
      const cards = getComponent().findAll('[data-testid="stock-card-sheet"]');
      // Deduped, empty dropped, order preserved.
      expect(cards[0].attributes('data-material-options')).toBe('Plywood,MDF');
      // Same pool handed to all cards.
      for (const c of cards) {
        expect(c.attributes('data-material-options')).toBe('Plywood,MDF');
      }
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

  describe('Offcuts / general split', () => {
    function offcut(material: string, quantity = 1): StockMatrix {
      return {
        kind: 'sheet',
        material,
        role: 'offcut',
        sizes: [{ width: 1220, length: 1220, thickness: [18], quantity }],
      };
    }
    function general(material: string): StockMatrix {
      return { kind: 'sheet', material, sizes: [] };
    }

    it('renders offcuts and general stock in separate sections, only offcuts get showQuantity', () => {
      stocks.value = [general('Ply'), offcut('Half Ply'), general('MDF')];
      const component = getComponent();

      const offcutSection = component.find(
        '[data-testid="stock-offcuts-section"]',
      );
      const generalSection = component.find(
        '[data-testid="stock-general-section"]',
      );
      expect(offcutSection.exists()).toBe(true);

      const offcutCards = offcutSection.findAll('[data-material]');
      expect(offcutCards.map((c) => c.attributes('data-material'))).toEqual([
        'Half Ply',
      ]);
      expect(offcutCards[0].attributes('data-show-quantity')).toBe('true');

      const generalCards = generalSection.findAll('[data-material]');
      expect(generalCards.map((c) => c.attributes('data-material'))).toEqual([
        'Ply',
        'MDF',
      ]);
      expect(generalCards[0].attributes('data-show-quantity')).toBe('false');
    });

    it('hides the offcuts section when there are none', () => {
      stocks.value = [general('Ply')];
      expect(
        getComponent().find('[data-testid="stock-offcuts-section"]').exists(),
      ).toBe(false);
    });

    it('maps a filtered offcut row back to its real index when edited', async () => {
      // Offcut sits at real index 1, between two general rows. Editing it must
      // update index 1, not index 0 (its position within the offcut sublist).
      stocks.value = [general('Ply'), offcut('Half Ply'), general('MDF')];
      const component = getComponent();

      const renameBtn = component
        .find('[data-testid="stock-offcuts-section"]')
        .find('[data-testid="stock-card-stub-rename"]');
      await renameBtn.trigger('click');

      expect(stocks.value.map((s) => s.material)).toEqual([
        'Ply',
        'Half Ply!',
        'MDF',
      ]);
      expect(stocks.value[1].role).toBe('offcut');
    });

    it('removes the correct real index for a filtered offcut row', async () => {
      stocks.value = [general('Ply'), offcut('Half Ply'), general('MDF')];
      const component = getComponent();

      await component
        .find('[data-testid="stock-offcuts-section"]')
        .find('[data-testid="stock-card-stub-remove"]')
        .trigger('click');

      expect(stocks.value.map((s) => s.material)).toEqual(['Ply', 'MDF']);
    });
  });

  describe('Buy projection', () => {
    it('lists projected general purchases from the layout, hidden when empty', async () => {
      stocks.value = [{ kind: 'sheet', material: 'Ply', sizes: [] }];

      let component = getComponent();
      expect(
        component.find('[data-testid="stock-buy-projection"]').exists(),
      ).toBe(false);

      // Two general Ply sheets of one size used in the layout.
      const sheet = (n: number) => ({
        stock: {
          kind: 'sheet',
          material: 'Ply',
          role: 'general',
          thicknessUm: 18000,
          widthUm: 1220000,
          lengthUm: 2440000,
        },
        // remaining layout fields are unused by aggregateSheetShoppingList
        id: n,
      });
      layoutData.value = { layouts: [sheet(1), sheet(2)] };
      component = getComponent();

      const projection = component.find('[data-testid="stock-buy-projection"]');
      expect(projection.exists()).toBe(true);
      const lines = component.findAll('[data-testid="stock-buy-line"]');
      expect(lines).toHaveLength(1);
      expect(lines[0].text()).toMatch(/Buy 2×/);
      expect(lines[0].text()).toContain('Ply');
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
      // No Material column → both rows collapse into one Uncategorized panel.
      expect(matrices).toHaveLength(1);
      expect(matrices[0]).toMatchObject({
        kind: 'sheet',
        material: 'Uncategorized',
        sizes: [
          { width: 1220, length: 2440, thickness: [18] },
          { width: 140, length: 3000, thickness: [19] },
        ],
      });
    });

    it('renders a skipped-row summary when some rows are invalid', async () => {
      stocks.value = [];
      const component = getComponent();
      const tsv = [
        'Name\tWidth\tHeight\tThickness',
        'Good\t1220mm\t2440mm\t18mm',
        'Bad\tx\t2440mm\t18mm', // unparseable width
      ].join('\n');

      await component.find('[data-testid="stock-import-csv"]').trigger('click');
      await component.find('textarea').setValue(tsv);
      await component
        .find('[data-testid="stock-import-rows"]')
        .trigger('click');
      await flush(component);

      const summary = component.find('[data-testid="stock-import-summary"]');
      expect(summary.exists()).toBe(true);
      expect(summary.text()).toMatch(/Imported 1 offcut row/);
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
      // One Uncategorized panel holding both dropped rows as sizes.
      expect(addCalls[0]).toHaveLength(1);
      expect((addCalls[0][0] as { sizes: unknown[] }).sizes).toHaveLength(2);
    });

    it('consolidates duplicate-material offcut panels into one via the toolbar', async () => {
      stocks.value = [
        {
          kind: 'sheet',
          material: 'Ply',
          role: 'offcut',
          sizes: [{ width: 1220, length: 2440, thickness: [18], quantity: 1 }],
        },
        {
          kind: 'sheet',
          material: 'Ply',
          role: 'offcut',
          sizes: [{ width: 600, length: 600, thickness: [18], quantity: 2 }],
        },
      ];
      const component = getComponent();

      const btn = component.find('[data-testid="stock-consolidate"]');
      expect(btn.exists()).toBe(true);
      await btn.trigger('click');
      await flush(component);

      expect(stocks.value).toHaveLength(1);
      expect(stocks.value[0].material).toBe('Ply');
      expect((stocks.value[0] as { sizes: unknown[] }).sizes).toEqual([
        { width: 1220, length: 2440, thickness: [18], quantity: 1 },
        { width: 600, length: 600, thickness: [18], quantity: 2 },
      ]);
    });

    it('hides the consolidate button when no materials share a panel', () => {
      stocks.value = [
        { kind: 'sheet', material: 'Ply', role: 'offcut', sizes: [] },
        { kind: 'sheet', material: 'MDF', role: 'offcut', sizes: [] },
      ];
      const component = getComponent();
      expect(component.find('[data-testid="stock-consolidate"]').exists()).toBe(
        false,
      );
    });
  });
});
