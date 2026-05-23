import { describe, it, expect } from 'vitest';
import {
  generateBoardLayouts,
  isLinearBoardLayout,
  mmToUm,
  mToUm,
  um,
  type BoardLayout,
  type Config,
  type PartToCut,
  type SheetBoardLayout,
  type StockMatrix,
} from '..';

function asSheet(layout: BoardLayout): SheetBoardLayout {
  if (isLinearBoardLayout(layout))
    throw new Error('expected sheet board layout, got linear');
  return layout;
}

function sheetLayouts(layouts: BoardLayout[]): SheetBoardLayout[] {
  return layouts.map(asSheet);
}

const baseConfig: Config = {
  bladeWidth: 0 as Config['bladeWidth'],
  margin: 0 as Config['margin'],
  defaultAlgorithm: 'auto',
  optimizationObjective: 'boards',
};

function makePart(
  partNumber: number,
  widthM: number,
  lengthM: number,
  material = 'MDF',
  thicknessM = 0.018,
): PartToCut {
  return {
    partNumber,
    instanceNumber: 1,
    name: `Part ${partNumber}`,
    material,
    size: {
      thickness: mToUm(thicknessM),
      width: mToUm(widthM),
      length: mToUm(lengthM),
    },
  };
}

describe('generateBoardLayouts edge cases', () => {
  it('puts all parts in leftovers when material is not in stock', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1000, length: 2000, thickness: [18] }],
      },
    ];
    const parts = [
      makePart(1, 0.5, 0.5, 'Unknown'),
      makePart(2, 0.3, 0.3, 'Unknown'),
    ];

    const result = generateBoardLayouts(parts, stock, baseConfig);

    expect(result.layouts).toHaveLength(0);
    expect(result.leftovers).toHaveLength(2);
  });

  it('places parts on the correct stock when multiple materials are present', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1000, length: 2000, thickness: [18] }],
      },
      {
        kind: 'sheet',
        material: 'Plywood',
        sizes: [{ width: 1000, length: 2000, thickness: [18] }],
      },
    ];
    const parts = [
      makePart(1, 0.4, 0.4, 'MDF'),
      makePart(2, 0.4, 0.4, 'Plywood'),
    ];

    const result = generateBoardLayouts(parts, stock, baseConfig);

    expect(result.leftovers).toHaveLength(0);
    expect(result.layouts).toHaveLength(2);

    const materials = result.layouts.map((l) => l.stock.material).sort();
    expect(materials).toEqual(['MDF', 'Plywood']);

    for (const layout of result.layouts) {
      for (const placement of layout.placements) {
        expect(placement.material).toBe(layout.stock.material);
      }
    }
  });

  it('does not place a part that exceeds the effective bin size after margin is applied', () => {
    // Bin is 1m×1m; margin is 10mm → effective area is 0.98m×0.98m
    // Part is 0.995m×0.995m which fits the raw board but not the reduced area
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1000, length: 1000, thickness: [18] }],
      },
    ];
    const configWithMargin: Config = {
      ...baseConfig,
      margin: mmToUm(10),
    };
    const parts = [makePart(1, 0.995, 0.995)];

    const result = generateBoardLayouts(parts, stock, configWithMargin);

    expect(result.leftovers).toHaveLength(1);
    expect(result.layouts).toHaveLength(0);
  });

  it('insets placements from all board edges by the margin', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1000, length: 1000, thickness: [18] }],
      },
    ];
    const marginMm = 50;
    const marginUm = mmToUm(marginMm);
    const boardSpanUm = mmToUm(1000);
    const config: Config = { ...baseConfig, margin: marginUm };
    const parts = [makePart(1, 0.3, 0.3), makePart(2, 0.3, 0.3)];

    const result = generateBoardLayouts(parts, stock, config);

    expect(result.leftovers).toHaveLength(0);
    expect(result.layouts).toHaveLength(1);
    expect(asSheet(result.layouts[0]).marginUm).toBe(marginUm);

    for (const p of asSheet(result.layouts[0]).placements) {
      expect(p.leftUm).toBeGreaterThanOrEqual(marginUm);
      expect(p.bottomUm).toBeGreaterThanOrEqual(marginUm);
      expect(p.rightUm).toBeLessThanOrEqual(boardSpanUm - marginUm);
      expect(p.topUm).toBeLessThanOrEqual(boardSpanUm - marginUm);
    }
  });

  it('sets marginUm to 0 when no margin is configured', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1000, length: 1000, thickness: [18] }],
      },
    ];
    const parts = [makePart(1, 0.3, 0.3)];

    const result = generateBoardLayouts(parts, stock, baseConfig);

    expect(asSheet(result.layouts[0]).marginUm).toBe(0);
  });

  it('returns empty layouts and leftovers for an empty parts list', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1000, length: 2000, thickness: [18] }],
      },
    ];

    const result = generateBoardLayouts([], stock, baseConfig);

    expect(result.layouts).toHaveLength(0);
    expect(result.leftovers).toHaveLength(0);
  });

  it('throws when stock is empty', () => {
    const parts = [makePart(1, 0.5, 0.5)];

    expect(() => generateBoardLayouts(parts, [], baseConfig)).toThrow(
      'You must include at least 1 stock.',
    );
  });

  it('uses two boards when parts do not all fit on one', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 500, length: 500, thickness: [18] }],
      },
    ];
    const parts = [makePart(1, 0.4, 0.4), makePart(2, 0.4, 0.4)];

    const result = generateBoardLayouts(parts, stock, baseConfig);

    expect(result.leftovers).toHaveLength(0);
    expect(result.layouts).toHaveLength(2);
  });

  it('puts a part that is larger than every stock board into leftovers', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 500, length: 500, thickness: [18] }],
      },
    ];
    const parts = [makePart(1, 1, 1)];

    const result = generateBoardLayouts(parts, stock, baseConfig);

    expect(result.leftovers).toHaveLength(1);
    expect(result.leftovers[0].widthUm).toBe(mToUm(1));
    expect(result.leftovers[0].lengthUm).toBe(mToUm(1));
    expect(result.layouts).toHaveLength(0);
  });

  it('produces a deterministic result when searchPasses is set to a single pass', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1000, length: 3000, thickness: [18] }],
      },
    ];
    const config: Config = {
      ...baseConfig,
      defaultAlgorithm: 'auto',
      searchPasses: ['cnc-area'],
    };
    const parts = [
      makePart(1, 0.4, 0.4),
      makePart(2, 0.3, 0.5),
      makePart(3, 0.2, 0.6),
    ];

    const first = generateBoardLayouts(parts, stock, config);
    const second = generateBoardLayouts(parts, stock, config);

    expect(second).toEqual(first);
    expect(first.leftovers).toHaveLength(0);
  });

  it('does not change layouts for material B when grain lock changes on material A', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'Plywood',
        sizes: [{ width: 1200, length: 2400, thickness: [12] }],
      },
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1200, length: 2400, thickness: [18] }],
      },
    ];

    const mdfParts = [
      makePart(1, 0.4, 0.8, 'MDF', 0.018),
      makePart(2, 0.3, 0.6, 'MDF', 0.018),
      makePart(3, 0.5, 0.5, 'MDF', 0.018),
      makePart(4, 0.2, 0.9, 'MDF', 0.018),
    ];

    const plyPartsNoGrain = [
      makePart(10, 0.3, 0.7, 'Plywood', 0.012),
      makePart(11, 0.5, 0.5, 'Plywood', 0.012),
      makePart(12, 0.4, 0.6, 'Plywood', 0.012),
    ];

    const plyPartsWithGrain = plyPartsNoGrain.map((p) => ({
      ...p,
      grainLock: 'length' as const,
    }));

    const resultA = generateBoardLayouts(
      [...mdfParts, ...plyPartsNoGrain],
      stock,
      baseConfig,
    );
    const resultB = generateBoardLayouts(
      [...mdfParts, ...plyPartsWithGrain],
      stock,
      baseConfig,
    );

    const mdfLayoutsA = resultA.layouts.filter(
      (l) => l.stock.material === 'MDF',
    );
    const mdfLayoutsB = resultB.layouts.filter(
      (l) => l.stock.material === 'MDF',
    );

    expect(mdfLayoutsA).toEqual(mdfLayoutsB);
  });

  it('does not change 18mm layouts when grain lock changes on 12mm of the same material', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'Plywood',
        sizes: [{ width: 1200, length: 2400, thickness: [18, 12] }],
      },
    ];

    const ply18Parts = [
      makePart(1, 0.4, 0.8, 'Plywood', 0.018),
      makePart(2, 0.3, 0.6, 'Plywood', 0.018),
      makePart(3, 0.5, 0.5, 'Plywood', 0.018),
    ];

    const ply12NoGrain = [
      makePart(10, 0.3, 0.7, 'Plywood', 0.012),
      makePart(11, 0.5, 0.5, 'Plywood', 0.012),
    ];

    const ply12WithGrain = ply12NoGrain.map((p) => ({
      ...p,
      grainLock: 'length' as const,
    }));

    const resultA = generateBoardLayouts(
      [...ply18Parts, ...ply12NoGrain],
      stock,
      baseConfig,
    );
    const resultB = generateBoardLayouts(
      [...ply18Parts, ...ply12WithGrain],
      stock,
      baseConfig,
    );

    const ply18LayoutsA = sheetLayouts(resultA.layouts).filter(
      (l) => l.stock.thicknessUm === mmToUm(18),
    );
    const ply18LayoutsB = sheetLayouts(resultB.layouts).filter(
      (l) => l.stock.thicknessUm === mmToUm(18),
    );

    expect(ply18LayoutsA).toEqual(ply18LayoutsB);
  });

  it('fits fewer parts when bladeWidth adds kerf gaps between parts', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1000, length: 1000, thickness: [18] }],
      },
    ];

    const noBladeConfig: Config = { ...baseConfig, bladeWidth: um(0) };
    const withBladeConfig: Config = { ...baseConfig, bladeWidth: mmToUm(30) };

    const parts = [
      makePart(1, 0.49, 0.49),
      makePart(2, 0.49, 0.49),
      makePart(3, 0.49, 0.49),
      makePart(4, 0.49, 0.49),
    ];

    const withoutBlade = generateBoardLayouts(parts, stock, noBladeConfig);
    const withBlade = generateBoardLayouts(parts, stock, withBladeConfig);

    expect(withoutBlade.leftovers).toHaveLength(0);
    expect(withoutBlade.layouts).toHaveLength(1);

    expect(withBlade.layouts.length).toBeGreaterThan(
      withoutBlade.layouts.length,
    );
  });

  it('consolidates small parts onto earlier boards via multi-board lookback', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1000, length: 1000, thickness: [18] }],
      },
    ];
    const parts = [
      makePart(1, 0.6, 0.95),
      makePart(2, 0.6, 0.95),
      makePart(3, 0.3, 0.3),
    ];

    const result = generateBoardLayouts(parts, stock, {
      ...baseConfig,
      searchPasses: ['compact-bssf-area'],
    });
    expect(result.leftovers).toHaveLength(0);
    expect(result.layouts.length).toBeLessThanOrEqual(2);
  });
});
