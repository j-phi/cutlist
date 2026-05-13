import type { StockMatrix } from 'cutlist';

const normalize = (s: string) => s.trim().toLowerCase();

/** Auto-suffix collisions so the packer's name-keyed lookups stay unambiguous. */
export function uniqueMaterialName(
  name: string,
  existing: StockMatrix[],
): string {
  const trimmed = name.trim();
  const taken = new Set(existing.map((e) => normalize(e.material)));
  if (!taken.has(normalize(trimmed))) return trimmed;
  let n = 2;
  while (taken.has(normalize(`${trimmed} (${n})`))) n++;
  return `${trimmed} (${n})`;
}

// `colorMap` references stock by material *name*, so renaming or removing a
// stock cascades into colorMap. The shared debounce in useProjectSettings
// collapses the two writes into one IDB patch.
export function useStockMutations() {
  const { activeProject } = useProjects();
  const { stocks, queuePatch } = useProjectSettings();

  function add(matrices: StockMatrix[]): void {
    const list = stocks.value.slice();
    for (const m of matrices) {
      list.push({ ...m, material: uniqueMaterialName(m.material, list) });
    }
    stocks.value = list;
  }

  function update(idx: number, matrix: StockMatrix): void {
    const old = stocks.value[idx];
    stocks.value = stocks.value.map((s, i) => (i === idx ? matrix : s));
    if (old && old.material !== matrix.material && activeProject.value) {
      const entries = Object.entries(activeProject.value.colorMap).map(
        ([k, v]) => [k, v === old.material ? matrix.material : v] as const,
      );
      queuePatch({ colorMap: Object.fromEntries(entries) });
    }
  }

  function remove(idx: number): void {
    const old = stocks.value[idx];
    stocks.value = stocks.value.filter((_, i) => i !== idx);
    if (old && activeProject.value) {
      const entries = Object.entries(activeProject.value.colorMap).filter(
        ([, v]) => v !== old.material,
      );
      queuePatch({ colorMap: Object.fromEntries(entries) });
    }
  }

  return { add, update, remove };
}
