import { describe, it, expect } from 'vitest';
import type { Micrometres } from 'cutlist';
import type { LinearBoardLayout } from '../../types';
import { aggregateLinearShoppingList } from '../shoppingList';

function makeLinear(
  material: string,
  lengthUm: Micrometres,
  placements: Micrometres[] = [],
): LinearBoardLayout {
  return {
    kind: 'linear',
    stock: {
      material,
      crossSectionWidthUm: 0.089 as Micrometres,
      crossSectionThicknessUm: 0.038 as Micrometres,
      lengthUm,
    },
    placements: placements.map((m, i) => ({
      partNumber: i + 1,
      instanceNumber: 1,
      name: `Part ${i + 1}`,
      material,
      widthUm: 0.089 as Micrometres,
      thicknessUm: 0.038 as Micrometres,
      lengthUm: m,
      offsetUm: 0 as Micrometres,
      allowanceLengthUm: 0 as Micrometres,
    })),
    wasteEndUm: 0 as Micrometres,
  };
}

describe('aggregateLinearShoppingList', () => {
  it('groups layouts by material and counts sticks per length', () => {
    const layouts: LinearBoardLayout[] = [
      makeLinear('Pine 2x4', 2.4384 as Micrometres),
      makeLinear('Pine 2x4', 2.4384 as Micrometres),
      makeLinear('Pine 2x4', 3.048 as Micrometres),
      makeLinear('Oak 1x6', 2.4384 as Micrometres),
    ];
    const groups = aggregateLinearShoppingList(layouts);
    expect(groups).toHaveLength(2);

    const oak = groups.find((g) => g.material === 'Oak 1x6');
    expect(oak?.totalSticks).toBe(1);
    expect(oak?.lengths).toEqual([
      { lengthUm: 2.4384 as Micrometres, count: 1 },
    ]);

    const pine = groups.find((g) => g.material === 'Pine 2x4');
    expect(pine?.totalSticks).toBe(3);
    expect(pine?.lengths).toEqual([
      { lengthUm: 2.4384 as Micrometres, count: 2 },
      { lengthUm: 3.048 as Micrometres, count: 1 },
    ]);
  });

  it('sorts lengths ascending within a group', () => {
    const layouts: LinearBoardLayout[] = [
      makeLinear('Pine 2x4', 3.048 as Micrometres),
      makeLinear('Pine 2x4', 2.4384 as Micrometres),
      makeLinear('Pine 2x4', 4.8768 as Micrometres),
    ];
    const groups = aggregateLinearShoppingList(layouts);
    expect(groups[0]?.lengths.map((l) => l.lengthUm)).toEqual([
      2.4384, 3.048, 4.8768,
    ]);
  });

  it('returns layouts ordered ascending by length', () => {
    const a = makeLinear('Pine 2x4', 3.048 as Micrometres);
    const b = makeLinear('Pine 2x4', 2.4384 as Micrometres);
    const c = makeLinear('Pine 2x4', 4.8768 as Micrometres);
    const groups = aggregateLinearShoppingList([a, b, c]);
    expect(groups[0]?.layouts.map((l) => l.stock.lengthUm)).toEqual([
      2.4384, 3.048, 4.8768,
    ]);
  });

  it('returns empty array for empty input', () => {
    expect(aggregateLinearShoppingList([])).toEqual([]);
  });
});
