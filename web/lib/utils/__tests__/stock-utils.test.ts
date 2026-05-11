import { describe, it, expect } from 'vitest';
import { areStocksEquivalent, canPartFitStock } from '../stock-utils';
import type { Stock, PartToCut } from '../../types';

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
