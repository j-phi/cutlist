/**
 * Snap threshold appropriate for workshop measurement (half a 32nd of an
 * inch, ≈ 0.4 mm). Display formatters pass this so that 22.5 mm renders as
 * "7/8\"" — what the woodworker marks on the wood — instead of a raw
 * float. Input formatters keep the strict default so user-typed precision
 * survives the round-trip.
 */
export const WOODWORKER_FRACTION_THRESHOLD = 1 / 64;

/**
 * Render a decimal as a fractional string, rounded to the nearest 1/32.
 * If the value is within `threshold` of a 1/32 fraction it snaps; otherwise
 * it falls back to a 5-decimal-place number. The default `1e-5` only snaps
 * exact fractions; callers wanting workshop-friendly output should pass
 * `WOODWORKER_FRACTION_THRESHOLD`.
 */
export function toFraction(value: number, threshold = 1e-5): string {
  const integerPart = Math.floor(value);
  const decimalPart = value - integerPart;

  let minDifference = Infinity;
  let closestFraction = '';
  for (const [fractionDecimal, fractionString] of fractionLookupTable) {
    const difference = Math.abs(decimalPart - fractionDecimal);
    if (difference < minDifference) {
      minDifference = difference;
      closestFraction = fractionString;
    }
  }

  if (minDifference <= threshold) {
    if (integerPart === 0) return closestFraction;
    return `${integerPart} ${closestFraction}`;
  }
  // Not close enough to snap. Whole numbers and non-fraction decimals share
  // the same 5dp-trimmed path — never returns the raw float.
  return Number(value.toFixed(5)).toString();
}

const fractionLookupTable = new Map<number, string>([
  [1 / 32, '1/32'],
  [1 / 16, '1/16'], // Simplified from 2/32
  [3 / 32, '3/32'],
  [1 / 8, '1/8'], // Simplified from 4/32
  [5 / 32, '5/32'],
  [3 / 16, '3/16'], // Simplified from 6/32
  [7 / 32, '7/32'],
  [1 / 4, '1/4'], // Simplified from 8/32
  [9 / 32, '9/32'],
  [5 / 16, '5/16'], // Simplified from 10/32
  [11 / 32, '11/32'],
  [3 / 8, '3/8'], // Simplified from 12/32
  [13 / 32, '13/32'],
  [7 / 16, '7/16'], // Simplified from 14/32
  [15 / 32, '15/32'],
  [1 / 2, '1/2'], // Simplified from 16/32
  [17 / 32, '17/32'],
  [9 / 16, '9/16'], // Simplified from 18/32
  [19 / 32, '19/32'],
  [5 / 8, '5/8'], // Simplified from 20/32
  [21 / 32, '21/32'],
  [11 / 16, '11/16'], // Simplified from 22/32
  [23 / 32, '23/32'],
  [3 / 4, '3/4'], // Simplified from 24/32
  [25 / 32, '25/32'],
  [13 / 16, '13/16'], // Simplified from 26/32
  [27 / 32, '27/32'],
  [7 / 8, '7/8'], // Simplified from 28/32
  [29 / 32, '29/32'],
  [15 / 16, '15/16'], // Simplified from 30/32
  [31 / 32, '31/32'],
]);

/** Inches per millimeter — single source of truth for the 25.4 constant. */
const MM_PER_IN = 25.4;

/**
 * Convert a distance between mm and inches. Pure number math; the only
 * place in the codebase that hardcodes the inch/mm ratio.
 */
export function convertUnits(
  value: number,
  from: 'mm' | 'in',
  to: 'mm' | 'in',
): number {
  if (from === to) return value;
  return from === 'mm' ? value / MM_PER_IN : value * MM_PER_IN;
}

/**
 * Parse a user-entered dimension string into a number expressed in `unit`.
 *
 * Imperial input is forgiving: bare numbers, decimals, fractions ("3/4"),
 * mixed numbers ("1 1/2", "1-1/2"), feet+inches ("1' 6\"", "1ft 6in"),
 * and trailing unit glyphs (`"`, `″`, `in`, `ft`, `'`) are all accepted.
 * Metric input is plain decimals (with optional "mm" suffix).
 *
 * Returns null on empty or unparseable input. Never returns a negative
 * or non-finite number.
 */
export function parseDimension(
  raw: string | null | undefined,
  unit: 'mm' | 'in',
): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;

  if (unit === 'mm') {
    const n = Number(s.replace(/\s*mm$/i, ''));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  return parseInches(s);
}

function parseInches(raw: string): number | null {
  // Strip inch glyphs/suffix; feet glyph stays so the regex below can split.
  const cleaned = raw
    .replace(/[″"]/g, '')
    .replace(/\s*in\b/gi, '')
    .trim();
  if (cleaned === '') return null;

  // Optional feet prefix: "4ft" or "8'".
  const ft = cleaned.match(/^([\d.]+)\s*(?:ft|')\s*(.*)$/i);
  const feet = ft ? Number(ft[1]) : 0;
  const rest = (ft ? ft[2] : cleaned).trim();
  if (!Number.isFinite(feet)) return null;
  if (rest === '') return feet * 12;

  // Inches: optional whole-number prefix + fraction, or a plain decimal.
  const frac = rest.match(/^(?:(\d+)[\s-]+)?(\d+)\/(\d+)$/);
  if (frac) {
    const whole = frac[1] ? Number(frac[1]) : 0;
    const den = Number(frac[3]);
    if (den === 0) return null;
    return feet * 12 + whole + Number(frac[2]) / den;
  }

  const n = Number(rest);
  return Number.isFinite(n) && n >= 0 ? feet * 12 + n : null;
}

/**
 * Pretty-print a value (in the given unit) for pre-filling an editable
 * text input. Inches render as fractions when the value is essentially an
 * exact fraction (`"3/4"`, `"1 1/2"`); otherwise as a 4-decimal number.
 * mm renders as a trimmed 3-decimal number.
 *
 * `toFraction` is also used by the display formatters, where preserving
 * full precision matters; here we trade precision for legibility because
 * a 16-digit decimal in an editable input is unusable.
 */
export function formatDimensionForInput(
  value: number | null | undefined,
  unit: 'mm' | 'in',
): string {
  if (value == null || !Number.isFinite(value)) return '';
  if (unit === 'mm') return String(Number(value.toFixed(3)));
  const formatted = toFraction(value);
  // toFraction returns either a fraction string or a raw decimal. The raw
  // decimal can be unbounded precision (e.g. metric-rooted values), which
  // is too noisy for an input — cap it.
  if (formatted.includes('/')) return formatted;
  return String(Number(value.toFixed(4)));
}

export class Distance {
  readonly m: number;

  constructor(v: number | string) {
    if (typeof v === 'number') {
      this.m = v;
    } else if (v.endsWith('ft')) {
      this.m = Number(v.replace('ft', '')) * 0.3048;
    } else if (v.endsWith('in') || v.endsWith('"')) {
      this.m = Number(v.replace(/(in|")/, '')) * 0.0254;
    } else if (v.endsWith('mm')) {
      this.m = Number(v.replace('mm', '')) / 1000;
    } else {
      this.m = Number(v.replace('m', ''));
    }
    if (isNaN(this.m)) {
      throw Error('Could not convert to meters: ' + v);
    }
  }

  get mm() {
    return this.m * 1000;
  }
  get in() {
    return this.m * 39.37008;
  }
  get ft() {
    return this.m * 3.28084;
  }
}
