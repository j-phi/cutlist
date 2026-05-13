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

/**
 * Stock list mutations with cross-reference cascade.
 *
 * `colorMap` references a stock by its material *name*, so renaming or
 * deleting a stock would silently orphan those references. `update` and
 * `remove` here patch `colorMap` alongside the stocks change; the
 * `queuePatch` debounce merges both writes into a single IDB update.
 */
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
    const list = stocks.value.slice();
    list[idx] = matrix;
    stocks.value = list;
    if (old && old.material !== matrix.material && activeProject.value) {
      queuePatch({
        colorMap: renameColorMap(
          activeProject.value.colorMap,
          old.material,
          matrix.material,
        ),
      });
    }
  }

  function remove(idx: number): void {
    const old = stocks.value[idx];
    stocks.value = stocks.value.filter((_, i) => i !== idx);
    if (old && activeProject.value) {
      queuePatch({
        colorMap: dropFromColorMap(activeProject.value.colorMap, old.material),
      });
    }
  }

  return { add, update, remove };
}

function renameColorMap(
  cm: Record<string, string>,
  oldName: string,
  newName: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(cm)) {
    next[k] = v === oldName ? newName : v;
  }
  return next;
}

function dropFromColorMap(
  cm: Record<string, string>,
  name: string,
): Record<string, string> {
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(cm)) {
    if (v !== name) next[k] = v;
  }
  return next;
}
