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

export function useStockMutations() {
  const { stocks } = useProjectSettings();

  /** Append one or more matrices in a single write, auto-suffixing name clashes. */
  function add(matrices: StockMatrix[]): void {
    const list = stocks.value.slice();
    for (const m of matrices) {
      list.push({ ...m, material: uniqueMaterialName(m.material, list) });
    }
    stocks.value = list;
  }

  function update(idx: number, matrix: StockMatrix): void {
    const list = stocks.value.slice();
    list[idx] = matrix;
    stocks.value = list;
  }

  function remove(idx: number): void {
    stocks.value = stocks.value.filter((_, i) => i !== idx);
  }

  return { add, update, remove };
}
