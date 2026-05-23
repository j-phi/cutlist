import { describe, expect, it } from 'vitest';
import {
  aggregateSheetShoppingList,
  sheetShoppingProjectCost,
  mmToUm,
  type Micrometres,
  type SheetBoardLayout,
} from 'cutlist';

function sheet(
  material: string,
  widthMm: number,
  lengthMm: number,
  role: 'offcut' | 'general',
  cost?: number,
): SheetBoardLayout {
  return {
    kind: 'sheet',
    stock: {
      name: material,
      material,
      thicknessUm: mmToUm(18),
      widthUm: mmToUm(widthMm),
      lengthUm: mmToUm(lengthMm),
      role,
      ...(cost === undefined ? {} : { cost }),
    },
    placements: [],
    marginUm: mmToUm(0) as Micrometres,
    algorithm: 'tidy',
  };
}

describe('sheet shopping list — cost', () => {
  it('sums material cost over bought general boards and the project total', () => {
    // Plywood 18mm @ cost 60, 3 general boards bought → 180.
    const layouts = [
      sheet('Plywood', 1220, 2440, 'general', 60),
      sheet('Plywood', 1220, 2440, 'general', 60),
      sheet('Plywood', 1220, 2440, 'general', 60),
    ];
    const groups = aggregateSheetShoppingList(layouts);
    expect(groups[0].materialCost).toBe(180);
    expect(sheetShoppingProjectCost(groups)).toBe(180);
  });

  it('omits cost for a group with no priced size and excludes it from the total', () => {
    const layouts = [
      sheet('Plywood', 1220, 2440, 'general', 60),
      sheet('MDF', 1220, 2440, 'general'), // no cost
    ];
    const groups = aggregateSheetShoppingList(layouts);
    const plywood = groups.find((g) => g.material === 'Plywood');
    const mdf = groups.find((g) => g.material === 'MDF');
    expect(plywood?.materialCost).toBe(60);
    // No-cost group: undefined, not 0 — must not render $0 or contribute.
    expect(mdf?.materialCost).toBeUndefined();
    expect(sheetShoppingProjectCost(groups)).toBe(60);
  });

  it('does not charge for offcut boards (already owned)', () => {
    const layouts = [
      sheet('Plywood', 600, 600, 'offcut', 60),
      sheet('Plywood', 1220, 2440, 'general', 60),
    ];
    const [group] = aggregateSheetShoppingList(layouts);
    expect(group.materialCost).toBe(60);
  });

  it('returns undefined project total when no group is priced', () => {
    const groups = aggregateSheetShoppingList([
      sheet('MDF', 1220, 2440, 'general'),
    ]);
    expect(sheetShoppingProjectCost(groups)).toBeUndefined();
  });
});
