import { describe, expect, it } from 'vitest';
import {
  generateBoardLayouts,
  isLinearBoardLayout,
  type AnyBoardLayout,
  type BoardLayout,
  type Config,
  type PartToCut,
} from '..';

function asSheet(layout: AnyBoardLayout): BoardLayout {
  if (isLinearBoardLayout(layout))
    throw new Error('expected sheet board layout, got linear');
  return layout;
}

function createPart(
  partNumber: number,
  width: number,
  length: number,
): PartToCut {
  return {
    partNumber,
    instanceNumber: 1,
    name: `Part ${partNumber}`,
    material: 'MDF',
    size: {
      thickness: 0.018,
      width,
      length,
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
      bladeWidth: 0,
      margin: 0,
      defaultAlgorithm: 'auto',
      precision: 1e-5,
    };
    const result = generateBoardLayouts([createPart(1, 2, 1)], stock, config);

    expect(result.leftovers).toHaveLength(0);
    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0].placements).toEqual([
      expect.objectContaining({
        widthM: 1,
        lengthM: 2,
      }),
    ]);
  });

  it('rotates parts in cnc mode when needed to fit', () => {
    const config: Config = {
      bladeWidth: 0,
      margin: 0,
      defaultAlgorithm: 'cnc',
      precision: 1e-5,
    };
    const result = generateBoardLayouts([createPart(1, 2, 1)], stock, config);

    expect(result.leftovers).toHaveLength(0);
    expect(result.layouts).toHaveLength(1);
    expect(result.layouts[0].placements).toEqual([
      expect.objectContaining({
        widthM: 1,
        lengthM: 2,
      }),
    ]);
  });

  it('respects maxSearchPasses as a deterministic pass budget', () => {
    const parts = [
      createPart(1, 1, 1),
      createPart(2, 1, 1),
      createPart(3, 2, 1),
    ];

    // With the budget fixed at 1, only the very first pass runs per stock
    // group — the winning layout is fully determined by pass ordering.
    const budgeted = generateBoardLayouts(parts, stock, {
      bladeWidth: 0,
      margin: 0,
      defaultAlgorithm: 'auto',
      maxSearchPasses: 1,
      searchPasses: ['cnc-area', 'cnc-perimeter', 'compact-bssf-area'],
      precision: 1e-5,
    });
    const firstPassOnly = generateBoardLayouts(parts, stock, {
      bladeWidth: 0,
      margin: 0,
      defaultAlgorithm: 'auto',
      searchPasses: ['cnc-area'],
      precision: 1e-5,
    });

    expect(budgeted).toEqual(firstPassOnly);
  });

  it('routes per-thickness algorithms independently per material', () => {
    // Plywood 18mm pinned to tidy; MDF 18mm pinned to compact. Each group
    // runs its own tournament — verify Plywood ends up column-aligned.
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
      { bladeWidth: 0, margin: 0, defaultAlgorithm: 'cnc', precision: 1e-5 },
    );

    expect(result.leftovers).toEqual([]);
    const plywoodBoards = result.layouts.filter(
      (l) => l.stock.material === 'Plywood',
    );
    expect(plywoodBoards.length).toBeGreaterThan(0);
    // Tidy on equal-width parts → single column.
    for (const board of plywoodBoards) {
      const lefts = new Set(
        asSheet(board).placements.map((p) => Math.round(p.leftM * 1e6)),
      );
      expect(lefts.size).toBe(1);
    }
  });

  it('per-thickness override beats Config.defaultAlgorithm', () => {
    // Project default = 'cnc' (would normally pick non-guillotine), but a
    // per-thickness override forces 'tidy' for this stock entry.
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
      precision: 1e-5,
    });

    expect(result.leftovers).toEqual([]);
    // Tidy on equal-sized parts → single column. CNC would scatter them.
    const lefts = new Set(
      asSheet(result.layouts[0]).placements.map((p) =>
        Math.round(p.leftM * 1e6),
      ),
    );
    expect(lefts.size).toBe(1);
  });

  it('per-thickness override on any matching StockMatrix row wins', () => {
    // Two StockMatrix rows share material+thickness — one with the override,
    // one without. Engine must pick the defined override regardless of which
    // row sorts first by area.
    const stockWithOverrideOnSecondEntry = [
      {
        kind: 'sheet' as const,
        material: 'Plywood',
        // Larger area — will sort first.
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
      defaultAlgorithm: 'cnc', // Must lose to the per-thickness 'tidy' override.
      precision: 1e-5,
    });

    expect(result.leftovers).toEqual([]);
    expect(result.layouts.every((l) => l.algorithm === 'tidy')).toBe(true);
  });

  it('is deterministic in auto mode', () => {
    const config: Config = {
      bladeWidth: 0,
      margin: 0,
      defaultAlgorithm: 'auto',
      precision: 1e-5,
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
