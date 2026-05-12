import { describe, it, expect } from 'vitest';
import { areStocksEquivalent, canPartFitStock } from '../stock-utils';
import { STOCK_MATCH_TOLERANCE_M } from '../units';
import type { LinearStock, Stock, PartToCut } from '../../types';

function makeStock(material: string, thickness: number): Stock {
  return { kind: 'sheet', material, thickness, width: 0.6, length: 2.4 };
}

function makePart(material: string, thickness: number): PartToCut {
  return {
    partNumber: 1,
    instanceNumber: 1,
    name: 'Test Part',
    material,
    size: { width: 0.3, length: 0.6, thickness },
  };
}

describe('canPartFitStock', () => {
  it('matches when material and thickness agree', () => {
    expect(
      canPartFitStock(makeStock('Plywood', 0.018), makePart('Plywood', 0.018)),
    ).toBe(true);
  });

  it('rejects on material mismatch', () => {
    expect(
      canPartFitStock(makeStock('MDF', 0.018), makePart('Plywood', 0.018)),
    ).toBe(false);
  });

  // Regression: OBB face-normal clustering drifts by µm between mesh
  // instances; the cluster leader lands just below nominal stock (e.g.
  // 11.99913 mm vs 12 mm). A relative-epsilon match used to reject that.
  it('matches across the µm-scale drift that OBB introduces', () => {
    const stock = makeStock('Plywood', 0.012);
    expect(canPartFitStock(stock, makePart('Plywood', 0.01199913))).toBe(true);
    expect(canPartFitStock(stock, makePart('Plywood', 0.01200087))).toBe(true);
  });

  it('rejects past the absolute tolerance', () => {
    const stock = makeStock('Plywood', 0.012);
    const offBy = STOCK_MATCH_TOLERANCE_M + 1e-6;
    expect(canPartFitStock(stock, makePart('Plywood', 0.012 - offBy))).toBe(
      false,
    );
    expect(canPartFitStock(stock, makePart('Plywood', 0.012 + offBy))).toBe(
      false,
    );
  });
});

describe('canPartFitStock — linear with oversize', () => {
  const stock = (overrides: Partial<LinearStock> = {}): LinearStock => ({
    kind: 'linear',
    material: 'Pine',
    crossSectionWidth: 0.07,
    crossSectionThickness: 0.045,
    length: 2.4,
    ...overrides,
  });
  const part = (w: number, t: number, l: number): PartToCut => ({
    partNumber: 1,
    instanceNumber: 1,
    name: 'p',
    material: 'Pine',
    size: { width: w, thickness: t, length: l },
  });

  it('accepts a finished part when allowance closes the cross-section gap', () => {
    expect(
      canPartFitStock(
        stock({ oversize: { length: 0, crossSection: 0.004 } }),
        part(0.066, 0.041, 1.5),
      ),
    ).toBe(true);
    expect(
      canPartFitStock(
        stock({ oversize: { length: 0, crossSection: 0.002 } }),
        part(0.066, 0.041, 1.5),
      ),
    ).toBe(false);
  });

  it('reserves stock length for the part length allowance', () => {
    const s = stock({
      length: 2.0,
      oversize: { length: 0.025, crossSection: 0 },
    });
    expect(canPartFitStock(s, part(0.07, 0.045, 1.98))).toBe(false);
    expect(canPartFitStock(s, part(0.07, 0.045, 1.97))).toBe(true);
  });

  it('treats absent oversize as zero allowance', () => {
    expect(canPartFitStock(stock(), part(0.07, 0.045, 1.5))).toBe(true);
    expect(canPartFitStock(stock(), part(0.066, 0.045, 1.5))).toBe(false);
  });
});

describe('areStocksEquivalent', () => {
  it('matches sheets with the same material and thickness', () => {
    expect(
      areStocksEquivalent(
        makeStock('Plywood', 0.018),
        makeStock('Plywood', 0.018),
      ),
    ).toBe(true);
  });

  it('rejects across materials', () => {
    expect(
      areStocksEquivalent(makeStock('Plywood', 0.018), makeStock('MDF', 0.018)),
    ).toBe(false);
  });
});
