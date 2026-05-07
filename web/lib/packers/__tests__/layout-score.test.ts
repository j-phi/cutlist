import { describe, it, expect } from 'vitest';
import { Rectangle } from '../../geometry';
import type { PartToCut, PotentialBoardLayout, Stock } from '../../types';
import { compareLayoutScores, scoreLayouts } from '../layout-score';

const stock10x10: Stock = {
  material: 'MDF',
  thickness: 0.018,
  width: 10,
  length: 10,
};

function part(id: number): PartToCut {
  return {
    instanceNumber: 1,
    partNumber: id,
    name: `Part ${id}`,
    material: 'MDF',
    size: {
      thickness: 0.018,
      width: 1,
      length: 1,
    },
  };
}

function createLayout(
  stock: Stock,
  placements: Array<{
    left: number;
    bottom: number;
    width: number;
    height: number;
  }>,
): PotentialBoardLayout {
  return {
    stock,
    placements: placements.map((placement, i) => {
      return new Rectangle(
        part(i + 1),
        placement.left,
        placement.bottom,
        placement.width,
        placement.height,
      );
    }),
  };
}

describe('layout score', () => {
  it('Should return zero scores for an empty layout list', () => {
    expect(scoreLayouts([], 1e-5)).toEqual({
      boardsUsed: 0,
      wasteArea: 0,
      wasteConcentration: 0,
      cutComplexity: 0,
    });
  });

  it('Should calculate waste area and cut complexity for a simple board', () => {
    const score = scoreLayouts(
      [
        createLayout(stock10x10, [
          { left: 0, bottom: 0, width: 5, height: 10 },
          { left: 5, bottom: 0, width: 5, height: 10 },
        ]),
      ],
      1e-5,
    );

    expect(score).toEqual({
      boardsUsed: 1,
      wasteArea: 0,
      wasteConcentration: 0,
      cutComplexity: 5,
    });
  });

  it('Should return zero when scores tie within precision', () => {
    const score = {
      boardsUsed: 1,
      wasteArea: 0.000001,
      wasteConcentration: 0,
      cutComplexity: 4,
    };

    expect(compareLayoutScores(score, { ...score, wasteArea: 0 }, 1e-5)).toBe(
      0,
    );
  });

  it('prefers uniform waste over lopsided waste when total waste ties', () => {
    // Both layouts: 2 boards (each 100 units of board area), 50 units of total
    // waste. Lopsided puts all 50 waste on one barely-used board; uniform
    // splits 25 + 25.
    const lopsided = scoreLayouts(
      [
        createLayout(stock10x10, [
          { left: 0, bottom: 0, width: 10, height: 10 }, // 100 used → 0 waste
        ]),
        createLayout(stock10x10, [
          { left: 0, bottom: 0, width: 5, height: 10 }, // 50 used → 50 waste
        ]),
      ],
      1e-5,
    );
    const uniform = scoreLayouts(
      [
        createLayout(stock10x10, [
          { left: 0, bottom: 0, width: 5, height: 5 },
          { left: 5, bottom: 0, width: 5, height: 10 }, // 75 used → 25 waste
        ]),
        createLayout(stock10x10, [
          { left: 0, bottom: 0, width: 5, height: 5 },
          { left: 5, bottom: 0, width: 5, height: 10 }, // 75 used → 25 waste
        ]),
      ],
      1e-5,
    );
    expect(uniform.wasteArea).toBeCloseTo(lopsided.wasteArea);
    expect(uniform.wasteConcentration).toBeLessThan(
      lopsided.wasteConcentration,
    );
    expect(compareLayoutScores(uniform, lopsided, 1e-5)).toBeLessThan(0);
  });

  it('prefers fewer boards even when waste is higher', () => {
    const oneBoard = scoreLayouts(
      [createLayout(stock10x10, [{ left: 0, bottom: 0, width: 5, height: 5 }])],
      1e-5,
    );
    const twoBoards = scoreLayouts(
      [
        createLayout(stock10x10, [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
        createLayout(stock10x10, [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
      ],
      1e-5,
    );

    expect(compareLayoutScores(oneBoard, twoBoards, 1e-5)).toBeLessThan(0);
  });

  it('prefers lower waste when board count matches', () => {
    const higherWaste = scoreLayouts(
      [createLayout(stock10x10, [{ left: 0, bottom: 0, width: 5, height: 5 }])],
      1e-5,
    );
    const lowerWaste = scoreLayouts(
      [createLayout(stock10x10, [{ left: 0, bottom: 0, width: 8, height: 8 }])],
      1e-5,
    );

    expect(compareLayoutScores(lowerWaste, higherWaste, 1e-5)).toBeLessThan(0);
  });

  it('prefers lower cut complexity when board count and waste tie', () => {
    const lowComplexity = scoreLayouts(
      [
        createLayout(stock10x10, [
          { left: 0, bottom: 0, width: 10, height: 10 },
        ]),
      ],
      1e-5,
    );
    const highComplexity = scoreLayouts(
      [
        createLayout(stock10x10, [
          { left: 0, bottom: 0, width: 5, height: 10 },
          { left: 5, bottom: 0, width: 5, height: 10 },
        ]),
      ],
      1e-5,
    );

    expect(
      compareLayoutScores(lowComplexity, highComplexity, 1e-5),
    ).toBeLessThan(0);
  });
});
