import type { SheetBoardLayout, LinearBoardLayout } from 'cutlist';
import { reduceStockMatrix, isSheetStock } from 'cutlist';
import {
  STORAGE_KEYS,
  getLocalStorageJson,
  setLocalStorageJson,
} from '~/utils/localStorage';

export const LAYOUT_OFFCUTS_KEY = '__offcuts__';

/**
 * Global singleton that holds Layout-tab display filters — stock type selector
 * and the "show unused offcuts" toggle — so both the on-screen preview and PDF
 * / label exports see the same filtered board set.
 */
export default createGlobalState(() => {
  const { data } = useBoardLayoutsQuery();
  const { activeId } = useProjects();
  const { stocks, margin } = useProjectSettings();
  const formatDistance = useFormatDistance();

  const sheetLayouts = computed<SheetBoardLayout[]>(
    () => data.value?.layouts ?? [],
  );

  const linearLayouts = computed<LinearBoardLayout[]>(
    () => data.value?.linearLayouts ?? [],
  );

  // --- Stock type filter ---

  function stockKey(stock: {
    material: string;
    thicknessUm: number;
    widthUm: number;
    lengthUm: number;
  }): string {
    return `${stock.material}__${stock.thicknessUm}__${stock.widthUm}__${stock.lengthUm}`;
  }

  function linearStockKey(stock: {
    material: string;
    crossSectionWidthUm: number;
    crossSectionThicknessUm: number;
  }): string {
    return `linear__${stock.material}__${stock.crossSectionWidthUm}__${stock.crossSectionThicknessUm}`;
  }

  const stockOptions = computed(() => {
    const seen = new Set<string>();
    const options: {
      label: string;
      sublabel: string;
      value: string;
      role: string;
    }[] = [];
    let offcutCount = 0;

    for (const layout of sheetLayouts.value) {
      if (layout.stock.role === 'offcut') {
        offcutCount++;
        continue;
      }
      const key = stockKey(layout.stock);
      if (!seen.has(key)) {
        seen.add(key);
        const w = formatDistance(layout.stock.widthUm);
        const l = formatDistance(layout.stock.lengthUm);
        options.push({
          label: layout.stock.name,
          sublabel: `${w} × ${l}`,
          value: key,
          role: 'general',
        });
      }
    }

    for (const layout of linearLayouts.value) {
      const key = linearStockKey(layout.stock);
      if (!seen.has(key)) {
        seen.add(key);
        const w = formatDistance(layout.stock.crossSectionWidthUm);
        const t = formatDistance(layout.stock.crossSectionThicknessUm);
        options.push({
          label: layout.stock.name,
          sublabel: `${w} × ${t}`,
          value: key,
          role: 'linear',
        });
      }
    }

    if (offcutCount > 0) {
      options.push({
        label: 'Offcuts',
        sublabel: `${offcutCount} board${offcutCount !== 1 ? 's' : ''}`,
        value: LAYOUT_OFFCUTS_KEY,
        role: 'offcut',
      });
    }

    return options;
  });

  const appliedKeys = ref(new Set<string>());
  const pendingKeys = ref(new Set<string>());
  const allUsedPending = ref(true);
  const pendingUnused = ref(false);
  const stockDropdownOpen = ref(false);

  // Prune stale keys when the layout changes (e.g. on project switch).
  watch(stockOptions, (opts) => {
    const validKeys = new Set(opts.map((o) => o.value));
    if (appliedKeys.value.size > 0) {
      const next = new Set(
        [...appliedKeys.value].filter((k) => validKeys.has(k)),
      );
      if (next.size !== appliedKeys.value.size) appliedKeys.value = next;
    }
    if (pendingKeys.value.size > 0) {
      const next = new Set(
        [...pendingKeys.value].filter((k) => validKeys.has(k)),
      );
      if (next.size !== pendingKeys.value.size) pendingKeys.value = next;
    }
  });

  watch(stockDropdownOpen, (open) => {
    if (open) {
      pendingKeys.value = new Set(appliedKeys.value);
      allUsedPending.value = appliedKeys.value.size === 0;
      pendingUnused.value = showUnused.value;
    }
  });

  const selectedLabel = computed(() => {
    if (appliedKeys.value.size === 0) return 'All Used';
    if (appliedKeys.value.size === 1) {
      const key = [...appliedKeys.value][0];
      return stockOptions.value.find((o) => o.value === key)?.label ?? 'Stock';
    }
    return `${appliedKeys.value.size} selected`;
  });

  function toggleAllUsed(): void {
    allUsedPending.value = !allUsedPending.value;
    pendingKeys.value = new Set();
  }

  function togglePending(key: string): void {
    if (allUsedPending.value) {
      // "All Used" is active — uncheck this key, switch to explicit selection of all others
      allUsedPending.value = false;
      const allKeys = stockOptions.value.map((o) => o.value);
      pendingKeys.value = new Set(allKeys.filter((k) => k !== key));
    } else {
      const next = new Set(pendingKeys.value);
      if (next.has(key)) {
        next.delete(key);
      } else {
        next.add(key);
        // Collapse back to "All Used" when every option is now checked
        if (next.size === stockOptions.value.length) {
          allUsedPending.value = true;
          pendingKeys.value = new Set();
          return;
        }
      }
      pendingKeys.value = next;
    }
  }

  function applyFilter(): void {
    appliedKeys.value = allUsedPending.value
      ? new Set()
      : new Set(pendingKeys.value);
    showUnused.value = pendingUnused.value;
    stockDropdownOpen.value = false;
  }

  const filteredSheetLayouts = computed<SheetBoardLayout[]>(() => {
    if (appliedKeys.value.size === 0) return sheetLayouts.value;
    return sheetLayouts.value.filter((l) =>
      l.stock.role === 'offcut'
        ? appliedKeys.value.has(LAYOUT_OFFCUTS_KEY)
        : appliedKeys.value.has(stockKey(l.stock)),
    );
  });

  const filteredLinearLayouts = computed<LinearBoardLayout[]>(() => {
    if (appliedKeys.value.size === 0) return linearLayouts.value;
    return linearLayouts.value.filter((l) =>
      appliedKeys.value.has(linearStockKey(l.stock)),
    );
  });

  // --- Unused offcuts toggle ---

  function loadShowUnused(projectId: string): boolean {
    const stored = getLocalStorageJson<boolean>(
      STORAGE_KEYS.ui.projectLayoutShowUnused(projectId),
    );
    return typeof stored === 'boolean' ? stored : false;
  }

  const showUnused = ref(
    activeId.value ? loadShowUnused(activeId.value) : false,
  );

  watch(activeId, (id) => {
    if (id) showUnused.value = loadShowUnused(id);
  });

  watch(showUnused, (value) => {
    if (activeId.value) {
      setLocalStorageJson(
        STORAGE_KEYS.ui.projectLayoutShowUnused(activeId.value),
        value,
      );
    }
  });

  const unusedOffcutLayouts = computed<SheetBoardLayout[]>(() => {
    if (!showUnused.value) return [];
    const allStock = reduceStockMatrix(stocks.value).filter(isSheetStock);
    const offcutStock = allStock.filter((s) => s.role === 'offcut');
    const result: SheetBoardLayout[] = [];
    for (const stock of offcutStock) {
      const usedCount = sheetLayouts.value.filter(
        (l) =>
          l.stock.role === 'offcut' &&
          l.stock.material === stock.material &&
          l.stock.widthUm === stock.width &&
          l.stock.lengthUm === stock.length &&
          l.stock.thicknessUm === stock.thickness,
      ).length;
      const available = stock.quantity ?? 1;
      for (let i = usedCount; i < available; i++) {
        result.push({
          kind: 'sheet',
          stock: {
            name: stock.name ?? stock.material,
            material: stock.material,
            widthUm: stock.width,
            lengthUm: stock.length,
            thicknessUm: stock.thickness,
            color: stock.color,
            role: 'offcut',
          },
          placements: [],
          marginUm: (margin.value ?? 0) as import('cutlist').Micrometres,
          algorithm: 'tidy',
        });
      }
    }
    return result;
  });

  return {
    stockOptions,
    appliedKeys,
    pendingKeys,
    allUsedPending,
    pendingUnused,
    stockDropdownOpen,
    selectedLabel,
    toggleAllUsed,
    togglePending,
    applyFilter,
    filteredSheetLayouts,
    filteredLinearLayouts,
    showUnused,
    unusedOffcutLayouts,
  };
});
