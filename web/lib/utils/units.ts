/** Single source for the 25.4 constant. Derived: M_PER_IN. */
export const MM_PER_IN = 25.4;
export const M_PER_IN = MM_PER_IN / 1000;

/**
 * Integer micrometres — the engine and storage domain. Brand makes
 * "raw number escaped into engine territory" a type error. The brand
 * is erased at runtime, so structured clone across the worker boundary
 * is a no-op.
 */
export type Micrometres = number & { readonly __um: unique symbol };

/**
 * Tolerance for part↔stock identity matching. OBB extraction on imported
 * meshes drifts a few µm between instances; clustering groups them but the
 * cluster leader is the smallest value in the group, so it lands a few µm
 * below the nominal YAML stock value. 0.5 mm absorbs that drift while
 * staying well below the smallest legitimate stock-thickness step (3 mm).
 *
 * Applies only to part↔stock matching, not to stock↔stock or placement
 * geometry — both of those compare integer values from the same source and
 * stay exact.
 */
export const STOCK_MATCH_TOLERANCE_UM = 500;

export const um = (n: number): Micrometres => Math.round(n) as Micrometres;
export const mmToUm = (mm: number): Micrometres => um(mm * 1_000);
export const mToUm = (m: number): Micrometres => um(m * 1_000_000);
export const umToMm = (u: Micrometres): number => u / 1_000;
export const umToM = (u: Micrometres): number => u / 1_000_000;

/**
 * Display precision. Storage stays raw; precision controls only how
 * values are rendered (and re-rendered on edit). Modelled the same way
 * as SketchUp / Fusion / AutoCAD: a per-unit user preference.
 *
 * - `fraction`: round to nearest `1/denominator` (inch only).
 * - `decimal`: round to nearest `step` and render with matching dp.
 */
export type Precision =
  | { kind: 'fraction'; denominator: 8 | 16 | 32 | 64 }
  | { kind: 'decimal'; step: number };

// 1/32" matches a tape measure; 0.1mm is finer than any saw kerf.
export const DEFAULT_INCH_PRECISION: Precision = {
  kind: 'fraction',
  denominator: 32,
};
export const DEFAULT_MM_PRECISION: Precision = { kind: 'decimal', step: 0.1 };

const fractionLookupTable: Record<number, Map<number, string>> = {
  8: buildFractionTable(8),
  16: buildFractionTable(16),
  32: buildFractionTable(32),
  64: buildFractionTable(64),
};

function buildFractionTable(denom: number): Map<number, string> {
  const table = new Map<number, string>();
  for (let n = 1; n < denom; n++) {
    // Reduce n/denom to lowest terms.
    const g = gcd(n, denom);
    table.set(n / denom, `${n / g}/${denom / g}`);
  }
  return table;
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * Render a non-negative decimal as a fraction (e.g. `"3/4"`, `"1 1/2"`).
 * Always rounds to the nearest `1/denominator` — there's no ambiguity
 * about whether to snap. Whole numbers come back as `"3"`.
 */
export function toFraction(value: number, denominator: number): string {
  const table = fractionLookupTable[denominator];
  if (!table)
    throw new Error(`Unsupported fraction denominator: ${denominator}`);

  const total = Math.round(value * denominator) / denominator;
  const integerPart = Math.floor(total);
  const decimalPart = total - integerPart;
  if (decimalPart === 0) return String(integerPart);
  const frac = table.get(decimalPart) ?? '';
  return integerPart === 0 ? frac : `${integerPart} ${frac}`;
}

export function convertUnits(
  value: number,
  from: 'mm' | 'in',
  to: 'mm' | 'in',
): number {
  if (from === to) return value;
  return from === 'mm' ? value / MM_PER_IN : value * MM_PER_IN;
}

/**
 * Snap user/YAML mm-or-inch input to the 1-µm grid in mm representation.
 * Used by code that needs an mm value (e.g. YAML stock matrix, draft
 * dimension parsing); engine and storage prefer `mmToUm` instead.
 */
const snapMm = (mm: number) => Math.round(mm * 1000) / 1000;

/** User/YAML input (mm or in) → canonical mm. */
export const toCanonicalMm = (value: number, from: 'mm' | 'in') =>
  snapMm(from === 'in' ? value * MM_PER_IN : value);

// Cap on a plausible workshop dimension. Past this it's a typo or pasted
// scientific notation; reject before 1e308 lands in storage.
const MAX_DIMENSION = 1e5;

/**
 * Parse a user-entered dimension into a number expressed in `unit`.
 * Imperial accepts fractions, mixed numbers, feet+inches, and unit
 * glyphs; metric accepts decimals with optional "mm" suffix. Returns
 * null on empty / unparseable input, on negatives, on NaN, and on
 * absurdly large values (see `MAX_DIMENSION`).
 */
export function parseDimension(
  raw: string | null | undefined,
  unit: 'mm' | 'in',
): number | null {
  if (raw == null) return null;
  const s = String(raw).trim();
  if (s === '') return null;

  const result =
    unit === 'mm'
      ? (() => {
          const n = Number(s.replace(/\s*mm$/i, ''));
          return Number.isFinite(n) && n >= 0 ? n : null;
        })()
      : parseInches(s);

  if (result == null || result > MAX_DIMENSION) return null;
  return result;
}

function parseInches(raw: string): number | null {
  // Strip inch glyphs/suffix; feet glyph stays so the regex below can split.
  const cleaned = raw
    .replace(/[″"]/g, '')
    .replace(/\s*in\b/gi, '')
    .trim();
  if (cleaned === '') return null;

  const ft = cleaned.match(/^([\d.]+)\s*(?:ft|')\s*(.*)$/i);
  const feet = ft ? Number(ft[1]) : 0;
  const rest = (ft ? ft[2] : cleaned).trim();
  if (!Number.isFinite(feet)) return null;
  if (rest === '') return feet * 12;

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
 * Format a value already expressed in `unit` at the user's precision.
 * Returns a bare number/fraction string with no unit suffix — suitable
 * for edit-prefill. Display sites should use `formatDistance` (which
 * appends the unit) or build their own label.
 *
 * Storage stays raw; rounding lives only at this formatting boundary.
 */
export function formatValue(
  value: number | null | undefined,
  unit: 'mm' | 'in',
  precision: Precision,
): string {
  if (value == null || !Number.isFinite(value)) return '';
  if (precision.kind === 'fraction' && unit === 'in') {
    return toFraction(value, precision.denominator);
  }
  // Decimal mode (or fraction mode in mm — graceful fallback).
  const step =
    precision.kind === 'decimal' ? precision.step : 1 / precision.denominator;
  const places = decimalPlaces(step);
  const rounded = Math.round(value / step) * step;
  // Trim trailing zeros so 123 reads as `123` not `123.0` — matches
  // SketchUp / Fusion display behaviour.
  return Number(rounded.toFixed(places)).toString();
}

/**
 * Format an integer-micrometre value for end-user display (BOM, layout,
 * PDF, viewer labels). Wraps `formatValue` and appends the unit suffix.
 */
export function formatDistance(
  micrometres: Micrometres,
  unit: 'mm' | 'in',
  precision: Precision,
): string {
  const value = convertUnits(umToMm(micrometres), 'mm', unit);
  const body = formatValue(value, unit, precision);
  if (body === '') return '';
  return unit === 'in' ? `${body}"` : `${body}mm`;
}

function decimalPlaces(step: number): number {
  if (step >= 1) return 0;
  // Convert step to a string and count digits after the decimal point;
  // works for the values we use (1, 0.5, 0.1, 0.01, …).
  const s = String(step);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}
