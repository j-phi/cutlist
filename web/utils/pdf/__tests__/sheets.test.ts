import { describe, expect, it } from 'vitest';
import type { Micrometres, SheetShoppingListGroup } from 'cutlist';
import { sheetShoppingGroupLines } from '../sheets';

const fmt = (um: Micrometres) => `${um}`;

function group(
  over: Partial<SheetShoppingListGroup> = {},
): SheetShoppingListGroup {
  return {
    material: 'Plywood',
    thicknessUm: 18000 as Micrometres,
    offcutsUsed: 0,
    offcutsAvailable: 0,
    generalSizes: [],
    generalTotal: 0,
    totalBoards: 1,
    yieldRatio: 0.5,
    materialCost: undefined,
    layouts: [],
    ...over,
  };
}

describe('sheetShoppingGroupLines (PDF shopping summary)', () => {
  it('includes a yield line and a cost line when priced', () => {
    const lines = sheetShoppingGroupLines(
      group({ yieldRatio: 0.5, materialCost: 180 }),
      fmt,
    );
    expect(lines).toContain('Yield: 50%');
    expect(lines).toContain('Cost: 180');
  });

  it('omits the cost line (never $0) for an unpriced group but keeps yield', () => {
    const lines = sheetShoppingGroupLines(
      group({ yieldRatio: 1, materialCost: undefined }),
      fmt,
    );
    expect(lines).toContain('Yield: 100%');
    expect(lines.some((l) => l.startsWith('Cost:'))).toBe(false);
  });
});
