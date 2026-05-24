// @vitest-environment nuxt
import { ref, nextTick } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { beforeEach, describe, expect, it } from 'vitest';
import type { Micrometres, SheetBoardLayout, LinearBoardLayout } from 'cutlist';

// --- dependency stubs ---

const layoutsData = ref<{
  layouts: SheetBoardLayout[];
  linearLayouts?: LinearBoardLayout[];
} | null>(null);
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

function makeLinearLayout(
  name: string,
  material: string,
  crossSectionWidthUm = 88900,
  crossSectionThicknessUm = 38100,
  lengthUm = 2400000,
): LinearBoardLayout {
  return {
    kind: 'linear',
    stock: {
      name,
      material,
      crossSectionWidthUm: um(crossSectionWidthUm),
      crossSectionThicknessUm: um(crossSectionThicknessUm),
      lengthUm: um(lengthUm),
      role: 'general',
    },
    placements: [],
    wasteEndUm: um(0),
  };
}

function setLayouts(
  layouts: SheetBoardLayout[],
  linearLayouts: LinearBoardLayout[] = [],
) {
  layoutsData.value = { layouts, linearLayouts };
}

beforeEach(() => {
  const f = useLayoutFilters();
  f.appliedKeys.value = new Set();
  f.pendingKeys.value = new Set();
  f.allUsedPending.value = true;
  f.pendingUnused.value = false;
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
  it('applyFilter with allUsedPending true sets appliedKeys to empty (show all)', async () => {
    const { applyFilter, allUsedPending, appliedKeys, stockDropdownOpen } =
      useLayoutFilters();
    stockDropdownOpen.value = true;
    allUsedPending.value = true;
    applyFilter();
    await nextTick();

    expect(appliedKeys.value.size).toBe(0);
    expect(stockDropdownOpen.value).toBe(false);
  });

  it('applyFilter with allUsedPending false uses pendingKeys', async () => {
    const { applyFilter, allUsedPending, pendingKeys, appliedKeys } =
      useLayoutFilters();
    const key = 'Maple__18000__1200000__2400000';
    allUsedPending.value = false;
    pendingKeys.value = new Set([key]);
    applyFilter();
    await nextTick();

    expect(appliedKeys.value.has(key)).toBe(true);
  });

  it('applyFilter also applies pendingUnused to showUnused', async () => {
    const { applyFilter, pendingUnused, showUnused } = useLayoutFilters();
    pendingUnused.value = true;
    applyFilter();
    await nextTick();
    expect(showUnused.value).toBe(true);
  });

  it('toggleAllUsed unchecks All Used and clears individual selections', () => {
    const { toggleAllUsed, allUsedPending, pendingKeys } = useLayoutFilters();
    expect(allUsedPending.value).toBe(true);
    toggleAllUsed();
    expect(allUsedPending.value).toBe(false);
    expect(pendingKeys.value.size).toBe(0);
  });

  it('toggleAllUsed re-checks All Used when it was off', () => {
    const { toggleAllUsed, allUsedPending } = useLayoutFilters();
    allUsedPending.value = false;
    toggleAllUsed();
    expect(allUsedPending.value).toBe(true);
  });

  it('togglePending from All Used unchecks a key and switches to explicit mode', async () => {
    const maple = makeLayout('Maple', 'Maple', 18000);
    const oak = makeLayout('Oak', 'Oak', 18000);
    layoutsData.value = { layouts: [maple, oak] };
    const mapleKey = 'Maple__18000__1200000__2400000';
    const oakKey = 'Oak__18000__1200000__2400000';
    const { togglePending, allUsedPending, pendingKeys } = useLayoutFilters();
    await nextTick();

    expect(allUsedPending.value).toBe(true);
    togglePending(mapleKey);
    expect(allUsedPending.value).toBe(false);
    expect(pendingKeys.value.has(mapleKey)).toBe(false);
    expect(pendingKeys.value.has(oakKey)).toBe(true);
  });

  it('togglePending collapses back to All Used when all options are checked', async () => {
    const maple = makeLayout('Maple', 'Maple', 18000);
    const oak = makeLayout('Oak', 'Oak', 18000);
    layoutsData.value = { layouts: [maple, oak] };
    const mapleKey = 'Maple__18000__1200000__2400000';
    const { togglePending, allUsedPending, pendingKeys } = useLayoutFilters();
    await nextTick();

    // Uncheck Maple → explicit mode with just Oak
    togglePending(mapleKey);
    expect(allUsedPending.value).toBe(false);

    // Re-check Maple → all checked → collapse to All Used
    togglePending(mapleKey);
    expect(allUsedPending.value).toBe(true);
    expect(pendingKeys.value.size).toBe(0);
  });

  it('togglePending removes an explicitly checked key', async () => {
    const maple = makeLayout('Maple', 'Maple', 18000);
    const oak = makeLayout('Oak', 'Oak', 18000);
    layoutsData.value = { layouts: [maple, oak] };
    const mapleKey = 'Maple__18000__1200000__2400000';
    const oakKey = 'Oak__18000__1200000__2400000';
    const { togglePending, allUsedPending, pendingKeys } = useLayoutFilters();
    allUsedPending.value = false;
    pendingKeys.value = new Set([mapleKey, oakKey]);
    await nextTick();

    togglePending(mapleKey);
    expect(pendingKeys.value.has(mapleKey)).toBe(false);
    expect(pendingKeys.value.has(oakKey)).toBe(true);
  });
});

describe('selectedLabel', () => {
  it('returns "All Used" when no filter applied', () => {
    const { selectedLabel } = useLayoutFilters();
    expect(selectedLabel.value).toBe('All Used');
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

describe('filteredLinearLayouts', () => {
  it('returns all linear layouts when no filter is applied', () => {
    const pine = makeLinearLayout('Pine 2x4', 'Pine', 88900, 38100);
    setLayouts([], [pine]);
    const { filteredLinearLayouts } = useLayoutFilters();
    expect(filteredLinearLayouts.value).toHaveLength(1);
  });

  it('filters linear layouts by key when a filter is applied', async () => {
    const pine = makeLinearLayout('Pine 2x4', 'Pine', 88900, 38100);
    const oak = makeLinearLayout('Oak 1x4', 'Oak', 88900, 19050);
    setLayouts([], [pine, oak]);
    const { filteredLinearLayouts, appliedKeys } = useLayoutFilters();
    const pineKey = 'linear__Pine__88900__38100';
    appliedKeys.value = new Set([pineKey]);
    await nextTick();
    expect(filteredLinearLayouts.value).toHaveLength(1);
    expect(filteredLinearLayouts.value[0].stock.material).toBe('Pine');
  });
});

describe('stockOptions includes linear stock', () => {
  it('adds linear stock options after sheet options', async () => {
    const sheet = makeLayout('Plywood', 'Plywood', 18000);
    const pine = makeLinearLayout('Pine 2x4', 'Pine', 88900, 38100);
    setLayouts([sheet], [pine]);
    const { stockOptions } = useLayoutFilters();
    await nextTick();
    const values = stockOptions.value.map((o) => o.value);
    expect(values).toContain('linear__Pine__88900__38100');
    // Sheet option comes before linear option
    const sheetIdx = values.findIndex((v) => v.startsWith('Plywood'));
    const linearIdx = values.findIndex((v) => v.startsWith('linear__'));
    expect(sheetIdx).toBeLessThan(linearIdx);
  });

  it('deduplicates linear options by material and cross-section', async () => {
    const pine1 = makeLinearLayout('Pine 2x4', 'Pine', 88900, 38100, 2400000);
    const pine2 = makeLinearLayout('Pine 2x4', 'Pine', 88900, 38100, 3000000);
    setLayouts([], [pine1, pine2]);
    const { stockOptions } = useLayoutFilters();
    await nextTick();
    const linearOpts = stockOptions.value.filter((o) => o.role === 'linear');
    expect(linearOpts).toHaveLength(1);
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
