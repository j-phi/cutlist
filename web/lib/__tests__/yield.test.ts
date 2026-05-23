import { describe, expect, it } from 'vitest';
import {
  aggregateSheetShoppingList,
  mmToUm,
  type Micrometres,
  type SheetBoardLayout,
  type SheetBoardLayoutPlacement,
} from 'cutlist';

/**
 * Build a placement footprint that occupies `wMm × lMm` at the board origin.
 * Only the corner-rectangle extents matter to the yield computation.
 */
function placement(wMm: number, lMm: number): SheetBoardLayoutPlacement {
  return {
    partNumber: 1,
    instanceNumber: 1,
    name: 'P',
    material: 'Plywood',
    widthUm: mmToUm(wMm),
    lengthUm: mmToUm(lMm),
    thicknessUm: mmToUm(18),
    leftUm: mmToUm(0),
    rightUm: mmToUm(wMm),
    bottomUm: mmToUm(0),
    topUm: mmToUm(lMm),
    allowanceWidthUm: mmToUm(0),
    allowanceLengthUm: mmToUm(0),
  };
}

function sheet(
  widthMm: number,
  lengthMm: number,
  role: 'offcut' | 'general',
  placements: SheetBoardLayoutPlacement[],
  cost?: number,
): SheetBoardLayout {
  return {
    kind: 'sheet',
    stock: {
      name: 'Plywood',
      material: 'Plywood',
      thicknessUm: mmToUm(18),
      widthUm: mmToUm(widthMm),
      lengthUm: mmToUm(lengthMm),
      role,
      ...(cost === undefined ? {} : { cost }),
    },
    placements,
    marginUm: mmToUm(0) as Micrometres,
    algorithm: 'tidy',
  };
}

describe('aggregateSheetShoppingList — yield', () => {
  it('computes yield as placed part area over whole purchased board area', () => {
    // One 1220×2440 mm sheet (≈2.9768 m²); placements summing 1.4886 m² → 50%.
    // 1.4886 m² split as two 1220×610 mm placements: 1.22×0.61×2 = 1.4884 m².
    const layout = sheet(1220, 2440, 'general', [
      placement(1220, 610),
      placement(1220, 610),
    ]);
    const [group] = aggregateSheetShoppingList([layout]);
    expect(group.yieldRatio).toBeGreaterThan(0.495);
    expect(group.yieldRatio).toBeLessThan(0.505);
  });

  it('counts whole boards in the denominator, not partial fill', () => {
    // Sheet 1 fully placed, sheet 2 only ~10% filled. Denominator must be
    // 2 full boards, not 1.1 — guards the partial-sheet mistake.
    const full = sheet(1000, 1000, 'general', [placement(1000, 1000)]);
    const tenth = sheet(1000, 1000, 'general', [placement(1000, 100)]);
    const [group] = aggregateSheetShoppingList([full, tenth]);
    // Numerator = 1.0 m² + 0.1 m² = 1.1 m²; denominator (whole boards) = 2 m².
    expect(group.yieldRatio).toBeCloseTo(1.1 / 2, 4);
  });

  it('splits boards consumed by tier (offcut vs general)', () => {
    const layouts = [
      sheet(600, 600, 'offcut', [placement(600, 600)]),
      sheet(1000, 1000, 'general', [placement(1000, 1000)]),
      sheet(1000, 1000, 'general', [placement(1000, 1000)]),
    ];
    const [group] = aggregateSheetShoppingList(layouts);
    expect({ offcut: group.offcutsUsed, buy: group.generalTotal }).toEqual({
      offcut: 1,
      buy: 2,
    });
  });
});
