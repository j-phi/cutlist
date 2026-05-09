import { describe, it, expect } from 'vitest';
import {
  formatDimensionForInput,
  parseDimension,
  toFraction,
  WOODWORKER_FRACTION_THRESHOLD,
} from '../units';

describe('Unit Utils', () => {
  describe('toFraction (strict, default)', () => {
    it.each([
      [1 / 2, '1/2'],
      [2, '2'],
      [3 + 1 / 8, '3 1/8'],
      [4 + 7 / 32, '4 7/32'],
      // Not within 1e-5 of any 1/32 fraction → 5dp decimal fallback.
      [7.33333, '7.33333'],
      // Bug regression: sub-inch decimals previously leaked raw FP precision.
      [0.8857982442116039, '0.8858'],
    ])('%d -> %s', (input, expected) => {
      expect(toFraction(input)).toBe(expected);
    });
  });

  describe('toFraction (workshop snap)', () => {
    it.each([
      // 22.5 mm and similar metric-origin parts now snap to nearest 1/32.
      [0.8857982442116039, '7/8'],
      [0.7345049616297954, '3/4'],
      [1.32382, '1 5/16'],
      [1.55686, '1 9/16'],
      [3.5, '3 1/2'],
      // Just outside the 1/64 window → still falls back to 5dp.
      [0.9858470278544692, '0.98585'],
      // Whole inches and clean fractions still render the same way.
      [2, '2'],
      [1 / 2, '1/2'],
      [3 + 1 / 8, '3 1/8'],
    ])('%d -> %s', (input, expected) => {
      expect(toFraction(input, WOODWORKER_FRACTION_THRESHOLD)).toBe(expected);
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

  describe('formatDimensionForInput', () => {
    it('renders inches as fractions', () => {
      expect(formatDimensionForInput(0.75, 'in')).toBe('3/4');
      expect(formatDimensionForInput(1.5, 'in')).toBe('1 1/2');
      expect(formatDimensionForInput(48, 'in')).toBe('48');
    });

    it('caps non-fraction inch values at 4 decimals', () => {
      // 38mm / 25.4 = 1.4960629921...
      expect(formatDimensionForInput(38 / 25.4, 'in')).toBe('1.4961');
      // 6mm / 25.4 = 0.2362204724... — used to render at full FP precision.
      expect(formatDimensionForInput(6 / 25.4, 'in')).toBe('0.2362');
      // 254mm / 25.4 = 10 exactly.
      expect(formatDimensionForInput(254 / 25.4, 'in')).toBe('10');
    });

    it('renders mm as trimmed decimals', () => {
      expect(formatDimensionForInput(18, 'mm')).toBe('18');
      expect(formatDimensionForInput(18.5, 'mm')).toBe('18.5');
      expect(formatDimensionForInput(18.0001, 'mm')).toBe('18');
    });

    it('returns empty string for null/undefined', () => {
      expect(formatDimensionForInput(null, 'in')).toBe('');
      expect(formatDimensionForInput(undefined, 'mm')).toBe('');
    });
  });
});
