import { describe, it, expect } from 'vitest';
import { um, type Micrometres } from '../units';
import { alignPlacements } from '../alignPlacements';
import type { SheetBoardLayoutPlacement } from '../../types';

/**
 * Build a sheet placement with only the geometry fields the aligner reads;
 * the rest are filled with harmless defaults so the type is satisfied.
 */
function placement(
  rect: { leftUm: number; rightUm: number; bottomUm: number; topUm: number },
  partNumber = 1,
): SheetBoardLayoutPlacement {
  return {
    partNumber,
    instanceNumber: 1,
    name: `part-${partNumber}`,
    material: 'Plywood',
    widthUm: um(rect.rightUm - rect.leftUm),
    lengthUm: um(rect.topUm - rect.bottomUm),
    thicknessUm: um(18000),
    leftUm: um(rect.leftUm),
    rightUm: um(rect.rightUm),
    bottomUm: um(rect.bottomUm),
    topUm: um(rect.topUm),
    allowanceWidthUm: um(0),
    allowanceLengthUm: um(0),
  };
}

const min = (xs: Micrometres[]) => Math.min(...xs);
const max = (xs: Micrometres[]) => Math.max(...xs);

describe('alignPlacements', () => {
  // Board: 1000 wide x 2000 long, margin 0.
  // Two parts clustered toward the top-left corner with a gap between them.
  const W = um(1000);
  const L = um(2000);
  const clusteredTopLeft = [
    placement({ leftUm: 0, rightUm: 300, bottomUm: 1500, topUm: 1900 }, 1),
    placement({ leftUm: 0, rightUm: 300, bottomUm: 1100, topUm: 1400 }, 2),
  ];

  it('bottom-aligns the cluster to the bottom edge (marginUm=0)', () => {
    const out = alignPlacements(
      clusteredTopLeft,
      W,
      L,
      um(0),
      'left',
      'bottom',
    );
    expect(min(out.map((p) => p.bottomUm))).toBe(0);
    // slack now lives at the top
    expect(max(out.map((p) => p.topUm))).toBeLessThan(L);
  });

  it('right-aligns the cluster to the right edge (marginUm=0)', () => {
    const out = alignPlacements(
      clusteredTopLeft,
      W,
      L,
      um(0),
      'right',
      'bottom',
    );
    expect(max(out.map((p) => p.rightUm))).toBe(W);
    expect(min(out.map((p) => p.leftUm))).toBeGreaterThan(0);
  });

  it('respects the margin: bottom-left lands at marginUm on both axes', () => {
    const margin = um(50);
    const out = alignPlacements(
      clusteredTopLeft,
      W,
      L,
      margin,
      'left',
      'bottom',
    );
    expect(min(out.map((p) => p.bottomUm))).toBe(50);
    expect(min(out.map((p) => p.leftUm))).toBe(50);
  });

  it('top-aligns so the top edge lands at lengthUm - margin', () => {
    const margin = um(50);
    const out = alignPlacements(clusteredTopLeft, W, L, margin, 'right', 'top');
    expect(max(out.map((p) => p.topUm))).toBe(L - 50);
    expect(max(out.map((p) => p.rightUm))).toBe(W - 50);
  });

  it('preserves footprint and inter-part offsets under any alignment', () => {
    const before = clusteredTopLeft;
    // bottom-to-bottom gap between part 1 and part 2 before
    const gapBefore = before[0].bottomUm - before[1].bottomUm;
    const widthBefore = before[0].rightUm - before[0].leftUm;

    for (const [h, v] of [
      ['left', 'bottom'],
      ['right', 'bottom'],
      ['left', 'top'],
      ['right', 'top'],
    ] as const) {
      const out = alignPlacements(before, W, L, um(0), h, v);
      const gapAfter = out[0].bottomUm - out[1].bottomUm;
      const widthAfter = out[0].rightUm - out[0].leftUm;
      expect(gapAfter).toBe(gapBefore);
      expect(widthAfter).toBe(widthBefore);
    }
  });

  it('applies zero translation on an axis with no slack (no overflow)', () => {
    // A part spanning the full usable width (margin 0): right-align must be a no-op on X.
    const fullWidth = [
      placement({ leftUm: 0, rightUm: 1000, bottomUm: 0, topUm: 400 }, 1),
    ];
    const out = alignPlacements(fullWidth, W, L, um(0), 'right', 'bottom');
    expect(out[0].leftUm).toBe(0);
    expect(out[0].rightUm).toBe(W);
  });

  it('returns an empty array unchanged', () => {
    expect(alignPlacements([], W, L, um(0), 'right', 'top')).toEqual([]);
  });
});
