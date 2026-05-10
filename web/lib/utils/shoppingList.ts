import type { LinearBoardLayout } from '../types';

export interface LinearShoppingListLength {
  /** Stick length in meters. */
  lengthM: number;
  /** Number of sticks of this length needed for the material. */
  count: number;
}

export interface LinearShoppingListGroup {
  material: string;
  totalSticks: number;
  /** Per-length breakdown, sorted ascending by length. */
  lengths: LinearShoppingListLength[];
  /** All sticks for this material, ordered by ascending stick length. */
  layouts: LinearBoardLayout[];
}

/**
 * Aggregate linear stick layouts into a shopping list grouped by material.
 *
 * Each group lists how many sticks of each length are needed (e.g. for the
 * stick view header and the PDF export). Sort order is stable: groups by
 * material name, lengths within a group by length ascending.
 */
export function aggregateLinearShoppingList(
  layouts: LinearBoardLayout[],
): LinearShoppingListGroup[] {
  const byMaterial = new Map<
    string,
    {
      material: string;
      counts: Map<number, number>;
      layouts: LinearBoardLayout[];
    }
  >();

  for (const layout of layouts) {
    const mat = layout.stock.material;
    let entry = byMaterial.get(mat);
    if (!entry) {
      entry = { material: mat, counts: new Map(), layouts: [] };
      byMaterial.set(mat, entry);
    }
    const len = layout.stock.lengthM;
    entry.counts.set(len, (entry.counts.get(len) ?? 0) + 1);
    entry.layouts.push(layout);
  }

  const groups: LinearShoppingListGroup[] = [];
  for (const entry of byMaterial.values()) {
    const lengths = [...entry.counts.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([lengthM, count]) => ({ lengthM, count }));
    const sortedLayouts = [...entry.layouts].sort(
      (a, b) => a.stock.lengthM - b.stock.lengthM,
    );
    groups.push({
      material: entry.material,
      totalSticks: entry.layouts.length,
      lengths,
      layouts: sortedLayouts,
    });
  }

  groups.sort((a, b) => a.material.localeCompare(b.material));
  return groups;
}
