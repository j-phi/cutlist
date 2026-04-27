// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type {
  BoardLayout,
  BoardLayoutLeftover,
  BoardLayoutPlacement,
} from 'cutlist';

import LayoutList from '../LayoutList.vue';

mockNuxtImport('useGetPx', () => () => (m: number) => `${m * 100}px`);
mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) => (m == null ? '' : `${m}m`),
);
mockNuxtImport('useGrainLockConfirm', () => () => ({
  requestGrainLockChange: vi.fn(),
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
  };
}

function makeLeftover(
  partNumber: number,
  material: string,
  thicknessM: number,
  overrides: Partial<BoardLayoutLeftover> = {},
): BoardLayoutLeftover {
  return {
    partNumber,
    instanceNumber: 1,
    name: `Part ${partNumber}`,
    material,
    widthM: 0.2,
    lengthM: 0.4,
    thicknessM,
    ...overrides,
  };
}

describe('LayoutList', () => {
  function getComponent(
    layouts: BoardLayout[],
    leftovers: BoardLayoutLeftover[] = [],
  ) {
    return shallowMount(LayoutList, {
      props: { layouts, leftovers },
      global: {
        stubs: {
          LayoutListItem: true,
          LayoutLeftoverList: true,
          UIcon: true,
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

    it('Should bucket leftovers into the matching material+thickness group', () => {
      const layouts = [
        makeLayout({
          material: 'Plywood',
          thicknessM: 0.018,
          placements: [{}],
        }),
        makeLayout({
          material: 'Birch',
          thicknessM: 0.012,
          placements: [{}],
        }),
      ];
      const leftovers = [
        makeLeftover(101, 'Plywood', 0.018),
        makeLeftover(102, 'Plywood', 0.018),
        makeLeftover(103, 'Birch', 0.012),
      ];

      const component = getComponent(layouts, leftovers);

      // Each LayoutLeftoverList stub receives a `leftovers` prop. There should
      // be one inline list per group that has matching leftovers; no
      // "unmatched" column because every leftover matched a placed group.
      const lists = component.findAllComponents({ name: 'LayoutLeftoverList' });
      expect(lists).toHaveLength(2);

      // Find which list corresponds to which group by inspecting partNumbers.
      const buckets = lists.map((l) =>
        (l.props('leftovers') as { part: BoardLayoutLeftover; qty: number }[])
          .map((g) => g.part.partNumber)
          .sort((a, b) => a - b),
      );
      // Sorted groups: Birch 0.012 first, then Plywood 0.018.
      expect(buckets).toEqual([[103], [101, 102]]);
    });

    it('Should put leftovers without a matching board into the "No boards available" column', () => {
      const layouts = [
        makeLayout({
          material: 'Plywood',
          thicknessM: 0.018,
          placements: [{}],
        }),
      ];
      const leftovers = [
        // matched
        makeLeftover(1, 'Plywood', 0.018),
        // unmatched (no board exists for this material+thickness)
        makeLeftover(2, 'Walnut', 0.025),
        makeLeftover(3, 'Walnut', 0.025),
      ];

      const component = getComponent(layouts, leftovers);
      const lists = component.findAllComponents({ name: 'LayoutLeftoverList' });

      // First list is the inline list under Plywood; second is the unmatched
      // column.
      expect(lists).toHaveLength(2);
      const first = lists[0].props('leftovers') as {
        part: BoardLayoutLeftover;
        qty: number;
      }[];
      const second = lists[1].props('leftovers') as {
        part: BoardLayoutLeftover;
        qty: number;
      }[];

      expect(first.map((g) => g.part.partNumber)).toEqual([1]);
      expect(second.map((g) => g.part.partNumber).sort()).toEqual([2, 3]);

      // Unmatched column header must be visible.
      expect(component.text()).toContain('No boards available');
    });

    it('Should render only the unmatched column when there are no boards', () => {
      const leftovers = [makeLeftover(1, 'Walnut', 0.025)];
      const component = getComponent([], leftovers);

      const lists = component.findAllComponents({ name: 'LayoutLeftoverList' });
      expect(lists).toHaveLength(1);
      expect(component.text()).toContain('No boards available');
    });
  });
});
