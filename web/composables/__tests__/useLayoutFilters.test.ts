// @vitest-environment nuxt
import { ref, nextTick } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Micrometres, SheetBoardLayout } from 'cutlist';

// --- dependency stubs ---

const layoutsData = ref<{ layouts: SheetBoardLayout[] } | null>(null);
mockNuxtImport('useBoardLayoutsQuery', () => () => ({ data: layoutsData }));

const activeId = ref<string | null>('p1');
mockNuxtImport('useProjects', () => () => ({ activeId }));

const stocks = ref<never[]>([]);
const margin = ref<Micrometres | undefined>(undefined);
mockNuxtImport('useProjectSettings', () => () => ({ stocks, margin }));

mockNuxtImport('useFormatDistance', () => () => (um: number) => `${um}um`);

import useLayoutFilters, { LAYOUT_OFFCUTS_KEY } from '../useLayoutFilters';

// --- helpers ---

function um(n: number): Micrometres {
  return n as Micrometres;
}

function makeLayout(
  name: string,
  material: string,
  thicknessUm: number,
  widthUm = 1200000,
  lengthUm = 2400000,
  role: 'general' | 'offcut' = 'general',
): SheetBoardLayout {
  return {
    kind: 'sheet',
    stock: {
      name,
      material,
      thicknessUm: um(thicknessUm),
      widthUm: um(widthUm),
      lengthUm: um(lengthUm),
      color: '#888',
      role,
    },
    placements: [],
    marginUm: um(0),
    algorithm: 'tidy',
  };
}

beforeEach(() => {
  const f = useLayoutFilters();
  f.appliedKeys.value = new Set();
  f.pendingKeys.value = new Set();
  f.stockDropdownOpen.value = false;
  f.showUnused.value = false;
  layoutsData.value = null;
  stocks.value = [];
  margin.value = undefined;
  activeId.value = 'p1';
  window.localStorage.clear();
});

describe('filteredSheetLayouts', () => {
  it('returns all layouts when no filter is applied', () => {
    const maple = makeLayout('Maple', 'Maple', 18000);
    const oak = makeLayout('Oak', 'Oak', 18000);
    layoutsData.value = { layouts: [maple, oak] };

    const { filteredSheetLayouts } = useLayoutFilters();
    expect(filteredSheetLayouts.value).toHaveLength(2);
  });

  it('filters to only the selected stock key', async () => {
    const maple = makeLayout('Maple', 'Maple', 18000);
    const oak = makeLayout('Oak', 'Oak', 18000);
    layoutsData.value = { layouts: [maple, oak] };

    const { filteredSheetLayouts, appliedKeys } = useLayoutFilters();
    const mapleKey = 'Maple__18000__1200000__2400000';
    appliedKeys.value = new Set([mapleKey]);
    await nextTick();

    expect(filteredSheetLayouts.value).toHaveLength(1);
    expect(filteredSheetLayouts.value[0].stock.material).toBe('Maple');
  });

  it('includes offcut boards when LAYOUT_OFFCUTS_KEY is in filter', async () => {
    const general = makeLayout('Maple', 'Maple', 18000);
    const offcut = makeLayout(
      'Offcut',
      'Maple',
      18000,
      1000000,
      800000,
      'offcut',
    );
    layoutsData.value = { layouts: [general, offcut] };

    const { filteredSheetLayouts, appliedKeys } = useLayoutFilters();
    appliedKeys.value = new Set([LAYOUT_OFFCUTS_KEY]);
    await nextTick();

    expect(filteredSheetLayouts.value).toHaveLength(1);
    expect(filteredSheetLayouts.value[0].stock.role).toBe('offcut');
  });

  it('excludes offcut boards when filter is set to a general stock key only', async () => {
    const general = makeLayout('Maple', 'Maple', 18000);
    const offcut = makeLayout(
      'Offcut',
      'Maple',
      18000,
      1000000,
      800000,
      'offcut',
    );
    layoutsData.value = { layouts: [general, offcut] };

    const { filteredSheetLayouts, appliedKeys } = useLayoutFilters();
    const mapleKey = 'Maple__18000__1200000__2400000';
    appliedKeys.value = new Set([mapleKey]);
    await nextTick();

    expect(filteredSheetLayouts.value).toHaveLength(1);
    expect(filteredSheetLayouts.value[0].stock.role).toBe('general');
  });
});

describe('applyFilter / togglePending', () => {
  it('applyFilter transfers pendingKeys to appliedKeys and closes dropdown', async () => {
    const { applyFilter, togglePending, appliedKeys, stockDropdownOpen } =
      useLayoutFilters();
    layoutsData.value = { layouts: [makeLayout('Maple', 'Maple', 18000)] };
    stockDropdownOpen.value = true;
    const key = 'Maple__18000__1200000__2400000';
    togglePending(key);
    applyFilter();
    await nextTick();

    expect(appliedKeys.value.has(key)).toBe(true);
    expect(stockDropdownOpen.value).toBe(false);
  });

  it('togglePending removes a key that is already pending', () => {
    const { togglePending, pendingKeys } = useLayoutFilters();
    const key = 'some__key';
    togglePending(key);
    expect(pendingKeys.value.has(key)).toBe(true);
    togglePending(key);
    expect(pendingKeys.value.has(key)).toBe(false);
  });
});

describe('selectedLabel', () => {
  it('returns "All" when no filter applied', () => {
    const { selectedLabel } = useLayoutFilters();
    expect(selectedLabel.value).toBe('All');
  });

  it('returns stock name for a single selection', async () => {
    layoutsData.value = { layouts: [makeLayout('Maple Ply', 'Maple', 18000)] };
    const { selectedLabel, appliedKeys } = useLayoutFilters();
    appliedKeys.value = new Set(['Maple__18000__1200000__2400000']);
    await nextTick();
    expect(selectedLabel.value).toBe('Maple Ply');
  });

  it('returns count for multiple selections', async () => {
    const { selectedLabel, appliedKeys } = useLayoutFilters();
    appliedKeys.value = new Set(['a', 'b']);
    await nextTick();
    expect(selectedLabel.value).toBe('2 selected');
  });
});

describe('unusedOffcutLayouts', () => {
  it('returns empty array when showUnused is false', () => {
    const { unusedOffcutLayouts, showUnused } = useLayoutFilters();
    showUnused.value = false;
    expect(unusedOffcutLayouts.value).toHaveLength(0);
  });

  it('returns empty array when showUnused is true but no offcut stock exists', async () => {
    stocks.value = [];
    const { unusedOffcutLayouts, showUnused } = useLayoutFilters();
    showUnused.value = true;
    await nextTick();
    expect(unusedOffcutLayouts.value).toHaveLength(0);
  });
});
