/**
 * F6 / FR-VIZ-3 — stable per-part hue shared across the 3D viewer key, the
 * on-screen layout diagram, and the PDF board renderer.
 *
 * Today the viewer and the layout diagram colour parts by *material* (stock
 * colour), not per part. This module provides an OPTIONAL per-part colouring
 * scheme: a part keeps the SAME hue wherever it is drawn because every path
 * derives its colour from one pure function keyed on `partNumber`.
 *
 * `partHue` is the single source of truth. `partColorHsl` (screen / viewer key)
 * and `partColorRgb` (PDF, 0..1 channels) both call it, so the two colour paths
 * cannot drift: same `partNumber` → same hue → same rendered colour.
 */

/** Golden-angle step keeps successive part numbers visually far apart. */
const GOLDEN_ANGLE = 137.508;

/**
 * Deterministic hue in [0, 360) for a part number. Pure: same input → same
 * output, no global state. Negative / non-integer inputs are floored to a
 * non-negative integer index first so the function is total.
 */
export function partHue(partNumber: number): number {
  const idx = Math.abs(Math.floor(partNumber));
  return (idx * GOLDEN_ANGLE) % 360;
}

/** Fixed saturation / lightness for the per-part palette (screen + PDF). */
export const PART_SATURATION = 0.6;
export const PART_LIGHTNESS = 0.62;

/** CSS `hsl(...)` colour for a part — used by the screen layout diagram and as
 * the viewer colour key. */
export function partColorHsl(
  partNumber: number,
  s: number = PART_SATURATION,
  l: number = PART_LIGHTNESS,
): string {
  return `hsl(${partHue(partNumber).toFixed(1)}, ${Math.round(s * 100)}%, ${Math.round(l * 100)}%)`;
}

export interface Rgb01 {
  r: number;
  g: number;
  b: number;
}

/** HSL → RGB, all channels in [0, 1]. Standard conversion. */
export function hslToRgb01(h: number, s: number, l: number): Rgb01 {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0;
  let g = 0;
  let b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = l - c / 2;
  return { r: r + m, g: g + m, b: b + m };
}

/** Per-part colour as RGB channels in [0, 1] — used by the PDF board renderer
 * (pdf-lib's `rgb()` takes 0..1). Derives from {@link partHue}, the SAME key the
 * screen path uses, so #5 matches across screen and PDF. */
export function partColorRgb(
  partNumber: number,
  s: number = PART_SATURATION,
  l: number = PART_LIGHTNESS,
): Rgb01 {
  return hslToRgb01(partHue(partNumber), s, l);
}
