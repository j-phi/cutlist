import { describe, it, expect } from 'vitest';
import { areStocksEquivalent, canPartFitStock } from '../stock-utils';
import type { LinearStock, Stock, PartToCut } from '../../types';

const EPSILON = 1e-5;

// Helpers to build minimal fixture objects

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
  it('returns true when thickness and material both match', () => {
    expect(
      canPartFitStock(
        makeStock('Plywood', 0.018),
        makePart('Plywood', 0.018),
        EPSILON,
      ),
    ).toBe(true);
  });

  it('returns false when material does not match', () => {
    expect(
      canPartFitStock(
        makeStock('MDF', 0.018),
        makePart('Plywood', 0.018),
        EPSILON,
      ),
    ).toBe(false);
  });

  it('returns false when thickness does not match', () => {
    expect(
      canPartFitStock(
        makeStock('Plywood', 0.018),
        makePart('Plywood', 0.012),
        EPSILON,
      ),
    ).toBe(false);
  });

  it('accepts thickness differences within epsilon', () => {
    const base = 0.018;
    const slightlyOff = base + base * (EPSILON / 2);
    expect(
      canPartFitStock(
        makeStock('Plywood', base),
        makePart('Plywood', slightlyOff),
        EPSILON,
      ),
    ).toBe(true);
  });
});

describe('canPartFitStock — linear with oversize', () => {
  const makeStock = (overrides: Partial<LinearStock> = {}): LinearStock => ({
    kind: 'linear',
    material: 'Pine',
    crossSectionWidth: 0.07,
    crossSectionThickness: 0.045,
    length: 2.4,
    ...overrides,
  });
  const makePart = (w: number, t: number, l: number): PartToCut => ({
    partNumber: 1,
    instanceNumber: 1,
    name: 'p',
    material: 'Pine',
    size: { width: w, thickness: t, length: l },
  });

  it('accepts a finished part when stock has a matching cross-section allowance', () => {
    // 66×41 part on 70×45 stock with 4 mm plane-down: fits.
    expect(
      canPartFitStock(
        makeStock({ oversize: { length: 0, crossSection: 0.004 } }),
        makePart(0.066, 0.041, 1.5),
        EPSILON,
      ),
    ).toBe(true);
    // Same part, only 2 mm allowance: does not fit.
    expect(
      canPartFitStock(
        makeStock({ oversize: { length: 0, crossSection: 0.002 } }),
        makePart(0.066, 0.041, 1.5),
        EPSILON,
      ),
    ).toBe(false);
  });

  it('reserves stock length for the part length allowance', () => {
    const stock = makeStock({
      length: 2.0,
      oversize: { length: 0.025, crossSection: 0 },
    });
    expect(canPartFitStock(stock, makePart(0.07, 0.045, 1.98), EPSILON)).toBe(
      false,
    );
    expect(canPartFitStock(stock, makePart(0.07, 0.045, 1.97), EPSILON)).toBe(
      true,
    );
  });

  it('treats absent oversize as zero allowance (regression)', () => {
    const stock = makeStock();
    expect(canPartFitStock(stock, makePart(0.07, 0.045, 1.5), EPSILON)).toBe(
      true,
    );
    expect(canPartFitStock(stock, makePart(0.066, 0.045, 1.5), EPSILON)).toBe(
      false,
    );
  });
});

describe('areStocksEquivalent', () => {
  it('returns true when both thickness and material match', () => {
    expect(
      areStocksEquivalent(
        makeStock('Plywood', 0.018),
        makeStock('Plywood', 0.018),
        EPSILON,
      ),
    ).toBe(true);
  });

  it('returns false when material differs', () => {
    expect(
      areStocksEquivalent(
        makeStock('Plywood', 0.018),
        makeStock('MDF', 0.018),
        EPSILON,
      ),
    ).toBe(false);
  });
});
