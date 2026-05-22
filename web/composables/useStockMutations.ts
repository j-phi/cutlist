import type { StockMatrix } from 'cutlist';

// `colorMap` references stock by material *category* (many items can share a
// category). Renaming or removing a stock cascades into colorMap only when the
// category it referenced no longer exists on any remaining entry — otherwise
// the category is still live and its color mapping must stay. The shared
// debounce in useProjectSettings collapses the writes into one IDB patch.
export function useStockMutations() {
  const { activeProject } = useProjects();
  const { stocks, queuePatch } = useProjectSettings();

  function add(matrices: StockMatrix[]): void {
    // Categories are meant to repeat and names are free-text advisory labels,
    // so nothing is deduped here — append as-is.
    stocks.value = [...stocks.value, ...matrices];
  }

  function categoryStillUsed(category: string, list: StockMatrix[]): boolean {
    return list.some((s) => s.material === category);
  }

  function update(idx: number, matrix: StockMatrix): void {
    const old = stocks.value[idx];
    stocks.value = stocks.value.map((s, i) => (i === idx ? matrix : s));
    if (
      old &&
      old.material !== matrix.material &&
      activeProject.value &&
      !categoryStillUsed(old.material, stocks.value)
    ) {
      const entries = Object.entries(activeProject.value.colorMap).map(
        ([k, v]) => [k, v === old.material ? matrix.material : v] as const,
      );
      queuePatch({ colorMap: Object.fromEntries(entries) });
    }
  }

  function remove(idx: number): void {
    const old = stocks.value[idx];
    stocks.value = stocks.value.filter((_, i) => i !== idx);
    if (
      old &&
      activeProject.value &&
      !categoryStillUsed(old.material, stocks.value)
    ) {
      const entries = Object.entries(activeProject.value.colorMap).filter(
        ([, v]) => v !== old.material,
      );
      queuePatch({ colorMap: Object.fromEntries(entries) });
    }
  }

  return { add, update, remove };
}
