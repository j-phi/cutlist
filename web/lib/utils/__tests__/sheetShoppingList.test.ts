import { describe, it, expect } from 'vitest';
import {
  aggregateSheetShoppingList,
  reduceStockMatrix,
  mmToUm,
  type Micrometres,
  type SheetBoardLayout,
  type StockRole,
} from 'cutlist';

function board(
  material: string,
  widthMm: number,
  lengthMm: number,
  role: StockRole,
  thicknessMm = 18,
): SheetBoardLayout {
  return {
    kind: 'sheet',
    stock: {
      name: material,
      material,
      widthUm: mmToUm(widthMm),
      lengthUm: mmToUm(lengthMm),
      thicknessUm: mmToUm(thicknessMm),
      role,
    },
    placements: [],
    marginUm: 0 as Micrometres,
    algorithm: 'tidy',
  };
}

describe('aggregateSheetShoppingList', () => {
  it('splits offcuts used from general sheets to buy within a group', () => {
    const groups = aggregateSheetShoppingList([
      board('Ply', 500, 500, 'offcut'),
      board('Ply', 500, 500, 'offcut'),
      board('Ply', 1000, 2000, 'general'),
      board('Ply', 1000, 2000, 'general'),
      board('Ply', 1000, 2000, 'general'),
    ]);

    expect(groups).toHaveLength(1);
    const g = groups[0];
    expect(g.offcutsUsed).toBe(2);
    expect(g.generalTotal).toBe(3);
    expect(g.totalBoards).toBe(5);
    expect(g.generalSizes).toEqual([
      { widthUm: mmToUm(1000), lengthUm: mmToUm(2000), count: 3 },
    ]);
  });

  it('reports offcuts available from the supplied stock, not just used', () => {
    const stock = reduceStockMatrix([
      {
        kind: 'sheet',
        material: 'Ply',
        role: 'offcut',
        sizes: [{ width: 500, length: 500, thickness: [18], quantity: 3 }],
      },
    ]);
    const [g] = aggregateSheetShoppingList(
      [board('Ply', 500, 500, 'offcut'), board('Ply', 1000, 2000, 'general')],
      stock,
    );

    expect(g.offcutsUsed).toBe(1);
    expect(g.offcutsAvailable).toBe(3);
  });

  it('falls back to offcutsUsed for availability when no stock is given', () => {
    const [g] = aggregateSheetShoppingList([board('Ply', 500, 500, 'offcut')]);
    expect(g.offcutsAvailable).toBe(1);
  });

  it('separates groups by material and thickness', () => {
    const groups = aggregateSheetShoppingList([
      board('Ply', 1000, 2000, 'general', 18),
      board('Ply', 1000, 2000, 'general', 12),
      board('MDF', 1000, 2000, 'general', 18),
    ]);
    expect(groups).toHaveLength(3);
    // Stable order: material asc, then thickness asc.
    expect(groups.map((g) => [g.material, g.thicknessUm])).toEqual([
      ['MDF', mmToUm(18)],
      ['Ply', mmToUm(12)],
      ['Ply', mmToUm(18)],
    ]);
  });

  it('lists general buy sizes largest first', () => {
    const [g] = aggregateSheetShoppingList([
      board('Ply', 1000, 1000, 'general'),
      board('Ply', 1000, 2000, 'general'),
    ]);
    expect(g.generalSizes.map((s) => s.lengthUm)).toEqual([
      mmToUm(2000),
      mmToUm(1000),
    ]);
  });
});
