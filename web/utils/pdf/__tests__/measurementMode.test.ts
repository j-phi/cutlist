import { describe, expect, it } from 'vitest';
import { isOutsideBoardMode, planPartMeasurement } from '../measurementMode';

/**
 * F20 Part B — the per-mode render plan governs which primitive family each
 * placed part emits. These assert the user-visible behaviour that differs by
 * mode (not a mock): `text`/`inside` must NOT produce edge dimension lines;
 * `outside` is drawn per-board (per-part `none`); `edge` keeps F14.
 */
describe('planPartMeasurement (F20 Part B mode dispatch)', () => {
  it('disabled → none for every mode (no measurements drawn)', () => {
    for (const m of ['edge', 'outside', 'inside', 'text'] as const) {
      expect(planPartMeasurement(m, false)).toEqual({ kind: 'none' });
    }
  });

  it('edge → engineering dimension lines on the piece (F14)', () => {
    expect(planPartMeasurement('edge', true)).toEqual({ kind: 'edge' });
  });

  it('text and inside → interior value text (no edge dim lines)', () => {
    expect(planPartMeasurement('text', true)).toEqual({ kind: 'interior' });
    expect(planPartMeasurement('inside', true)).toEqual({ kind: 'interior' });
  });

  it('outside → none per part (overall dims drawn per board)', () => {
    expect(planPartMeasurement('outside', true)).toEqual({ kind: 'none' });
  });
});

describe('isOutsideBoardMode', () => {
  it('only outside-mode draws per-board dims, and only when enabled', () => {
    expect(isOutsideBoardMode('outside', true)).toBe(true);
    expect(isOutsideBoardMode('outside', false)).toBe(false);
    for (const m of ['edge', 'inside', 'text'] as const) {
      expect(isOutsideBoardMode(m, true)).toBe(false);
    }
  });
});
