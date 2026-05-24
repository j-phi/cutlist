import { describe, expect, it } from 'vitest';
import {
  generateBoardLayouts,
  mToUm,
  type Config,
  type PartToCut,
  type StockMatrix,
} from '..';

function createPart(
  partNumber: number,
  widthM: number,
  lengthM: number,
): PartToCut {
  return {
    partNumber,
    instanceNumber: 1,
    name: `Part ${partNumber}`,
    material: 'MDF',
    size: {
      thickness: mToUm(0.018),
      width: mToUm(widthM),
      length: mToUm(lengthM),
    },
  };
}

function config(objective: Config['optimizationObjective']): Config {
  return {
    bladeWidth: 0 as Config['bladeWidth'],
    margin: 0 as Config['margin'],
    defaultAlgorithm: 'auto',
    optimizationObjective: objective,
  };
}

describe('cost optimization (FR-COPT)', () => {
  it('is deterministic across stock input order (FR-COPT-5)', () => {
    // Several distinct sheet sizes, two of them equal-area, plus offcuts.
    // Identical {parts, stock, config} must produce identical BoardLayout[]
    // regardless of the order the stock matrix arrives in.
    const stockA: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [
          {
            name: 'Big',
            width: 1200,
            length: 2400,
            thickness: [18],
            thicknessCosts: { '18': 50 },
          },
          {
            name: 'Mid',
            width: 1000,
            length: 2000,
            thickness: [18],
            thicknessCosts: { '18': 30 },
          },
        ],
      },
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [
          // Same area as 'Mid' (1000x2000 vs 2000x1000) — a degenerate tie the
          // total order must break the same way regardless of input position.
          {
            name: 'Wide',
            width: 2000,
            length: 1000,
            thickness: [18],
            thicknessCosts: { '18': 30 },
          },
        ],
      },
    ];
    const stockB: StockMatrix[] = [stockA[1], stockA[0]];

    const parts = [
      createPart(1, 0.9, 1.9),
      createPart(2, 0.5, 0.5),
      createPart(3, 0.4, 1.2),
    ];

    const resultA = generateBoardLayouts(parts, stockA, config('boards'));
    const resultB = generateBoardLayouts(parts, stockB, config('boards'));

    expect(resultB.layouts).toEqual(resultA.layouts);
    expect(resultB.leftovers).toEqual(resultA.leftovers);
  });

  it('picks the cheaper stock when the objective is cost and all sizes are priced (FR-COPT-2)', () => {
    // Two general sizes that both hold the single part. The larger board is
    // cheaper; boards-first would shrink to the smallest fitting board, but
    // cost-first must keep the cheaper (larger) one.
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [
          {
            name: 'Pricey-small',
            width: 1000,
            length: 1000,
            thickness: [18],
            thicknessCosts: { '18': 40 },
          },
          {
            name: 'Cheap-large',
            width: 1500,
            length: 1500,
            thickness: [18],
            thicknessCosts: { '18': 10 },
          },
        ],
      },
    ];
    const parts = [createPart(1, 0.9, 0.9)];

    const boardsResult = generateBoardLayouts(parts, stock, config('boards'));
    const costResult = generateBoardLayouts(parts, stock, config('cost'));

    // Boards-first minimizes board footprint → the smaller (pricey) board.
    expect(boardsResult.layouts[0].stock.cost).toBe(40);
    // Cost-first keeps the cheaper board even though it is larger.
    expect(costResult.layouts[0].stock.cost).toBe(10);
  });

  it('falls back to boards-first for a group with any unpriced size (FR-COPT-3)', () => {
    // Same geometry as the cost test, but the cheaper-large board has NO price.
    // A missing cost disqualifies the whole group from cost ranking, so the
    // cost-objective result must equal the boards-first result.
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [
          {
            name: 'Pricey-small',
            width: 1000,
            length: 1000,
            thickness: [18],
            thicknessCosts: { '18': 40 },
          },
          {
            name: 'Unpriced-large',
            width: 1500,
            length: 1500,
            thickness: [18],
          },
        ],
      },
    ];
    const parts = [createPart(1, 0.9, 0.9)];

    const boardsResult = generateBoardLayouts(parts, stock, config('boards'));
    const costResult = generateBoardLayouts(parts, stock, config('cost'));

    expect(costResult.layouts).toEqual(boardsResult.layouts);
  });
});
