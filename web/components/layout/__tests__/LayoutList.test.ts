// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { mmToUm, type Micrometres } from 'cutlist';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  Algorithm,
  SheetBoardLayout,
  SheetBoardLayoutPlacement,
  SheetStockMatrix,
  StockMatrix,
} from 'cutlist';

import LayoutList from '../LayoutList.vue';

mockNuxtImport('useGetPx', () => () => (m: number) => `${m * 100}px`);
mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) => (m == null ? '' : `${m}m`),
);

const stocks = ref<StockMatrix[]>([
  {
    kind: 'sheet',
    material: 'Plywood',
    sizes: [{ width: 1220, length: 2440, thickness: [18] }],
  },
]);
const defaultAlgorithm = ref<Algorithm | undefined>('auto');

mockNuxtImport('useProjectSettings', () => () => ({
  stocks,
  bladeWidth: ref(undefined),
  margin: ref(undefined),
  defaultAlgorithm,
  showPartNumbers: ref(undefined),
  distanceUnit: ref(undefined),
  precision: ref({ kind: 'decimal', step: 0.1 }),
  isLoading: ref(false),
}));

interface LayoutFactoryArgs {
  material: string;
  thicknessUm: Micrometres;
  placements?: Partial<SheetBoardLayoutPlacement>[];
  widthUm?: Micrometres;
  lengthUm?: Micrometres;
}

function makeLayout(args: LayoutFactoryArgs): SheetBoardLayout {
  const widthUm = args.widthUm ?? (1 as Micrometres);
  const lengthUm = args.lengthUm ?? (2 as Micrometres);
  const placements: SheetBoardLayoutPlacement[] = (args.placements ?? []).map(
    (p, i) => ({
      partNumber: i + 1,
      instanceNumber: 1,
      name: `Part ${i + 1}`,
      material: args.material,
      widthUm: 0.3 as Micrometres,
      lengthUm: 0.6 as Micrometres,
      thicknessUm: args.thicknessUm,
      leftUm: 0 as Micrometres,
      rightUm: 0.3 as Micrometres,
      topUm: 0.6 as Micrometres,
      bottomUm: 0 as Micrometres,
      allowanceWidthUm: 0 as Micrometres,
      allowanceLengthUm: 0 as Micrometres,
      ...p,
    }),
  );
  return {
    kind: 'sheet',
    stock: {
      material: args.material,
      widthUm,
      lengthUm,
      thicknessUm: args.thicknessUm,
    },
    placements,
    marginUm: 0 as Micrometres,
    algorithm: 'compact',
  };
}

function getComponent(layouts: SheetBoardLayout[]) {
  return shallowMount(LayoutList, {
    props: { layouts },
    global: {
      stubs: {
        LayoutListItem: true,
        UIcon: true,
        UButton: { template: '<button><slot /></button>' },
        UDropdownMenu: { template: '<div><slot /></div>' },
      },
    },
  });
}

function getVm(component: ReturnType<typeof getComponent>) {
  return component.findComponent(LayoutList).vm as unknown as {
    setOverride: (mat: string, thicknessUm: number, alg: string) => void;
    preferenceFor: (mat: string, thicknessUm: number) => string;
  };
}

/** Look up thicknessAlgorithms[key] across every sheet row matching `material`. */
function overrideFor(
  rows: StockMatrix[],
  material: string,
  key: string,
): Array<string | undefined> {
  return rows
    .filter((r): r is SheetStockMatrix => r.kind === 'sheet')
    .filter((r) => r.material === material)
    .map((r) => r.thicknessAlgorithms?.[key]);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LayoutList', () => {
  describe('Group sorting', () => {
    it('Should sort by material → thickness → fuller boards first', () => {
      const big = [{}, {}, {}];
      const small = [{}];
      const layouts: SheetBoardLayout[] = [
        makeLayout({
          material: 'Plywood',
          thicknessUm: mmToUm(18),
          placements: small,
        }),
        makeLayout({
          material: 'Birch',
          thicknessUm: mmToUm(25),
          placements: big,
        }),
        makeLayout({
          material: 'Birch',
          thicknessUm: mmToUm(12),
          placements: small,
        }),
        makeLayout({
          material: 'Plywood',
          thicknessUm: mmToUm(18),
          placements: big,
        }),
      ];

      const component = getComponent(layouts);
      const items = component.findAllComponents({ name: 'LayoutListItem' });

      expect(items.map((i) => i.props('boardIndex'))).toEqual([0, 1, 2, 3]);
      expect(
        items.map((i) => {
          const l = i.props('layout') as SheetBoardLayout;
          return `${l.stock.material}__${l.stock.thicknessUm}`;
        }),
      ).toEqual([
        `Birch__${mmToUm(12)}`,
        `Birch__${mmToUm(25)}`,
        `Plywood__${mmToUm(18)}`,
        `Plywood__${mmToUm(18)}`,
      ]);
    });

    it('Should chunk groups of more than 10 boards into multiple rows', () => {
      const layouts = Array.from({ length: 23 }, () =>
        makeLayout({
          material: 'Plywood',
          thicknessUm: mmToUm(18),
          placements: [{}],
        }),
      );

      const component = getComponent(layouts);
      const items = component.findAllComponents({ name: 'LayoutListItem' });
      expect(items).toHaveLength(23);

      // 23 layouts → ceil(23/10) = 3 rows.
      const layoutRows = component
        .findAll('.shrink-0 > .flex')
        .filter(
          (r) => r.findAllComponents({ name: 'LayoutListItem' }).length > 0,
        );
      expect(layoutRows).toHaveLength(3);
    });
  });

  describe('Algorithm picker', () => {
    it('Trigger button shows the algorithm that actually ran', () => {
      const layouts: SheetBoardLayout[] = [
        {
          ...makeLayout({ material: 'Plywood', thicknessUm: mmToUm(18) }),
          algorithm: 'tidy',
        },
      ];
      expect(getComponent(layouts).text()).toContain('Tidy');
    });

    it('setOverride pins one thickness, leaves others untouched, and drops the entry on Auto', () => {
      stocks.value = [
        {
          kind: 'sheet',
          material: 'Plywood',
          sizes: [{ width: 1220, length: 2440, thickness: [18, 12] }],
        },
      ];
      const layouts: SheetBoardLayout[] = [
        makeLayout({ material: 'Plywood', thicknessUm: mmToUm(18) }),
      ];
      const component = getComponent(layouts);
      const vm = getVm(component);

      vm.setOverride('Plywood', mmToUm(18), 'tidy');
      expect(overrideFor(stocks.value, 'Plywood', '18')).toEqual(['tidy']);
      expect(overrideFor(stocks.value, 'Plywood', '12')).toEqual([undefined]);

      vm.setOverride('Plywood', mmToUm(12), 'compact');
      expect(overrideFor(stocks.value, 'Plywood', '18')).toEqual(['tidy']);
      expect(overrideFor(stocks.value, 'Plywood', '12')).toEqual(['compact']);

      // Picking Auto for 18mm drops the entry (default also auto).
      vm.setOverride('Plywood', mmToUm(18), 'auto');
      expect(overrideFor(stocks.value, 'Plywood', '18')).toEqual([undefined]);
      expect(overrideFor(stocks.value, 'Plywood', '12')).toEqual(['compact']);
    });

    it('Should pin explicit "auto" when the project default is something else (Matt\'s "can\'t select auto" bug)', () => {
      defaultAlgorithm.value = 'tidy';
      stocks.value = [
        {
          kind: 'sheet',
          material: 'Plywood',
          sizes: [{ width: 1220, length: 2440, thickness: [18] }],
        },
      ];
      const component = getComponent([
        makeLayout({ material: 'Plywood', thicknessUm: mmToUm(18) }),
      ]);
      const vm = getVm(component);

      vm.setOverride('Plywood', mmToUm(18), 'auto');
      expect(vm.preferenceFor('Plywood', mmToUm(18))).toBe('auto');
      expect(overrideFor(stocks.value, 'Plywood', '18')).toEqual(['auto']);

      defaultAlgorithm.value = 'auto';
    });

    it('Should write to and read from every row that matches (material, thickness)', () => {
      stocks.value = [
        {
          kind: 'sheet',
          material: 'Plywood',
          sizes: [{ width: 1220, length: 2440, thickness: [18] }],
        },
        {
          kind: 'sheet',
          material: 'Plywood',
          sizes: [{ width: 600, length: 1200, thickness: [18] }],
        },
      ];
      const component = getComponent([
        makeLayout({ material: 'Plywood', thicknessUm: mmToUm(18) }),
      ]);
      const vm = getVm(component);

      vm.setOverride('Plywood', mmToUm(18), 'tidy');
      expect(overrideFor(stocks.value, 'Plywood', '18')).toEqual([
        'tidy',
        'tidy',
      ]);
      expect(vm.preferenceFor('Plywood', mmToUm(18))).toBe('tidy');
    });
  });
});
