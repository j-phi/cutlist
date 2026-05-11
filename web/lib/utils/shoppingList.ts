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
    { counts: Map<number, number>; layouts: LinearBoardLayout[] }
  >();

  for (const layout of layouts) {
    const material = layout.stock.material;
    let entry = byMaterial.get(material);
    if (!entry) {
      entry = { counts: new Map(), layouts: [] };
      byMaterial.set(material, entry);
    }
    const len = layout.stock.lengthM;
    entry.counts.set(len, (entry.counts.get(len) ?? 0) + 1);
    entry.layouts.push(layout);
  }

  const groups = [...byMaterial.entries()].map<LinearShoppingListGroup>(
    ([material, entry]) => ({
      material,
      totalSticks: entry.layouts.length,
      lengths: [...entry.counts.entries()]
        .sort(([a], [b]) => a - b)
        .map(([lengthM, count]) => ({ lengthM, count })),
      layouts: [...entry.layouts].sort(
        (a, b) => a.stock.lengthM - b.stock.lengthM,
      ),
    }),
  );

  groups.sort((a, b) => a.material.localeCompare(b.material));
  return groups;
}
