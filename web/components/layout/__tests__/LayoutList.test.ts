// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { ref } from 'vue';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { Algorithm, BoardLayout, BoardLayoutPlacement } from 'cutlist';

import LayoutList from '../LayoutList.vue';

mockNuxtImport('useGetPx', () => () => (m: number) => `${m * 100}px`);
mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) => (m == null ? '' : `${m}m`),
);

// Mutable project settings observed by the component under test.
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
  placements?: Partial<BoardLayoutPlacement>[];
  widthM?: number;
  lengthM?: number;
}

function makeLayout(args: LayoutFactoryArgs): BoardLayout {
  const widthM = args.widthM ?? 1.0;
  const lengthM = args.lengthM ?? 2.0;
  const placements: BoardLayoutPlacement[] = (args.placements ?? []).map(
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

describe('LayoutList', () => {
  function getComponent(layouts: BoardLayout[]) {
    return shallowMount(LayoutList, {
      props: { layouts },
      global: {
        stubs: {
          LayoutListItem: true,
          UIcon: true,
          // Render UButton's slot text so trigger-label assertions work.
          UButton: { template: '<button><slot /></button>' },
          UDropdownMenu: { template: '<div><slot /></div>' },
        },
      },
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('groups computed', () => {
    it('Should sort by material → thickness → fuller boards first', () => {
      const placementsBig = [{}, {}, {}]; // 3 parts
      const placementsSmall = [{}]; // 1 part

      // Out-of-order on every dimension to prove the sort.
      const layouts: BoardLayout[] = [
        makeLayout({
          material: 'Plywood',
          thicknessM: 0.018,
          placements: placementsSmall,
        }),
        makeLayout({
          material: 'Birch',
          thicknessM: 0.025,
          placements: placementsBig,
        }),
        makeLayout({
          material: 'Birch',
          thicknessM: 0.012,
          placements: placementsSmall,
        }),
        makeLayout({
          material: 'Plywood',
          thicknessM: 0.018,
          placements: placementsBig,
        }),
      ];

      const component = getComponent(layouts);
      const items = component.findAllComponents({ name: 'LayoutListItem' });

      // Expected sort order:
      //   Birch 0.012 (the only one)        → original index 2
      //   Birch 0.025 (the only one)        → original index 1
      //   Plywood 0.018 fuller (3 parts)    → original index 3
      //   Plywood 0.018 smaller (1 part)    → original index 0
      const boardIndices = items.map((i) => i.props('boardIndex'));
      expect(boardIndices).toEqual([0, 1, 2, 3]);

      // And boards should be grouped by material+thickness.
      const groupKeys = items.map((i) => {
        const l = i.props('layout') as BoardLayout;
        return `${l.stock.material}__${l.stock.thicknessM}`;
      });
      expect(groupKeys).toEqual([
        'Birch__0.012',
        'Birch__0.025',
        'Plywood__0.018',
        'Plywood__0.018',
      ]);
    });

    it('Trigger button shows the algorithm that actually ran', () => {
      const layouts: BoardLayout[] = [
        {
          ...makeLayout({ material: 'Plywood', thicknessM: 0.018 }),
          algorithm: 'tidy',
        },
      ];
      const component = getComponent(layouts);
      // The trigger button always shows the actual algorithm — even when
      // the preference is `auto` (which is what's running here, since
      // stockYaml has no override).
      expect(component.text()).toContain('Tidy');
    });

    it('setOverride writes per (material, thickness) back to stock YAML', async () => {
      stockYaml.value = `- material: Plywood
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18, 12]
`;
      const layouts: BoardLayout[] = [
        makeLayout({ material: 'Plywood', thicknessM: 0.018 }),
      ];
      const component = getComponent(layouts);

      const inner = component.findComponent(LayoutList);
      const vm = inner.vm as unknown as {
        setOverride: (mat: string, thicknessM: number, alg: string) => void;
      };

      // Pin Plywood 18mm to tidy. 12mm should NOT be affected.
      vm.setOverride('Plywood', 0.018, 'tidy');

      expect(stockYaml.value).toMatch(/thicknessAlgorithms/);
      expect(stockYaml.value).toMatch(/'18': tidy/);
      expect(stockYaml.value).not.toMatch(/'12': /);
      expect(stockYaml.value).toMatch(/material: Plywood/);

      // Picking "Auto" again drops the entry — auto matches the inherited
      // default (no material-level override set).
      vm.setOverride('Plywood', 0.018, 'auto');
      expect(stockYaml.value).not.toMatch(/thicknessAlgorithms/);
    });

    it('setOverride preserves other thicknesses', async () => {
      stockYaml.value = `- material: Plywood
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18, 12]
`;
      const layouts: BoardLayout[] = [
        makeLayout({ material: 'Plywood', thicknessM: 0.018 }),
      ];
      const component = getComponent(layouts);

      const inner = component.findComponent(LayoutList);
      const vm = inner.vm as unknown as {
        setOverride: (mat: string, thicknessM: number, alg: string) => void;
      };

      vm.setOverride('Plywood', 0.018, 'tidy');
      vm.setOverride('Plywood', 0.012, 'compact');

      expect(stockYaml.value).toMatch(/'18': tidy/);
      expect(stockYaml.value).toMatch(/'12': compact/);
    });

    it('Picking Auto pins explicit "auto" when project default is something else', () => {
      // Project default = 'tidy'. User picks Auto on a thickness. We must
      // STORE the override — otherwise the picker would resolve back to
      // 'tidy' (the project default), the bug Matt hit ("can't select auto").
      defaultAlgorithm.value = 'tidy';
      stockYaml.value = `- material: Plywood
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
`;
      const layouts: BoardLayout[] = [
        makeLayout({ material: 'Plywood', thicknessM: 0.018 }),
      ];
      const component = getComponent(layouts);
      const inner = component.findComponent(LayoutList);
      const vm = inner.vm as unknown as {
        setOverride: (mat: string, thicknessM: number, alg: string) => void;
        preferenceFor: (mat: string, thicknessM: number) => string;
      };

      vm.setOverride('Plywood', 0.018, 'auto');
      expect(vm.preferenceFor('Plywood', 0.018)).toBe('auto');
      expect(stockYaml.value).toMatch(/'18': auto/);

      defaultAlgorithm.value = 'auto'; // reset for other tests
    });

    it('setOverride writes to every row that matches (material, thickness)', () => {
      // Same material+thickness split across two rows (different sheet sizes).
      // Engine groups them together; picker must too, or a write to row 1
      // alone leaves row 2 disagreeing at the engine level.
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
      const layouts: BoardLayout[] = [
        makeLayout({ material: 'Plywood', thicknessM: 0.018 }),
      ];
      const component = getComponent(layouts);
      const inner = component.findComponent(LayoutList);
      const vm = inner.vm as unknown as {
        setOverride: (mat: string, thicknessM: number, alg: string) => void;
        preferenceFor: (mat: string, thicknessM: number) => string;
      };

      vm.setOverride('Plywood', 0.018, 'tidy');
      // Both rows must carry the override.
      const matches = stockYaml.value?.match(/'18': tidy/g);
      expect(matches?.length).toBe(2);
      expect(vm.preferenceFor('Plywood', 0.018)).toBe('tidy');
    });

    it('preferenceFor finds an override on any matching row', () => {
      // Override sits on the second row only; first row has none.
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
  thicknessAlgorithms:
    '18': tidy
`;
      const layouts: BoardLayout[] = [
        makeLayout({ material: 'Plywood', thicknessM: 0.018 }),
      ];
      const component = getComponent(layouts);
      const inner = component.findComponent(LayoutList);
      const vm = inner.vm as unknown as {
        preferenceFor: (mat: string, thicknessM: number) => string;
      };

      expect(vm.preferenceFor('Plywood', 0.018)).toBe('tidy');
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

      // 23 layouts → ceil(23/10) = 3 rows. Find them via class+style markers.
      // Rows are direct children of the group container; count by selecting
      // every <div class="flex"> wrapping LayoutListItem stubs.
      const rows = component.findAll('.shrink-0 > .flex');
      // First .shrink-0 child is the header div (`flex items-baseline`),
      // remaining `.flex` children are the chunked rows. Filter just the rows.
      const layoutRows = rows.filter(
        (r) => r.findAllComponents({ name: 'LayoutListItem' }).length > 0,
      );
      expect(layoutRows).toHaveLength(3);
    });
  });
});
