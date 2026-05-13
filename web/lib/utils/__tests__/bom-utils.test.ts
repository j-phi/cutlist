import { describe, it, expect } from 'vitest';
import type { Micrometres } from 'cutlist';
import { groupPartsByNumber } from '../bom-utils';
import type {
  BoardLayoutLeftover,
  SheetBoardLayoutPlacement,
} from '../../types';

// Helpers to build minimal fixture objects
function makeLeftover(
  partNumber: number,
  instanceNumber: number,
): BoardLayoutLeftover {
  return {
    partNumber,
    instanceNumber,
    name: `part-${partNumber}-${instanceNumber}`,
    material: 'Plywood',
    widthUm: 0.1 as Micrometres,
    lengthUm: 0.2 as Micrometres,
    thicknessUm: 0.018 as Micrometres,
  };
}

function makePlacement(
  partNumber: number,
  instanceNumber: number,
): SheetBoardLayoutPlacement {
  return {
    ...makeLeftover(partNumber, instanceNumber),
    leftUm: 0 as Micrometres,
    rightUm: 0.1 as Micrometres,
    topUm: 0 as Micrometres,
    bottomUm: 0.2 as Micrometres,
    allowanceWidthUm: 0 as Micrometres,
    allowanceLengthUm: 0 as Micrometres,
  };
}

describe('groupPartsByNumber', () => {
  it('returns empty array when both inputs are empty', () => {
    expect(groupPartsByNumber([], [])).toEqual([]);
  });

  it('groups every placement and leftover by part number, mixing the two', () => {
    const p1a = makePlacement(7, 1);
    const p1b = makePlacement(7, 2);
    const l1c = makeLeftover(7, 3);
    const l5 = makeLeftover(5, 1);
    const result = groupPartsByNumber([p1a, p1b], [l1c, l5]);
    expect(result).toHaveLength(2);
    expect(result.find((g) => g[0].partNumber === 7)).toEqual(
      expect.arrayContaining([p1a, p1b, l1c]),
    );
    expect(result.find((g) => g[0].partNumber === 5)).toEqual([l5]);
  });

  it('sorts groups ascending by part number across placements and leftovers', () => {
    const p10 = makePlacement(10, 1);
    const l2 = makeLeftover(2, 1);
    const p5 = makePlacement(5, 1);
    const result = groupPartsByNumber([p10, p5], [l2]);
    expect(result.map((g) => g[0].partNumber)).toEqual([2, 5, 10]);
  });
});
