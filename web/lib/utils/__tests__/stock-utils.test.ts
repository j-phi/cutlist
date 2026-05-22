import { describe, it, expect } from 'vitest';
import { areStocksEquivalent, canPartFitStock } from '../stock-utils';
import { mmToUm, STOCK_MATCH_TOLERANCE_UM, type Micrometres } from '../units';
import type { LinearStock, Stock, PartToCut } from '../../types';

function makeStock(material: string, thicknessUm: Micrometres): Stock {
  return {
    kind: 'sheet',
    material,
    thickness: thicknessUm,
    width: mmToUm(600),
    length: mmToUm(2400),
    role: 'general',
  };
}

function makePart(material: string, thicknessUm: Micrometres): PartToCut {
  return {
    partNumber: 1,
    instanceNumber: 1,
    name: 'Test Part',
    material,
    size: {
      width: mmToUm(300),
      length: mmToUm(600),
      thickness: thicknessUm,
    },
  };
}

describe('canPartFitStock', () => {
  it('matches when material and thickness agree', () => {
    expect(
      canPartFitStock(
        makeStock('Plywood', mmToUm(18)),
        makePart('Plywood', mmToUm(18)),
      ),
    ).toBe(true);
  });

  it('rejects on material mismatch', () => {
    expect(
      canPartFitStock(
        makeStock('MDF', mmToUm(18)),
        makePart('Plywood', mmToUm(18)),
      ),
    ).toBe(false);
  });

  it('accepts thickness drift within tolerance, rejects past it', () => {
    const stock = makeStock('Plywood', mmToUm(12));
    const within = (mmToUm(12) - STOCK_MATCH_TOLERANCE_UM) as Micrometres;
    const over = (mmToUm(12) - STOCK_MATCH_TOLERANCE_UM - 1) as Micrometres;
    expect(canPartFitStock(stock, makePart('Plywood', within))).toBe(true);
    expect(canPartFitStock(stock, makePart('Plywood', over))).toBe(false);
  });
});

describe('canPartFitStock — linear with oversize', () => {
  const stock = (overrides: Partial<LinearStock> = {}): LinearStock => ({
    kind: 'linear',
    material: 'Pine',
    crossSectionWidth: mmToUm(70),
    crossSectionThickness: mmToUm(45),
    length: mmToUm(2400),
    role: 'general',
    ...overrides,
  });
  const part = (
    widthMm: number,
    thicknessMm: number,
    lengthMm: number,
  ): PartToCut => ({
    partNumber: 1,
    instanceNumber: 1,
    name: 'p',
    material: 'Pine',
    size: {
      width: mmToUm(widthMm),
      thickness: mmToUm(thicknessMm),
      length: mmToUm(lengthMm),
    },
  });

  it('accepts a finished part when allowance closes the cross-section gap', () => {
    expect(
      canPartFitStock(
        stock({ oversize: { length: mmToUm(0), crossSection: mmToUm(4) } }),
        part(66, 41, 1500),
      ),
    ).toBe(true);
    expect(
      canPartFitStock(
        stock({ oversize: { length: mmToUm(0), crossSection: mmToUm(2) } }),
        part(66, 41, 1500),
      ),
    ).toBe(false);
  });

  it('reserves stock length for the part length allowance', () => {
    const s = stock({
      length: mmToUm(2000),
      oversize: { length: mmToUm(25), crossSection: mmToUm(0) },
    });
    expect(canPartFitStock(s, part(70, 45, 1980))).toBe(false);
    expect(canPartFitStock(s, part(70, 45, 1970))).toBe(true);
  });

  it('treats absent oversize as zero allowance', () => {
    expect(canPartFitStock(stock(), part(70, 45, 1500))).toBe(true);
    expect(canPartFitStock(stock(), part(66, 45, 1500))).toBe(false);
  });
});

describe('areStocksEquivalent', () => {
  it('matches sheets with the same material and thickness', () => {
    expect(
      areStocksEquivalent(
        makeStock('Plywood', mmToUm(18)),
        makeStock('Plywood', mmToUm(18)),
      ),
    ).toBe(true);
  });

  it('rejects across materials', () => {
    expect(
      areStocksEquivalent(
        makeStock('Plywood', mmToUm(18)),
        makeStock('MDF', mmToUm(18)),
      ),
    ).toBe(false);
  });
});
