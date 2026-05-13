import { describe, it, expect } from 'vitest';
import { Rectangle } from '../../geometry';
import type { PartToCut, PotentialBoardLayout, SheetStock } from '../../types';
import { compareLayoutScores, scoreLayouts } from '../layout-score';
import { um } from '~/test-utils/units';

const stock10x10: SheetStock = {
  kind: 'sheet',
  material: 'MDF',
  thickness: um(18_000),
  width: um(10),
  length: um(10),
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
    });
  });

  it('returns zero only when scores are exactly equal', () => {
    const score = {
      boardsUsed: 1,
      wasteArea: 0,
      wasteConcentration: 0,
      cutComplexity: 4,
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
});
