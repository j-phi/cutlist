import { describe, it, expect } from 'vitest';
import { Rectangle } from '../../geometry';
import type { PartToCut, PotentialBoardLayout, SheetStock } from '../../types';
import {
  compareLayoutScores,
  compareLayoutScoresForObjective,
  scoreLayouts,
} from '../layout-score';
import { um } from '~/test-utils/units';

const stock10x10: SheetStock = {
  kind: 'sheet',
  material: 'MDF',
  thickness: um(18_000),
  width: um(10),
  length: um(10),
  role: 'general',
};

function part(id: number): PartToCut {
  return {
    instanceNumber: 1,
    partNumber: id,
    name: `Part ${id}`,
    material: 'MDF',
    size: { thickness: um(18_000), width: um(1), length: um(1) },
  };
}

function createLayout(
  stock: SheetStock,
  placements: Array<{
    left: number;
    bottom: number;
    width: number;
    height: number;
  }>,
): PotentialBoardLayout {
  return {
    kind: 'sheet',
    stock,
    placements: placements.map(
      (placement, i) =>
        new Rectangle(
          part(i + 1),
          um(placement.left),
          um(placement.bottom),
          um(placement.width),
          um(placement.height),
        ),
    ),
    algorithm: 'compact',
  };
}

describe('layout score', () => {
  it('Should return zero scores for an empty layout list', () => {
    expect(scoreLayouts([])).toEqual({
      boardsUsed: 0,
      wasteArea: 0,
      wasteConcentration: 0,
      cutComplexity: 0,
      materialCost: undefined,
    });
  });

  it('Should calculate waste area and cut complexity for a simple board', () => {
    const score = scoreLayouts([
      createLayout(stock10x10, [
        { left: 0, bottom: 0, width: 5, height: 10 },
        { left: 5, bottom: 0, width: 5, height: 10 },
      ]),
    ]);

    expect(score).toEqual({
      boardsUsed: 1,
      wasteArea: 0,
      wasteConcentration: 0,
      cutComplexity: 23,
      materialCost: undefined,
    });
  });

  it('returns zero only when scores are exactly equal', () => {
    const score = {
      boardsUsed: 1,
      wasteArea: 0,
      wasteConcentration: 0,
      cutComplexity: 4,
      materialCost: undefined,
    };
    expect(compareLayoutScores(score, { ...score })).toBe(0);
    // No more "tie within precision" — integer dims produce exact scores,
    // so even a single unit of difference breaks the tie.
    expect(compareLayoutScores(score, { ...score, wasteArea: 1 })).toBeLessThan(
      0,
    );
  });

  it('prefers uniform waste over lopsided waste when total waste ties', () => {
    const lopsided = scoreLayouts([
      createLayout(stock10x10, [{ left: 0, bottom: 0, width: 10, height: 10 }]),
      createLayout(stock10x10, [{ left: 0, bottom: 0, width: 5, height: 10 }]),
    ]);
    const uniform = scoreLayouts([
      createLayout(stock10x10, [
        { left: 0, bottom: 0, width: 5, height: 5 },
        { left: 5, bottom: 0, width: 5, height: 10 },
      ]),
      createLayout(stock10x10, [
        { left: 0, bottom: 0, width: 5, height: 5 },
        { left: 5, bottom: 0, width: 5, height: 10 },
      ]),
    ]);
    expect(uniform.wasteArea).toBe(lopsided.wasteArea);
    expect(uniform.wasteConcentration).toBeLessThan(
      lopsided.wasteConcentration,
    );
    expect(compareLayoutScores(uniform, lopsided)).toBeLessThan(0);
  });

  it('prefers fewer boards even when waste is higher', () => {
    const oneBoard = scoreLayouts([
      createLayout(stock10x10, [{ left: 0, bottom: 0, width: 5, height: 5 }]),
    ]);
    const twoBoards = scoreLayouts([
      createLayout(stock10x10, [{ left: 0, bottom: 0, width: 10, height: 10 }]),
      createLayout(stock10x10, [{ left: 0, bottom: 0, width: 10, height: 10 }]),
    ]);

    expect(compareLayoutScores(oneBoard, twoBoards)).toBeLessThan(0);
  });

  it('prefers lower waste when board count matches', () => {
    const higherWaste = scoreLayouts([
      createLayout(stock10x10, [{ left: 0, bottom: 0, width: 5, height: 5 }]),
    ]);
    const lowerWaste = scoreLayouts([
      createLayout(stock10x10, [{ left: 0, bottom: 0, width: 8, height: 8 }]),
    ]);

    expect(compareLayoutScores(lowerWaste, higherWaste)).toBeLessThan(0);
  });

  it('prefers lower cut complexity when board count and waste tie', () => {
    const lowComplexity = scoreLayouts([
      createLayout(stock10x10, [{ left: 0, bottom: 0, width: 10, height: 10 }]),
    ]);
    const highComplexity = scoreLayouts([
      createLayout(stock10x10, [
        { left: 0, bottom: 0, width: 5, height: 10 },
        { left: 5, bottom: 0, width: 5, height: 10 },
      ]),
    ]);

    expect(compareLayoutScores(lowComplexity, highComplexity)).toBeLessThan(0);
  });

  describe('material cost (FR-COPT-1)', () => {
    const priced = (cost: number): SheetStock => ({ ...stock10x10, cost });
    const offcut = (cost: number): SheetStock => ({
      ...stock10x10,
      role: 'offcut',
      cost,
    });

    it('sums the cost of general boards', () => {
      const score = scoreLayouts([
        createLayout(priced(60), [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
        createLayout(priced(25), [{ left: 0, bottom: 0, width: 5, height: 5 }]),
      ]);
      expect(score.materialCost).toBe(85);
    });

    it('reports undefined (not 0) when no general board is priced', () => {
      const score = scoreLayouts([
        createLayout(stock10x10, [{ left: 0, bottom: 0, width: 5, height: 5 }]),
      ]);
      expect(score.materialCost).toBeUndefined();
    });

    it('excludes offcut boards from the material cost', () => {
      const score = scoreLayouts([
        createLayout(priced(40), [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
        createLayout(offcut(99), [{ left: 0, bottom: 0, width: 5, height: 5 }]),
      ]);
      // Only the general board's 40 counts; the owned offcut contributes 0.
      expect(score.materialCost).toBe(40);
    });

    it('objective=cost ranks the cheaper candidate first', () => {
      const cheap = scoreLayouts([
        createLayout(priced(30), [{ left: 0, bottom: 0, width: 5, height: 5 }]),
      ]);
      const pricey = scoreLayouts([
        createLayout(priced(50), [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
      ]);
      expect(
        compareLayoutScoresForObjective(cheap, pricey, 'cost'),
      ).toBeLessThan(0);
    });

    it('objective=cost falls through to the lexicographic chain on a cost tie', () => {
      const lowWaste = scoreLayouts([
        createLayout(priced(40), [{ left: 0, bottom: 0, width: 8, height: 8 }]),
      ]);
      const highWaste = scoreLayouts([
        createLayout(priced(40), [{ left: 0, bottom: 0, width: 5, height: 5 }]),
      ]);
      expect(lowWaste.materialCost).toBe(highWaste.materialCost);
      expect(
        compareLayoutScoresForObjective(lowWaste, highWaste, 'cost'),
      ).toBeLessThan(0);
    });

    it('objective=cost defers to boards-first when a side is unpriced', () => {
      // Cheaper-on-paper but two boards vs. one unpriced board: with an
      // undefined materialCost on one side, cost cannot decide, so the
      // boards-first chain wins (fewer boards).
      const oneUnpriced = scoreLayouts([
        createLayout(stock10x10, [{ left: 0, bottom: 0, width: 5, height: 5 }]),
      ]);
      const twoPriced = scoreLayouts([
        createLayout(priced(1), [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
        createLayout(priced(1), [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
      ]);
      expect(
        compareLayoutScoresForObjective(oneUnpriced, twoPriced, 'cost'),
      ).toBeLessThan(0);
    });

    it('objective=boards ignores cost entirely', () => {
      const cheapTwoBoards = scoreLayouts([
        createLayout(priced(1), [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
        createLayout(priced(1), [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
      ]);
      const dearOneBoard = scoreLayouts([
        createLayout(priced(99), [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
      ]);
      // boards-first: one board beats two regardless of price.
      expect(
        compareLayoutScoresForObjective(dearOneBoard, cheapTwoBoards, 'boards'),
      ).toBeLessThan(0);
    });
  });
});
