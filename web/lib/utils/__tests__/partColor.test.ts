import { describe, it, expect } from 'vitest';
import { partHue, partColorHsl, partColorRgb, hslToRgb01 } from '../partColor';

describe('partColor', () => {
  it('part #5 resolves to the same hue for the viewer/screen key and the PDF', () => {
    // FR-VIZ-3: the screen/viewer path (HSL) and the PDF path (RGB) must derive
    // from the SAME hue, so #5 looks identical across paths. Guards drift
    // between the two colour paths by re-deriving the screen HSL hue from the
    // PDF RGB and asserting it matches partHue(5).
    const hue = partHue(5);

    const hsl = partColorHsl(5);
    const hslHue = Number(/hsl\(([\d.]+)/.exec(hsl)![1]);
    expect(hslHue).toBeCloseTo(hue, 1);

    const rgb = partColorRgb(5);
    const max = Math.max(rgb.r, rgb.g, rgb.b);
    const min = Math.min(rgb.r, rgb.g, rgb.b);
    const delta = max - min;
    // Recover hue from RGB (standard inverse) and compare to the shared hue.
    let recovered: number;
    if (delta === 0) recovered = 0;
    else if (max === rgb.r) recovered = 60 * (((rgb.g - rgb.b) / delta) % 6);
    else if (max === rgb.g) recovered = 60 * ((rgb.b - rgb.r) / delta + 2);
    else recovered = 60 * ((rgb.r - rgb.g) / delta + 4);
    if (recovered < 0) recovered += 360;
    expect(recovered).toBeCloseTo(hue, 0);
  });

  it('is pure and deterministic — same input, same output', () => {
    expect(partHue(5)).toBe(partHue(5));
    expect(partColorRgb(5)).toEqual(partColorRgb(5));
  });

  it('keeps hue in [0, 360) and is total over negative / fractional input', () => {
    for (const n of [0, 1, 5, 100, -3, 2.7]) {
      const h = partHue(n);
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThan(360);
    }
  });

  it('spreads adjacent part numbers apart (golden-angle separation)', () => {
    // Two consecutive parts should not collide on hue — the whole point of the
    // golden-angle step. Bug class: a naive `n % 360` palette gives near-equal
    // hues for #1 and #2.
    expect(Math.abs(partHue(1) - partHue(2))).toBeGreaterThan(30);
  });

  it('hslToRgb01 hits primary corners', () => {
    expect(hslToRgb01(0, 1, 0.5)).toEqual({ r: 1, g: 0, b: 0 });
    expect(hslToRgb01(120, 1, 0.5)).toEqual({ r: 0, g: 1, b: 0 });
    expect(hslToRgb01(240, 1, 0.5)).toEqual({ r: 0, g: 0, b: 1 });
  });
});
