import { describe, it, expect } from 'vitest';
import {
  convertUnits,
  formatDistance,
  formatValue,
  parseDimension,
  toCanonicalM,
  toCanonicalMm,
  toFraction,
  type Precision,
} from '../units';

const FRACTION_8: Precision = { kind: 'fraction', denominator: 8 };
const FRACTION_16: Precision = { kind: 'fraction', denominator: 16 };
const FRACTION_32: Precision = { kind: 'fraction', denominator: 32 };
const DECIMAL_01: Precision = { kind: 'decimal', step: 0.1 };
const DECIMAL_001: Precision = { kind: 'decimal', step: 0.01 };
const DECIMAL_05: Precision = { kind: 'decimal', step: 0.5 };

describe('Unit Utils', () => {
  describe('toFraction', () => {
    it('rounds to nearest 1/denominator, reduces to lowest terms, drops zero numerators', () => {
      expect(toFraction(0.5, 32)).toBe('1/2');
      expect(toFraction(0.5, 64)).toBe('1/2');
      expect(toFraction(2, 32)).toBe('2');
      expect(toFraction(3 + 1 / 8, 32)).toBe('3 1/8');
      // 0.886 → 7/8 at 1/32, 57/64 at 1/64.
      expect(toFraction(0.886, 32)).toBe('7/8');
      expect(toFraction(0.886, 64)).toBe('57/64');
    });
  });

  describe('toCanonicalMm', () => {
    it('rounds inch-source values to 0.001 mm, killing FP slop', () => {
      // Raw 3.5 * 25.4 = 88.89999999999999. Cleaned: exactly 88.9.
      expect(toCanonicalMm(3.5, 'in')).toBe(88.9);
      expect(toCanonicalMm(1.5, 'in')).toBe(38.1);
      expect(toCanonicalMm(96, 'in')).toBe(2438.4);
    });

    it('preserves precise inch values like 1/8″ = 3.175 mm exactly', () => {
      expect(toCanonicalMm(0.125, 'in')).toBe(3.175);
    });
  });

  describe('toCanonicalM', () => {
    it('produces bit-equal doubles for the same dim via different paths', () => {
      const fromMmCanonical = toCanonicalMm(48, 'in') / 1000;
      expect(toCanonicalM(48 * 0.0254)).toBe(fromMmCanonical);
      expect(toCanonicalM(1.2192)).toBe(fromMmCanonical);
    });
  });

  describe('parseDimension (mm)', () => {
    it.each<[string | null | undefined, number | null]>([
      ['12', 12],
      ['12.5', 12.5],
      ['  18  ', 18],
      ['18mm', 18],
      ['18 mm', 18],
      ['', null],
      ['abc', null],
      ['-1', null],
      ['1/2', null],
      ['1e308', null], // beyond MAX_DIMENSION
      [null, null],
    ])('%s -> %s', (input, expected) => {
      expect(parseDimension(input, 'mm')).toBe(expected);
    });
  });

  describe('parseDimension (in)', () => {
    it.each<[string, number]>([
      ['1', 1],
      ['1.5', 1.5],
      ['3/4', 0.75],
      ['1 1/2', 1.5],
      ['1-1/2', 1.5],
      ['1 3/8', 1.375],
      ['3/4"', 0.75],
      ['3/4in', 0.75],
      ['12"', 12],
      ['1ft', 12],
      ["8'", 96],
      ['1\' 6"', 18],
      ['1\'6"', 18],
      ['4\' 0"', 48],
      ['1ft 6in', 18],
      ['  1 1/2  ', 1.5],
    ])('%s -> %s', (input, expected) => {
      expect(parseDimension(input, 'in')).toBeCloseTo(expected, 6);
    });

    it.each<string>(['', 'abc', '1/0', '-3/4', '1//2', '1.5 1/2'])(
      '%s -> null',
      (input) => {
        expect(parseDimension(input, 'in')).toBeNull();
      },
    );
  });

  describe('formatValue (inches, fraction precision)', () => {
    it('renders clean fractions', () => {
      expect(formatValue(0.75, 'in', FRACTION_32)).toBe('3/4');
      expect(formatValue(1.5, 'in', FRACTION_32)).toBe('1 1/2');
      expect(formatValue(48, 'in', FRACTION_32)).toBe('48');
    });

    it('rounds off-fraction values to the chosen denominator', () => {
      // 0.6 snaps differently depending on denominator precision.
      expect(formatValue(0.6, 'in', FRACTION_8)).toBe('5/8'); // 0.625
      expect(formatValue(0.6, 'in', FRACTION_16)).toBe('5/8'); // 10/16
      expect(formatValue(0.6, 'in', FRACTION_32)).toBe('19/32'); // 0.59375
    });
  });

  describe('formatValue (mm and decimal precision)', () => {
    it('renders mm at the configured step, trimming trailing zeros', () => {
      expect(formatValue(18, 'mm', DECIMAL_01)).toBe('18');
      expect(formatValue(18.49, 'mm', DECIMAL_01)).toBe('18.5');
      expect(formatValue(18.5, 'mm', DECIMAL_05)).toBe('18.5');
      expect(formatValue(18.7, 'mm', DECIMAL_05)).toBe('18.5');
    });

    it('renders inches in decimal mode when the user picks decimal', () => {
      expect(formatValue(1.5, 'in', DECIMAL_001)).toBe('1.5');
      expect(formatValue(1.4961, 'in', DECIMAL_001)).toBe('1.5');
    });
  });

  describe('formatValue edge cases', () => {
    it('returns empty string for null/undefined/non-finite', () => {
      expect(formatValue(null, 'in', FRACTION_32)).toBe('');
      expect(formatValue(undefined, 'mm', DECIMAL_01)).toBe('');
      expect(formatValue(NaN, 'in', FRACTION_32)).toBe('');
    });
  });

  describe('formatDistance', () => {
    it('appends the unit suffix', () => {
      expect(formatDistance(0.0254 * 1.5, 'in', FRACTION_32)).toBe('1 1/2"');
      expect(formatDistance(0.0381, 'mm', DECIMAL_01)).toBe('38.1mm');
    });
  });

  describe('convertUnits', () => {
    it('scales by 25.4 and round-trips losslessly', () => {
      expect(convertUnits(25.4, 'mm', 'in')).toBeCloseTo(1, 10);
      expect(convertUnits(1, 'in', 'mm')).toBeCloseTo(25.4, 10);
      const inches = 3 + 7 / 8;
      expect(
        convertUnits(convertUnits(inches, 'in', 'mm'), 'mm', 'in'),
      ).toBeCloseTo(inches, 10);
    });
  });
});
