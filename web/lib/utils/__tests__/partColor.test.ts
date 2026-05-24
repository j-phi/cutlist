import { describe, it, expect } from 'vitest';
import {
  partHue,
  partColorCss,
  partColorRgb,
  oklchToRgb01,
  PART_OKLCH_L,
  PART_OKLCH_C,
  maxGapHue,
  assignBoardColors,
} from '../partColor';

describe('partColor', () => {
  it('screen (CSS) and PDF (RGB) paths derive from the same hue (FR-VIZ-3)', () => {
    // Both paths must derive from the same golden-angle hue so part #5 looks
    // identical across the layout diagram and the PDF.
    const hue = partHue(5);

    // CSS string embeds the hue as the third oklch component.
    const css = partColorCss(5);
    const cssHue = Number(/oklch\([\d.]+ [\d.]+ ([\d.]+)\)/.exec(css)![1]);
    expect(cssHue).toBeCloseTo(hue, 1);

    // RGB path must equal a manual oklchToRgb01 call with the same hue.
    expect(partColorRgb(5)).toEqual(
      oklchToRgb01(PART_OKLCH_L, PART_OKLCH_C, hue),
    );
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
    // golden-angle step. A naive `n % 360` palette gives near-equal hues for
    // parts 1 and 2.
    expect(Math.abs(partHue(1) - partHue(2))).toBeGreaterThan(30);
  });

  it('oklchToRgb01 clamps out-of-gamut values to [0, 1]', () => {
    // High chroma at some hues exits the sRGB gamut. Verify clamp, not NaN.
    const { r, g, b } = oklchToRgb01(0.7, 0.4, 137.5);
    for (const ch of [r, g, b]) {
      expect(ch).toBeGreaterThanOrEqual(0);
      expect(ch).toBeLessThanOrEqual(1);
    }
  });
});

describe('maxGapHue', () => {
  it('returns the centre of the largest circular gap', () => {
    // Hues at 0°, 90°, 180°: largest gap is 180°→360°(=0°), centre = 270°.
    expect(maxGapHue([0, 90, 180])).toBeCloseTo(270, 1);
  });

  it('returns the antipodal point for a single taken hue', () => {
    expect(maxGapHue([60])).toBeCloseTo(240, 1);
  });
});

describe('assignBoardColors', () => {
  const rect = (pn: number, l: number, r: number, b: number, t: number) => ({
    partNumber: pn,
    leftUm: l,
    rightUm: r,
    bottomUm: b,
    topUm: t,
  });

  it('adjacent parts get hues at least 30° apart', () => {
    const placements = [rect(1, 0, 500, 0, 300), rect(2, 500, 1000, 0, 300)];
    const hues = assignBoardColors(placements);
    const diff = Math.abs((hues.get(1) ?? 0) - (hues.get(2) ?? 0));
    expect(Math.min(diff, 360 - diff)).toBeGreaterThan(30);
  });

  it('isolated part keeps its golden-angle hue', () => {
    const placements = [rect(1, 0, 500, 0, 300)];
    const hues = assignBoardColors(placements);
    expect(hues.get(1)).toBeCloseTo(partHue(1), 1);
  });

  it('same partNumber placements are a single node', () => {
    const placements = [
      rect(1, 0, 500, 0, 300),
      rect(1, 0, 500, 300, 600),
      rect(2, 500, 1000, 0, 600),
    ];
    const hues = assignBoardColors(placements);
    expect([...hues.keys()].filter((k) => k === 1)).toHaveLength(1);
  });

  it('returns an empty map for empty placements', () => {
    expect(assignBoardColors([])).toEqual(new Map());
  });
});
