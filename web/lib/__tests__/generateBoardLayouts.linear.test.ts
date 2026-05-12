import { describe, expect, it } from 'vitest';
import {
  generateBoardLayouts,
  isLinearBoardLayout,
  isLinearStock,
  reduceStockMatrix,
  type BoardLayout,
  type Config,
  type LinearBoardLayout,
  type LinearStock,
  type PartToCut,
  type SheetBoardLayout,
  type Stock,
  type StockMatrix,
} from '..';

const baseConfig: Config = {
  bladeWidth: 3.175,
  margin: 0,
  defaultAlgorithm: 'auto',
  placementEpsilon: 1e-5,
};

// Cross-section: 1.5" × 3.5" → 0.0381m × 0.0889m. We keep the round numbers
// in mm at the StockMatrix boundary and trust `mmToM` to do the conversion.
const CSW_MM = 38.1;
const CST_MM = 88.9;
const CSW_M = CSW_MM / 1000;
const CST_M = CST_MM / 1000;

function makeLinearPart(
  partNumber: number,
  lengthM: number,
  material = 'Pine 2x4',
  widthM = CSW_M,
  thicknessM = CST_M,
): PartToCut {
  return {
    partNumber,
    instanceNumber: 1,
    name: `Part ${partNumber}`,
    material,
    size: { width: widthM, length: lengthM, thickness: thicknessM },
  };
}

function asLinear(layout: BoardLayout): LinearBoardLayout {
  if (!isLinearBoardLayout(layout))
    throw new Error('expected linear board layout, got sheet');
  return layout;
}

function asSheet(layout: BoardLayout): SheetBoardLayout {
  if (isLinearBoardLayout(layout))
    throw new Error('expected sheet board layout, got linear');
  return layout;
}

function isLinear(s: Stock): s is LinearStock {
  return isLinearStock(s);
}

describe('generateBoardLayouts — linear routing', () => {
  it('produces a single linear layout for two parts that fit on one stick', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: CSW_MM,
          crossSectionThickness: CST_MM,
          lengths: [2440],
        },
      },
    ];
    const parts = [makeLinearPart(1, 1.0), makeLinearPart(2, 1.0)];
    const result = generateBoardLayouts(parts, stock, {
      ...baseConfig,
      bladeWidth: 0,
    });

    expect(result.leftovers).toEqual([]);
    expect(result.layouts).toHaveLength(1);
    const layout = asLinear(result.layouts[0]);
    expect(layout.kind).toBe('linear');
    expect(layout.placements).toHaveLength(2);
    // FFD: identical lengths land back-to-back from offset 0.
    expect(layout.placements[0].offsetM).toBeCloseTo(0, 6);
    expect(layout.placements[1].offsetM).toBeCloseTo(1.0, 6);
  });

  it('serialises widthM and thicknessM on each linear placement so BOM and hover can resolve the part', () => {
    // Regression guard: BOM rows and the Model-tab hover→info resolver
    // both read placements through `groupPartsByNumber` and expect a
    // BoardLayoutLeftover-shaped record (partNumber + dimensions). Without
    // these fields, linear-routed parts vanish from the BOM and produce
    // a blank hover popover.
    const stock: StockMatrix[] = [
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: CSW_MM,
          crossSectionThickness: CST_MM,
          lengths: [2440],
        },
      },
    ];
    const parts = [makeLinearPart(7, 1.0)];
    const result = generateBoardLayouts(parts, stock, baseConfig);
    const layout = asLinear(result.layouts[0]);
    const placement = layout.placements[0];

    expect(placement.widthM).toBeCloseTo(CSW_M, 6);
    expect(placement.thicknessM).toBeCloseTo(CST_M, 6);
    expect(placement.partNumber).toBe(7);
    expect(placement.material).toBe('Pine 2x4');
  });

  it('prefers shorter sticks when both meet the demand', () => {
    // Both 2440mm and 4880mm available. A single 2440mm stick fits all parts,
    // so the result should land on the shorter stick after stock minimization.
    const stock: StockMatrix[] = [
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: CSW_MM,
          crossSectionThickness: CST_MM,
          lengths: [2440, 4880],
        },
      },
    ];
    const parts = [makeLinearPart(1, 1.0), makeLinearPart(2, 1.0)];
    const result = generateBoardLayouts(parts, stock, {
      ...baseConfig,
      bladeWidth: 0,
    });

    expect(result.leftovers).toEqual([]);
    expect(result.layouts).toHaveLength(1);
    const layout = asLinear(result.layouts[0]);
    expect(layout.stock.lengthM).toBeCloseTo(2.44, 6);
  });

  it('mixes sheet and linear layouts in a single project', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: CSW_MM,
          crossSectionThickness: CST_MM,
          lengths: [2440],
        },
      },
    ];
    const sheetPart: PartToCut = {
      partNumber: 1,
      instanceNumber: 1,
      name: 'panel',
      material: 'MDF',
      size: { width: 0.6, length: 0.4, thickness: 0.018 },
    };
    const linearPart = makeLinearPart(2, 1.0);

    const result = generateBoardLayouts([sheetPart, linearPart], stock, {
      ...baseConfig,
      bladeWidth: 0,
    });

    expect(result.leftovers).toEqual([]);
    expect(result.layouts).toHaveLength(2);
    const sheetLayout = result.layouts.find((l) => !isLinearBoardLayout(l));
    const linearLayout = result.layouts.find((l) => isLinearBoardLayout(l));
    expect(sheetLayout).toBeDefined();
    expect(linearLayout).toBeDefined();
    expect(asSheet(sheetLayout!).stock.material).toBe('MDF');
    expect(asLinear(linearLayout!).stock.material).toBe('Pine 2x4');
  });

  it('routes parts to the matching cross-section when two linear materials exist', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: CSW_MM,
          crossSectionThickness: CST_MM,
          lengths: [2440],
        },
      },
      {
        kind: 'linear',
        material: 'Pine 2x6',
        // 1.5" × 5.5"
        size: {
          crossSectionWidth: 38.1,
          crossSectionThickness: 139.7,
          lengths: [2440],
        },
      },
    ];
    const partOnTwoBy4 = makeLinearPart(1, 1.0, 'Pine 2x4', CSW_M, CST_M);
    const partOnTwoBy6 = makeLinearPart(2, 1.0, 'Pine 2x6', 0.0381, 0.1397);

    const result = generateBoardLayouts([partOnTwoBy4, partOnTwoBy6], stock, {
      ...baseConfig,
      bladeWidth: 0,
    });

    expect(result.leftovers).toEqual([]);
    expect(result.layouts).toHaveLength(2);
    const twoBy4 = result.layouts
      .filter(isLinearBoardLayout)
      .find((l) => l.stock.material === 'Pine 2x4');
    const twoBy6 = result.layouts
      .filter(isLinearBoardLayout)
      .find((l) => l.stock.material === 'Pine 2x6');
    expect(twoBy4?.placements.map((p) => p.partNumber)).toEqual([1]);
    expect(twoBy6?.placements.map((p) => p.partNumber)).toEqual([2]);
  });

  it('surfaces a part with a non-matching cross-section as a leftover', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: CSW_MM,
          crossSectionThickness: CST_MM,
          lengths: [2440],
        },
      },
    ];
    // Same material, wrong cross-section (2x6 dimensions on a 2x4-only project).
    const oddPart = makeLinearPart(1, 1.0, 'Pine 2x4', 0.0381, 0.1397);
    const result = generateBoardLayouts([oddPart], stock, {
      ...baseConfig,
      bladeWidth: 0,
    });

    expect(result.layouts).toHaveLength(0);
    expect(result.leftovers).toHaveLength(1);
    expect(result.leftovers[0].partNumber).toBe(1);
  });

  it('subtracts one kerf from the trailing offcut — the cut that frees it is a real loss', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: CSW_MM,
          crossSectionThickness: CST_MM,
          lengths: [2400],
        },
      },
    ];
    const kerfMm = 3.175;
    const kerfM = kerfMm / 1000;
    const result = generateBoardLayouts([makeLinearPart(1, 1.0)], stock, {
      ...baseConfig,
      bladeWidth: kerfMm,
    });

    expect(asLinear(result.layouts[0]).wasteEndM).toBeCloseTo(
      2.4 - 1.0 - kerfM,
      6,
    );
  });

  it('accounts for kerf between consecutive cuts on a stick', () => {
    const stock: StockMatrix[] = [
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: CSW_MM,
          crossSectionThickness: CST_MM,
          lengths: [2440],
        },
      },
    ];
    const kerfMm = 3.175;
    const kerfM = kerfMm / 1000;
    const parts = [
      makeLinearPart(1, 0.5),
      makeLinearPart(2, 0.5),
      makeLinearPart(3, 0.5),
    ];
    const result = generateBoardLayouts(parts, stock, {
      ...baseConfig,
      bladeWidth: kerfMm,
    });

    expect(result.leftovers).toEqual([]);
    expect(result.layouts).toHaveLength(1);
    const layout = asLinear(result.layouts[0]);
    expect(layout.placements).toHaveLength(3);
    // First cut starts at 0; subsequent placements offset by previous length + kerf.
    expect(layout.placements[0].offsetM).toBeCloseTo(0, 6);
    expect(layout.placements[1].offsetM).toBeCloseTo(0.5 + kerfM, 6);
    expect(layout.placements[2].offsetM).toBeCloseTo(2 * (0.5 + kerfM), 6);
  });

  it('reduceStockMatrix: expands a linear row into one LinearStock per length', () => {
    const expanded = reduceStockMatrix([
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: CSW_MM,
          crossSectionThickness: CST_MM,
          lengths: [2440, 3050, 4880],
        },
      },
    ]);
    const linear = expanded.filter(isLinear);
    expect(linear).toHaveLength(3);
    expect(linear.map((s) => s.length).sort((a, b) => a - b)).toEqual([
      2.44, 3.05, 4.88,
    ]);
    expect(linear.every((s) => s.crossSectionWidth === CSW_M)).toBe(true);
  });
});
