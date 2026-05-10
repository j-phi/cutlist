import { describe, it, expect } from 'vitest';
import {
  convertUnits,
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  formatDistance,
  formatValue,
  parseDimension,
  toFraction,
  type Precision,
} from '../units';

const FRACTION_8: Precision = { kind: 'fraction', denominator: 8 };
const FRACTION_16: Precision = { kind: 'fraction', denominator: 16 };
const FRACTION_32: Precision = { kind: 'fraction', denominator: 32 };
const FRACTION_64: Precision = { kind: 'fraction', denominator: 64 };
const DECIMAL_01: Precision = { kind: 'decimal', step: 0.1 };
const DECIMAL_001: Precision = { kind: 'decimal', step: 0.01 };
const DECIMAL_05: Precision = { kind: 'decimal', step: 0.5 };

describe('Unit Utils', () => {
  describe('toFraction', () => {
    it('rounds to nearest 1/denominator and renders as fraction', () => {
      expect(toFraction(0.5, 32)).toBe('1/2');
      expect(toFraction(2, 32)).toBe('2');
      expect(toFraction(3 + 1 / 8, 32)).toBe('3 1/8');
      expect(toFraction(4 + 7 / 32, 32)).toBe('4 7/32');
      // 22.5 mm → 0.886" rounds to 7/8 at 32-denom precision.
      expect(toFraction(0.886, 32)).toBe('7/8');
      // Same value at finer precision lands on 29/32 (0.886 ≈ 28.35/32).
      expect(toFraction(0.886, 64)).toBe('57/64');
    });

    it('reduces fractions to lowest terms', () => {
      expect(toFraction(0.5, 64)).toBe('1/2');
      expect(toFraction(0.25, 32)).toBe('1/4');
    });

    it('renders whole numbers without a fraction part', () => {
      expect(toFraction(5, 32)).toBe('5');
      expect(toFraction(0, 32)).toBe('0');
    });
  });

  describe('parseDimension (mm)', () => {
    it.each<[string, number | null]>([
      ['12', 12],
      ['12.5', 12.5],
      ['  18  ', 18],
      ['18mm', 18],
      ['18 mm', 18],
      ['', null],
      ['abc', null],
      ['-1', null],
      ['1/2', null],
    ])('%s -> %s', (input, expected) => {
      expect(parseDimension(input, 'mm')).toBe(expected);
    });

    it('returns null for null/undefined input', () => {
      expect(parseDimension(null, 'mm')).toBeNull();
      expect(parseDimension(undefined, 'mm')).toBeNull();
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

    it('rounds an off-fraction value to the nearest 1/denominator', () => {
      // 38 mm = 1.4961 in → rounds to 1 1/2 at 1/32 precision.
      expect(formatValue(38 / 25.4, 'in', FRACTION_32)).toBe('1 1/2');
      // The same value snaps differently at coarser precision.
      expect(formatValue(38 / 25.4, 'in', FRACTION_8)).toBe('1 1/2');
      expect(formatValue(38 / 25.4, 'in', FRACTION_64)).toBe('1 1/2');
    });

    it('honours the user-chosen denominator', () => {
      expect(formatValue(0.6, 'in', FRACTION_8)).toBe('5/8'); // 0.625
      expect(formatValue(0.6, 'in', FRACTION_16)).toBe('5/8'); // 10/16 → 5/8
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
    it('appends the unit suffix and applies precision', () => {
      expect(formatDistance(0.0254, 'in', FRACTION_32)).toBe('1"');
      expect(formatDistance(0.0254 * 1.5, 'in', FRACTION_32)).toBe('1 1/2"');
      expect(formatDistance(0.0381, 'mm', DECIMAL_01)).toBe('38.1mm');
      expect(formatDistance(1.8, 'mm', DECIMAL_01)).toBe('1800mm');
    });
  });

  describe('default precisions', () => {
    it('inch default is 1/32', () => {
      expect(DEFAULT_INCH_PRECISION).toEqual({
        kind: 'fraction',
        denominator: 32,
      });
    });
    it('mm default is 0.1', () => {
      expect(DEFAULT_MM_PRECISION).toEqual({ kind: 'decimal', step: 0.1 });
    });
  });

  describe('convertUnits', () => {
    it('returns the same value when from === to', () => {
      expect(convertUnits(1220, 'mm', 'mm')).toBe(1220);
      expect(convertUnits(48, 'in', 'in')).toBe(48);
    });

    it('mm → in scales by 1/25.4', () => {
      expect(convertUnits(25.4, 'mm', 'in')).toBeCloseTo(1, 10);
      expect(convertUnits(1219.2, 'mm', 'in')).toBeCloseTo(48, 10);
    });

    it('in → mm scales by 25.4', () => {
      expect(convertUnits(1, 'in', 'mm')).toBeCloseTo(25.4, 10);
      expect(convertUnits(48, 'in', 'mm')).toBeCloseTo(1219.2, 10);
    });

    it('round-trips losslessly within float precision', () => {
      const inches = 3 + 7 / 8;
      const mm = convertUnits(inches, 'in', 'mm');
      expect(convertUnits(mm, 'mm', 'in')).toBeCloseTo(inches, 10);
    });
  });
});
