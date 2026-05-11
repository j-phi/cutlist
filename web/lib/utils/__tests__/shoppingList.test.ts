import { describe, it, expect } from 'vitest';
import type { LinearBoardLayout } from '../../types';
import { aggregateLinearShoppingList } from '../shoppingList';

function makeLinear(
  material: string,
  lengthM: number,
  placements: number[] = [],
): LinearBoardLayout {
  return {
    kind: 'linear',
    stock: {
      material,
      crossSectionWidthM: 0.089,
      crossSectionThicknessM: 0.038,
      lengthM,
    },
    placements: placements.map((m, i) => ({
      partNumber: i + 1,
      instanceNumber: 1,
      name: `Part ${i + 1}`,
      material,
      widthM: 0.089,
      thicknessM: 0.038,
      lengthM: m,
      offsetM: 0,
    })),
    wasteEndM: 0,
  };
}

describe('aggregateLinearShoppingList', () => {
  it('groups layouts by material and counts sticks per length', () => {
    const layouts: LinearBoardLayout[] = [
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Pine 2x4', 3.048),
      makeLinear('Oak 1x6', 2.4384),
    ];
    const groups = aggregateLinearShoppingList(layouts);
    expect(groups).toHaveLength(2);

    const oak = groups.find((g) => g.material === 'Oak 1x6');
    expect(oak?.totalSticks).toBe(1);
    expect(oak?.lengths).toEqual([{ lengthM: 2.4384, count: 1 }]);

    const pine = groups.find((g) => g.material === 'Pine 2x4');
    expect(pine?.totalSticks).toBe(3);
    expect(pine?.lengths).toEqual([
      { lengthM: 2.4384, count: 2 },
      { lengthM: 3.048, count: 1 },
    ]);
  });

  it('sorts lengths ascending within a group', () => {
    const layouts: LinearBoardLayout[] = [
      makeLinear('Pine 2x4', 3.048),
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Pine 2x4', 4.8768),
    ];
    const groups = aggregateLinearShoppingList(layouts);
    expect(groups[0]?.lengths.map((l) => l.lengthM)).toEqual([
      2.4384, 3.048, 4.8768,
    ]);
  });

  it('returns layouts ordered ascending by length', () => {
    const a = makeLinear('Pine 2x4', 3.048);
    const b = makeLinear('Pine 2x4', 2.4384);
    const c = makeLinear('Pine 2x4', 4.8768);
    const groups = aggregateLinearShoppingList([a, b, c]);
    expect(groups[0]?.layouts.map((l) => l.stock.lengthM)).toEqual([
      2.4384, 3.048, 4.8768,
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(aggregateLinearShoppingList([])).toEqual([]);
  });
});
