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

describe('bom-utils', () => {
  describe('groupPartsByNumber', () => {
    it('returns empty array when both inputs are empty', () => {
      expect(groupPartsByNumber([], [])).toEqual([]);
    });

    it('groups a single placement into one group', () => {
      const p = makePlacement(1, 1);
      const result = groupPartsByNumber([p], []);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([p]);
    });

    it('groups multiple placements with the same part number into one group', () => {
      const p1 = makePlacement(1, 1);
      const p2 = makePlacement(1, 2);
      const result = groupPartsByNumber([p1, p2], []);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(2);
      expect(result[0]).toContain(p1);
      expect(result[0]).toContain(p2);
    });

    it('groups a single leftover into one group', () => {
      const l = makeLeftover(2, 1);
      const result = groupPartsByNumber([], [l]);
      expect(result).toHaveLength(1);
      expect(result[0]).toEqual([l]);
    });

    it('groups multiple leftovers with the same part number into one group', () => {
      const l1 = makeLeftover(3, 1);
      const l2 = makeLeftover(3, 2);
      const result = groupPartsByNumber([], [l1, l2]);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(2);
    });

    it('merges placements and leftovers with the same part number into one group', () => {
      const p = makePlacement(5, 1);
      const l = makeLeftover(5, 2);
      const result = groupPartsByNumber([p], [l]);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(2);
      expect(result[0]).toContain(p);
      expect(result[0]).toContain(l);
    });

    it('creates separate groups for different part numbers', () => {
      const p1 = makePlacement(1, 1);
      const p2 = makePlacement(2, 1);
      const result = groupPartsByNumber([p1, p2], []);
      expect(result).toHaveLength(2);
    });

    it('sorts groups ascending by part number', () => {
      const p3 = makePlacement(3, 1);
      const p1 = makePlacement(1, 1);
      const p2 = makePlacement(2, 1);
      const result = groupPartsByNumber([p3, p1, p2], []);
      expect(result[0][0].partNumber).toBe(1);
      expect(result[1][0].partNumber).toBe(2);
      expect(result[2][0].partNumber).toBe(3);
    });

    it('sorts groups ascending when part numbers come from mixed placements and leftovers', () => {
      const p10 = makePlacement(10, 1);
      const l2 = makeLeftover(2, 1);
      const p5 = makePlacement(5, 1);
      const result = groupPartsByNumber([p10, p5], [l2]);
      expect(result.map((g) => g[0].partNumber)).toEqual([2, 5, 10]);
    });

    it('collects multiple instances of the same part number across placements and leftovers', () => {
      const p1a = makePlacement(7, 1);
      const p1b = makePlacement(7, 2);
      const l1c = makeLeftover(7, 3);
      const result = groupPartsByNumber([p1a, p1b], [l1c]);
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(3);
    });
  });
});
