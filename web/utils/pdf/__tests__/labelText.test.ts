import { describe, expect, it } from 'vitest';
import {
  decideLabelLayout,
  wrapLabel,
  MAX_LINES,
  type LabelInput,
} from '../labelText';

/** Deterministic width oracle used across all cases (per F20 acceptance). */
const measure = (t: string, pt: number) => t.length * pt * 0.5;

function base(over: Partial<LabelInput>): LabelInput {
  return {
    text: 'X',
    width: 100,
    height: 100,
    fontPt: 6,
    measure,
    ...over,
  };
}

describe('decideLabelLayout', () => {
  it('wide short part with a short label → rotate 0, one line (FR-LBLT-1/2)', () => {
    const r = decideLabelLayout(
      base({ text: 'Top', width: 120, height: 40, fontPt: 6 }),
    );
    expect(r.rotate).toBe(0);
    expect(r.lines).toEqual(['Top']);
  });

  it('single line overflows but ≤3 lines fit → rotate 0, 2–3 lines each within width (FR-LBLT-1)', () => {
    // "Right Wall Left Box Top" at pt 6 → each word ~ chars*3 px wide.
    const text = 'Right Wall Left Box Top Base';
    const width = 60; // forces wrapping; budget = 54
    const r = decideLabelLayout(base({ text, width, height: 60, fontPt: 6 }));
    expect(r.rotate).toBe(0);
    expect(r.lines.length).toBeGreaterThanOrEqual(2);
    expect(r.lines.length).toBeLessThanOrEqual(MAX_LINES);
    for (const line of r.lines) {
      expect(measure(line, 6)).toBeLessThanOrEqual(width * 0.9 + 1e-9);
    }
  });

  it("user's example: wide piece with long multi-word label stays horizontal; narrow piece rotates (FR-LBLT-1/3)", () => {
    // Wide piece ≈ 20 units wide × 45 tall. Use a generous scale so the label
    // fits horizontally when wrapped.
    const wide = decideLabelLayout(
      base({
        text: 'Right Wall | Left Box: Top/Base',
        width: 200,
        height: 450,
        fontPt: 9,
      }),
    );
    expect(wide.rotate).toBe(0);
    expect(wide.lines.length).toBeLessThanOrEqual(MAX_LINES);

    // Narrow piece ≈ 4 units wide × 45 tall: 3 horizontal lines can't fit the
    // long label in the tiny width → rotate 90.
    const narrow = decideLabelLayout(
      base({
        text: 'Back Wall | Bottom Right Box: Toe Kick: Front/Back',
        width: 40,
        height: 450,
        fontPt: 9,
      }),
    );
    expect(narrow.rotate).toBe(90);
  });

  it('single word longer than the budget → hard-broken mid-word, each line ≤ budget (FR-LBLT-1)', () => {
    const text = 'Supercalifragilisticexpialidocious';
    const budget = 30;
    const lines = wrapLabel(text, budget, 6, measure);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) {
      expect(measure(line, 6)).toBeLessThanOrEqual(budget + 1e-9);
    }
    // No characters lost.
    expect(lines.join('')).toBe(text);
  });

  it("placement='top' stays 'top' when dimensions off; becomes 'center' when on (FR-LBLT-4/5)", () => {
    const off = decideLabelLayout(
      base({ text: 'Side', placement: 'top', dimensionsEnabled: false }),
    );
    expect(off.placement).toBe('top');

    const on = decideLabelLayout(
      base({ text: 'Side', placement: 'top', dimensionsEnabled: true }),
    );
    expect(on.placement).toBe('center');
  });

  it('part so short only 1 of 3 lines fits → lines.length === 1, clamped to rect (FR-LBLT-6)', () => {
    // Tall-enough width to avoid rotation preference but height holds 1 line.
    const r = decideLabelLayout(
      base({
        text: 'One Two Three Four Five',
        width: 40,
        height: 8, // lineHeight defaults to fontPt 6 → only 1 line fits
        fontPt: 6,
      }),
    );
    expect(r.lines.length).toBe(1);
  });

  it('identical inputs called twice → deeply-equal result (FR-LBLT-7)', () => {
    const inp = base({
      text: 'Right Wall | Left Box: Top/Base',
      width: 80,
      height: 200,
      fontPt: 7,
      placement: 'top',
    });
    expect(decideLabelLayout(inp)).toEqual(decideLabelLayout({ ...inp }));
  });

  it('empty/whitespace label → no lines, no throw', () => {
    expect(decideLabelLayout(base({ text: '   ' })).lines).toEqual([]);
  });
});
