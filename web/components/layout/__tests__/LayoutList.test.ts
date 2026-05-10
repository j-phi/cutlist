// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  Algorithm,
  SheetBoardLayout,
  SheetBoardLayoutPlacement,
} from 'cutlist';

import LayoutList from '../LayoutList.vue';

mockNuxtImport('useGetPx', () => () => (m: number) => `${m * 100}px`);
mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) => (m == null ? '' : `${m}m`),
);

const stockYaml = ref<string | undefined>(`- material: Plywood
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
`);
const defaultAlgorithm = ref<Algorithm | undefined>('auto');

mockNuxtImport('useProjectSettings', () => () => ({
  stock: stockYaml,
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
  thicknessM: number;
  placements?: Partial<SheetBoardLayoutPlacement>[];
  widthM?: number;
  lengthM?: number;
}

function makeLayout(args: LayoutFactoryArgs): SheetBoardLayout {
  const widthM = args.widthM ?? 1.0;
  const lengthM = args.lengthM ?? 2.0;
  const placements: SheetBoardLayoutPlacement[] = (args.placements ?? []).map(
    (p, i) => ({
      partNumber: i + 1,
      instanceNumber: 1,
      name: `Part ${i + 1}`,
      material: args.material,
      widthM: 0.3,
      lengthM: 0.6,
      thicknessM: args.thicknessM,
      leftM: 0,
      rightM: 0.3,
      topM: 0.6,
      bottomM: 0,
      ...p,
    }),
  );
  return {
    kind: 'sheet',
    stock: {
      material: args.material,
      widthM,
      lengthM,
      thicknessM: args.thicknessM,
    },
    placements,
    marginM: 0,
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
    setOverride: (mat: string, thicknessM: number, alg: string) => void;
    preferenceFor: (mat: string, thicknessM: number) => string;
  };
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
          thicknessM: 0.018,
          placements: small,
        }),
        makeLayout({ material: 'Birch', thicknessM: 0.025, placements: big }),
        makeLayout({ material: 'Birch', thicknessM: 0.012, placements: small }),
        makeLayout({ material: 'Plywood', thicknessM: 0.018, placements: big }),
      ];

      const component = getComponent(layouts);
      const items = component.findAllComponents({ name: 'LayoutListItem' });

      expect(items.map((i) => i.props('boardIndex'))).toEqual([0, 1, 2, 3]);
      expect(
        items.map((i) => {
          const l = i.props('layout') as SheetBoardLayout;
          return `${l.stock.material}__${l.stock.thicknessM}`;
        }),
      ).toEqual([
        'Birch__0.012',
        'Birch__0.025',
        'Plywood__0.018',
        'Plywood__0.018',
      ]);
    });

    it('Should chunk groups of more than 10 boards into multiple rows', () => {
      const layouts = Array.from({ length: 23 }, () =>
        makeLayout({
          material: 'Plywood',
          thicknessM: 0.018,
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
          ...makeLayout({ material: 'Plywood', thicknessM: 0.018 }),
          algorithm: 'tidy',
        },
      ];
      expect(getComponent(layouts).text()).toContain('Tidy');
    });

    it('setOverride writes the chosen algorithm to YAML, leaving other thicknesses untouched, and drops the entry on Auto', () => {
      stockYaml.value = `- material: Plywood
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18, 12]
`;
      const layouts: SheetBoardLayout[] = [
        makeLayout({ material: 'Plywood', thicknessM: 0.018 }),
      ];
      const component = getComponent(layouts);
      const vm = getVm(component);

      // Pin 18mm to tidy. 12mm untouched.
      vm.setOverride('Plywood', 0.018, 'tidy');
      expect(stockYaml.value).toMatch(/thicknessAlgorithms/);
      expect(stockYaml.value).toMatch(/'18': tidy/);
      expect(stockYaml.value).not.toMatch(/'12': /);

      // Pin 12mm separately — both must persist.
      vm.setOverride('Plywood', 0.012, 'compact');
      expect(stockYaml.value).toMatch(/'18': tidy/);
      expect(stockYaml.value).toMatch(/'12': compact/);

      // Picking Auto for 18mm drops the entry (default also auto).
      vm.setOverride('Plywood', 0.018, 'auto');
      expect(stockYaml.value).not.toMatch(/'18': tidy/);
      expect(stockYaml.value).toMatch(/'12': compact/);
    });

    it('Should pin explicit "auto" when the project default is something else (Matt\'s "can\'t select auto" bug)', () => {
      defaultAlgorithm.value = 'tidy';
      stockYaml.value = `- material: Plywood
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
`;
      const component = getComponent([
        makeLayout({ material: 'Plywood', thicknessM: 0.018 }),
      ]);
      const vm = getVm(component);

      vm.setOverride('Plywood', 0.018, 'auto');
      expect(vm.preferenceFor('Plywood', 0.018)).toBe('auto');
      expect(stockYaml.value).toMatch(/'18': auto/);

      defaultAlgorithm.value = 'auto';
    });

    it('Should write to and read from every row that matches (material, thickness)', () => {
      stockYaml.value = `- material: Plywood
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
- material: Plywood
  unit: mm
  sizes:
    - width: 600
      length: 1200
      thickness: [18]
`;
      const component = getComponent([
        makeLayout({ material: 'Plywood', thicknessM: 0.018 }),
      ]);
      const vm = getVm(component);

      vm.setOverride('Plywood', 0.018, 'tidy');
      expect(stockYaml.value?.match(/'18': tidy/g)?.length).toBe(2);
      expect(vm.preferenceFor('Plywood', 0.018)).toBe('tidy');
    });
  });
});
