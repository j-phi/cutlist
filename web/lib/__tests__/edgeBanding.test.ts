import { describe, it, expect } from 'vitest';
import {
  applyBandingToSize,
  bandedEdgeLengthUm,
  bandingCost,
  mmToUm,
  NO_BANDED_EDGES,
  projectBandingLengthUm,
  resolveBandingThicknessUm,
  resolvePartCutSize,
  um,
  umToMm,
  type BandedEdges,
  type PartSize,
} from 'cutlist';

const edges = (o: Partial<BandedEdges>): BandedEdges => ({
  ...NO_BANDED_EDGES,
  ...o,
});

/** 600 long × 300 wide × 18 thick (mm → µm). */
const size600x300: PartSize = {
  length: mmToUm(600),
  width: mmToUm(300),
  thickness: mmToUm(18),
};

describe('projectBandingLengthUm (FR-BND-2)', () => {
  it('sums one length-edge + one width-edge × qty 2 → 1800 mm', () => {
    const total = projectBandingLengthUm([
      {
        size: { length: mmToUm(600), width: mmToUm(300) },
        // one 600-long (length) edge + one 300-long (width) edge
        bandedEdges: edges({ length1: true, width1: true }),
        quantity: 2,
      },
    ]);
    expect(umToMm(total)).toBe(1800);
  });

  it('a banded length-edge contributes LENGTH, a width-edge contributes WIDTH', () => {
    const lengthOnly = bandedEdgeLengthUm(
      size600x300,
      edges({ length1: true }),
    );
    const widthOnly = bandedEdgeLengthUm(size600x300, edges({ width1: true }));
    expect(umToMm(lengthOnly)).toBe(600);
    expect(umToMm(widthOnly)).toBe(300);
  });

  it('unbanded parts contribute zero', () => {
    expect(projectBandingLengthUm([{ size: size600x300, quantity: 5 }])).toBe(
      0,
    );
  });
});

describe('bandingCost (FR-BND-3)', () => {
  it('1800 mm @ 0.01 / mm → 18', () => {
    const length = mmToUm(1800);
    // rate is per-µm; 0.01/mm = 0.01/1000 per µm
    const cost = bandingCost(length, 0.01 / 1000);
    expect(cost).toBeCloseTo(18, 9);
  });

  it('returns undefined for a missing / non-positive / non-finite rate', () => {
    const length = mmToUm(1800);
    expect(bandingCost(length, undefined)).toBeUndefined();
    expect(bandingCost(length, 0)).toBeUndefined();
    expect(bandingCost(length, -1)).toBeUndefined();
    expect(bandingCost(length, Number.NaN)).toBeUndefined();
  });
});

describe('resolvePartCutSize (FR-BND-4/-5/-6)', () => {
  it('both length-edges ON, 1 mm → width −2 mm, length unchanged (FR-BND-5)', () => {
    const cut = resolvePartCutSize(
      {
        size: size600x300,
        bandedEdges: edges({ length1: true, length2: true }),
      },
      true,
      mmToUm(1),
    );
    expect(cut.width).toBe(mmToUm(298));
    expect(cut.length).toBe(mmToUm(600));
    expect(cut.thickness).toBe(size600x300.thickness);
  });

  it('one width-edge ON, 1 mm → length −1 mm, width unchanged (FR-BND-5)', () => {
    const cut = resolvePartCutSize(
      { size: size600x300, bandedEdges: edges({ width1: true }) },
      true,
      mmToUm(1),
    );
    expect(cut.length).toBe(mmToUm(599));
    expect(cut.width).toBe(mmToUm(300));
  });

  it('toggle OFF → size deep-equals nominal regardless of banded edges (FR-BND-4)', () => {
    const cut = resolvePartCutSize(
      {
        size: size600x300,
        bandedEdges: edges({ length1: true, length2: true, width1: true }),
        bandingThicknessUm: mmToUm(2),
      },
      false,
      mmToUm(1),
    );
    expect(cut).toEqual(size600x300);
  });

  it('per-part override (2 mm) beats project default (1 mm), both length-edges (FR-BND-6)', () => {
    const cut = resolvePartCutSize(
      {
        size: size600x300,
        bandedEdges: edges({ length1: true, length2: true }),
        bandingThicknessUm: mmToUm(2),
      },
      true,
      mmToUm(1),
    );
    // finished width − 2 edges × 2 mm = 300 − 4
    expect(cut.width).toBe(um(size600x300.width - mmToUm(4)));
  });

  it('resolves project default when no per-part override (FR-BND-6)', () => {
    const cut = resolvePartCutSize(
      { size: size600x300, bandedEdges: edges({ length1: true }) },
      true,
      mmToUm(3),
    );
    expect(cut.width).toBe(mmToUm(297));
  });

  it('is deterministic — two resolutions produce equal cut sizes', () => {
    const part = {
      size: size600x300,
      bandedEdges: edges({ length1: true, width1: true }),
      bandingThicknessUm: mmToUm(2),
    };
    const a = resolvePartCutSize(part, true, mmToUm(1));
    const b = resolvePartCutSize(part, true, mmToUm(1));
    expect(a).toEqual(b);
  });
});

describe('resolveBandingThicknessUm (FR-BND-6)', () => {
  it('honours a stored 0 override over a non-zero project default', () => {
    expect(resolveBandingThicknessUm(um(0), mmToUm(5))).toBe(0);
  });

  it('falls back to project default, then zero', () => {
    expect(resolveBandingThicknessUm(undefined, mmToUm(5))).toBe(mmToUm(5));
    expect(resolveBandingThicknessUm(undefined, undefined)).toBe(0);
  });
});

describe('applyBandingToSize zero-clamp (FR-BND-7)', () => {
  it('rejects (valid:false) and returns nominal when a dim would hit ≤ 0', () => {
    // width 300, banding 200, both length-edges → 300 − 400 = −100
    const result = applyBandingToSize(
      size600x300,
      edges({ length1: true, length2: true }),
      mmToUm(200),
    );
    expect(result.valid).toBe(false);
    expect(result.size).toEqual(size600x300);
  });

  it('rejects when subtraction lands exactly at 0 µm', () => {
    const result = applyBandingToSize(
      size600x300,
      edges({ length1: true, length2: true }),
      mmToUm(150),
    );
    expect(result.valid).toBe(false);
    expect(result.size).toEqual(size600x300);
  });

  it('resolvePartCutSize falls back to nominal when subtraction would zero-clamp', () => {
    const cut = resolvePartCutSize(
      {
        size: size600x300,
        bandedEdges: edges({ length1: true, length2: true }),
      },
      true,
      mmToUm(200),
    );
    expect(cut).toEqual(size600x300);
  });
});
