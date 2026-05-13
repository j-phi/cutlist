import { describe, expect, it } from 'vitest';
import {
  generateBoardLayouts,
  isLinearBoardLayout,
  mToUm,
  type BoardLayout,
  type Config,
  type PartToCut,
  type SheetBoardLayout,
} from '..';

function asSheet(layout: BoardLayout): SheetBoardLayout {
  if (isLinearBoardLayout(layout))
    throw new Error('expected sheet board layout, got linear');
  return layout;
}

/** Build a PartToCut from meter-friendly fixture values. */
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

const stock = [
  {
    kind: 'sheet' as const,
    material: 'MDF',
    sizes: [{ width: 1000, length: 3000, thickness: [18] }],
  },
];

describe('generateBoardLayouts', () => {
  it('rotates parts in auto mode when needed to fit', () => {
    const config: Config = {
      bladeWidth: 0 as Config['bladeWidth'],
      margin: 0 as Config['margin'],
      defaultAlgorithm: 'auto',
    };
    const result = generateBoardLayouts([createPart(1, 2, 1)], stock, config);

    expect(result.leftovers).toHaveLength(0);
    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0].placements).toEqual([
      expect.objectContaining({
        widthUm: mToUm(2),
        lengthUm: mToUm(1),
        leftUm: 0,
        rightUm: mToUm(1),
        bottomUm: 0,
        topUm: mToUm(2),
      }),
    ]);
  });

  it('rotates parts in cnc mode when needed to fit', () => {
    const config: Config = {
      bladeWidth: 0 as Config['bladeWidth'],
      margin: 0 as Config['margin'],
      defaultAlgorithm: 'cnc',
    };
    const result = generateBoardLayouts([createPart(1, 2, 1)], stock, config);

    expect(result.leftovers).toHaveLength(0);
    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0].placements).toEqual([
      expect.objectContaining({
        widthUm: mToUm(2),
        lengthUm: mToUm(1),
        leftUm: 0,
        rightUm: mToUm(1),
        bottomUm: 0,
        topUm: mToUm(2),
      }),
    ]);
  });

  it('respects maxSearchPasses as a deterministic pass budget', () => {
    const parts = [
      createPart(1, 1, 1),
      createPart(2, 1, 1),
      createPart(3, 2, 1),
    ];

    const budgeted = generateBoardLayouts(parts, stock, {
      bladeWidth: 0,
      margin: 0,
      defaultAlgorithm: 'auto',
      maxSearchPasses: 1,
      searchPasses: ['cnc-area', 'cnc-perimeter', 'compact-bssf-area'],
    });
    const firstPassOnly = generateBoardLayouts(parts, stock, {
      bladeWidth: 0,
      margin: 0,
      defaultAlgorithm: 'auto',
      searchPasses: ['cnc-area'],
    });

    expect(budgeted).toEqual(firstPassOnly);
  });

  it('routes per-thickness algorithms independently per material', () => {
    const mixedStock = [
      {
        kind: 'sheet' as const,
        material: 'Plywood',
        sizes: [{ width: 1000, length: 3000, thickness: [18] }],
        thicknessAlgorithms: { 18: 'tidy' as const },
      },
      {
        kind: 'sheet' as const,
        material: 'MDF',
        sizes: [{ width: 1000, length: 3000, thickness: [18] }],
        thicknessAlgorithms: { 18: 'compact' as const },
      },
    ];
    const plywoodParts = [
      { ...createPart(1, 0.4, 0.6), material: 'Plywood' },
      { ...createPart(2, 0.4, 0.6), material: 'Plywood' },
      { ...createPart(3, 0.4, 0.6), material: 'Plywood' },
      { ...createPart(4, 0.4, 0.6), material: 'Plywood' },
    ];
    const mdfParts = [
      { ...createPart(5, 0.4, 0.6), material: 'MDF' },
      { ...createPart(6, 0.4, 0.6), material: 'MDF' },
    ];
    const result = generateBoardLayouts(
      [...plywoodParts, ...mdfParts],
      mixedStock,
      {
        bladeWidth: 0,
        margin: 0,
        defaultAlgorithm: 'cnc',
      },
    );

    expect(result.leftovers).toEqual([]);
    const plywoodBoards = result.layouts.filter(
      (l) => l.stock.material === 'Plywood',
    );
    expect(plywoodBoards.length).toBeGreaterThan(0);
    // Tidy on equal-width parts → single column.
    for (const board of plywoodBoards) {
      const lefts = new Set(
        asSheet(board).placements.map((p) => p.leftUm as number),
      );
      expect(lefts.size).toBe(1);
    }
  });

  it('per-thickness override beats Config.defaultAlgorithm', () => {
    const overrideStock = [
      {
        kind: 'sheet' as const,
        material: 'MDF',
        sizes: [{ width: 1000, length: 3000, thickness: [18] }],
        thicknessAlgorithms: { 18: 'tidy' as const },
      },
    ];
    const parts = [
      createPart(1, 0.5, 0.5),
      createPart(2, 0.5, 0.5),
      createPart(3, 0.5, 0.5),
    ];
    const result = generateBoardLayouts(parts, overrideStock, {
      bladeWidth: 0,
      margin: 0,
      defaultAlgorithm: 'cnc',
    });

    expect(result.leftovers).toEqual([]);
    const lefts = new Set(
      asSheet(result.layouts[0]).placements.map((p) => p.leftUm as number),
    );
    expect(lefts.size).toBe(1);
  });

  it('per-thickness override on any matching StockMatrix row wins', () => {
    const stockWithOverrideOnSecondEntry = [
      {
        kind: 'sheet' as const,
        material: 'Plywood',
        sizes: [{ width: 2000, length: 3000, thickness: [18] }],
      },
      {
        kind: 'sheet' as const,
        material: 'Plywood',
        sizes: [{ width: 1000, length: 2000, thickness: [18] }],
        thicknessAlgorithms: { 18: 'tidy' as const },
      },
    ];
    const parts = [
      { ...createPart(1, 0.5, 0.5), material: 'Plywood' },
      { ...createPart(2, 0.5, 0.5), material: 'Plywood' },
    ];
    const result = generateBoardLayouts(parts, stockWithOverrideOnSecondEntry, {
      bladeWidth: 0,
      margin: 0,
      defaultAlgorithm: 'cnc',
    });

    expect(result.leftovers).toEqual([]);
    expect(
      result.layouts.every((l) => l.kind === 'sheet' && l.algorithm === 'tidy'),
    ).toBe(true);
  });

  it('is deterministic in auto mode', () => {
    const config: Config = {
      bladeWidth: 0 as Config['bladeWidth'],
      margin: 0 as Config['margin'],
      defaultAlgorithm: 'auto',
    };
    const parts = [
      createPart(1, 1, 1),
      createPart(2, 1, 1),
      createPart(3, 2, 1),
      createPart(4, 2, 1),
      createPart(5, 1, 2),
      createPart(6, 1, 2),
    ];

    const first = generateBoardLayouts(parts, stock, config);
    const second = generateBoardLayouts(parts, stock, config);

    expect(second).toEqual(first);
  });
});
