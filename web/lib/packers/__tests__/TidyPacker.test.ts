import { describe, it, expect } from 'vitest';
import { createTidyPacker } from '../TidyPacker';
import type { PackOptions } from '../Packer';
import { Rectangle } from '../../geometry';

const baseOptions: PackOptions = {
  allowRotations: false,
  gap: 0,
  placementEpsilon: 0,
};

describe('Tidy Packer', () => {
  it('returns no placements for an empty rect list', () => {
    const packer = createTidyPacker<string>();
    const bin = new Rectangle(null, 0, 0, 10, 10);
    expect(packer.pack(bin, [], baseOptions)).toEqual({
      placements: [],
      leftovers: [],
    });
  });

  it('places a single rect at the bin origin', () => {
    const packer = createTidyPacker<string>();
    const bin = new Rectangle(null, 0, 0, 10, 10);
    const result = packer.pack(
      bin,
      [new Rectangle('a', 0, 0, 4, 6)],
      baseOptions,
    );
    expect(result.leftovers).toEqual([]);
    expect(result.placements).toEqual([
      expect.objectContaining({ data: 'a', left: 0, bottom: 0 }),
    ]);
  });

  it('stacks same-width parts in a single column (rip-first)', () => {
    // The core tidy guarantee: parts of identical width share a strip
    // rather than scattering. This is the screenshot regression — Matt's
    // "similar stock should be in line".
    const packer = createTidyPacker<string>({ axis: 'rip-first' });
    const bin = new Rectangle(null, 0, 0, 10, 30);
    const result = packer.pack(
      bin,
      [
        new Rectangle('a', 0, 0, 4, 6),
        new Rectangle('b', 0, 0, 4, 6),
        new Rectangle('c', 0, 0, 4, 6),
      ],
      baseOptions,
    );
    expect(result.leftovers).toEqual([]);
    expect(result.placements).toHaveLength(3);
    const lefts = new Set(result.placements.map((p) => p.left));
    expect(lefts.size).toBe(1);
    expect([...lefts][0]).toBe(0);
    const bottoms = result.placements
      .map((p) => p.bottom)
      .toSorted((a, b) => a - b);
    expect(bottoms).toEqual([0, 6, 12]);
  });

  it('opens new strips for parts of different widths', () => {
    const packer = createTidyPacker<string>({ axis: 'rip-first' });
    const bin = new Rectangle(null, 0, 0, 10, 10);
    const result = packer.pack(
      bin,
      [
        new Rectangle('wide', 0, 0, 4, 10),
        new Rectangle('narrow', 0, 0, 2, 10),
      ],
      baseOptions,
    );
    expect(result.placements).toHaveLength(2);
    // Different lefts → different strips.
    const lefts = result.placements
      .map((p) => p.left)
      .toSorted((a, b) => a - b);
    expect(lefts).toEqual([0, 4]);
  });

  it('crosscut-first variant produces horizontal rows instead of columns', () => {
    const packer = createTidyPacker<string>({ axis: 'crosscut-first' });
    const bin = new Rectangle(null, 0, 0, 30, 10);
    const result = packer.pack(
      bin,
      [
        new Rectangle('a', 0, 0, 6, 4),
        new Rectangle('b', 0, 0, 6, 4),
        new Rectangle('c', 0, 0, 6, 4),
      ],
      baseOptions,
    );
    expect(result.placements).toHaveLength(3);
    // All three should share the same `bottom` — one row.
    const bottoms = new Set(result.placements.map((p) => p.bottom));
    expect(bottoms.size).toBe(1);
    expect([...bottoms][0]).toBe(0);
    // Lefts walk: 0, 6, 12.
    const lefts = result.placements
      .map((p) => p.left)
      .toSorted((a, b) => a - b);
    expect(lefts).toEqual([0, 6, 12]);
  });

  it('reuses within-strip residuals for smaller parts', () => {
    // Strip-1 host part is 6 wide. After it goes in, strip width = 6.
    // A 4-wide-by-X part fits in strip-1 with a 2-wide side residual.
    // A subsequent 2-wide part should reclaim that residual instead of
    // opening a new strip.
    const packer = createTidyPacker<string>({ axis: 'rip-first' });
    const bin = new Rectangle(null, 0, 0, 10, 30);
    const result = packer.pack(
      bin,
      [
        new Rectangle('host', 0, 0, 6, 10),
        new Rectangle('side-fit', 0, 0, 2, 6),
      ],
      baseOptions,
    );
    expect(result.placements).toHaveLength(2);
    // Both placements live within x∈[0, 6] (strip-1).
    for (const p of result.placements) {
      expect(p.left).toBeGreaterThanOrEqual(0);
      expect(p.right).toBeLessThanOrEqual(6 + 1e-9);
    }
  });

  it('returns oversize rects as leftovers', () => {
    const packer = createTidyPacker<string>();
    const bin = new Rectangle(null, 0, 0, 5, 5);
    const result = packer.pack(
      bin,
      [new Rectangle('too-tall', 0, 0, 5, 6)],
      baseOptions,
    );
    expect(result.placements).toEqual([]);
    expect(result.leftovers).toEqual(['too-tall']);
  });

  it('respects kerf gap between strips and stacked parts', () => {
    const packer = createTidyPacker<string>({ axis: 'rip-first' });
    const bin = new Rectangle(null, 0, 0, 10, 10);
    // Two 4×4 parts stacked in a strip with kerf 1: 4+1+4 = 9 ≤ 10. OK.
    // A third strip would start at x=4+1=5 and need 4 width: 5+4=9 ≤ 10. OK.
    const result = packer.pack(
      bin,
      [
        new Rectangle('a', 0, 0, 4, 4),
        new Rectangle('b', 0, 0, 4, 4),
        new Rectangle('c', 0, 0, 4, 4),
      ],
      { ...baseOptions, gap: 1 },
    );
    expect(result.placements).toHaveLength(3);
    // First two share a strip → same left, kerf-spaced bottoms.
    const grouped = result.placements.reduce<Record<number, number[]>>(
      (acc, p) => {
        (acc[p.left] ??= []).push(p.bottom);
        return acc;
      },
      {},
    );
    const lefts = Object.keys(grouped)
      .map(Number)
      .toSorted((a, b) => a - b);
    expect(lefts).toEqual([0, 5]);
    expect(grouped[0].toSorted()).toEqual([0, 5]);
  });

  it('rotates rects to fit, preferring narrower columns', () => {
    const packer = createTidyPacker<string>({ axis: 'rip-first' });
    // Tidy prefers the orientation with smaller width — `6×1` becomes
    // `1×6`, fitting the 3-wide bin and producing a narrow column.
    const bin = new Rectangle(null, 0, 0, 3, 6);
    const result = packer.pack(bin, [new Rectangle('a', 0, 0, 6, 1)], {
      ...baseOptions,
      allowRotations: true,
    });
    expect(result.leftovers).toEqual([]);
    expect(result.placements[0].width).toBe(1);
    expect(result.placements[0].height).toBe(6);
  });

  it('honours canRotateRect override (grain-locked parts stay oriented)', () => {
    const packer = createTidyPacker<{ id: string; locked: boolean }>({
      axis: 'rip-first',
    });
    const bin = new Rectangle(null, 0, 0, 6, 6);
    const result = packer.pack(
      bin,
      [new Rectangle({ id: 'a', locked: true }, 0, 0, 6, 3)],
      {
        ...baseOptions,
        allowRotations: true,
        canRotateRect: (data) => !data.locked,
      },
    );
    expect(result.placements).toHaveLength(1);
    // Locked: must keep original orientation (6 wide × 3 tall).
    expect(result.placements[0].width).toBe(6);
    expect(result.placements[0].height).toBe(3);
  });

  it('exposes per-bin state for multi-board lookback', () => {
    const packer = createTidyPacker<string>({ axis: 'rip-first' });
    const bin = new Rectangle(null, 0, 0, 10, 10);

    expect(packer.createBinState).toBeDefined();
    expect(packer.tryPlaceInBinState).toBeDefined();
    const state = packer.createBinState!(bin);

    const a = packer.tryPlaceInBinState!(
      state,
      new Rectangle('a', 0, 0, 6, 6),
      baseOptions,
    );
    const b = packer.tryPlaceInBinState!(
      state,
      new Rectangle('b', 0, 0, 4, 4),
      baseOptions,
    );
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    // Bin is now full enough that an 11×11 won't fit — state stays unchanged.
    const tooBig = packer.tryPlaceInBinState!(
      state,
      new Rectangle('c', 0, 0, 11, 11),
      baseOptions,
    );
    expect(tooBig).toBeNull();
  });

  it('produces non-overlapping placements within the bin', () => {
    const packer = createTidyPacker<string>({ axis: 'rip-first' });
    const bin = new Rectangle(null, 0, 0, 20, 20);
    const result = packer.pack(
      bin,
      [
        new Rectangle('a', 0, 0, 8, 12),
        new Rectangle('b', 0, 0, 12, 8),
        new Rectangle('c', 0, 0, 8, 8),
        new Rectangle('d', 0, 0, 4, 12),
        new Rectangle('e', 0, 0, 8, 4),
      ],
      baseOptions,
    );

    for (const p of result.placements) {
      expect(p.isInside(bin, 1e-9)).toBe(true);
    }
    for (let i = 0; i < result.placements.length; i++) {
      for (let j = i + 1; j < result.placements.length; j++) {
        expect(
          result.placements[i].isIntersecting(result.placements[j], 1e-9),
        ).toBe(false);
      }
    }
  });
});
