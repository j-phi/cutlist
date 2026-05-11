import { describe, it, expect } from 'vitest';
import { createLinearPacker } from '../LinearPacker';
import type { PackOptions } from '../Packer';
import { Rectangle } from '../../geometry';

const baseOptions: PackOptions = {
  allowRotations: false,
  gap: 0,
  precision: 1e-6,
};

describe('Linear Packer', () => {
  it('places a single part the same length as the stick at the start', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0, 0, 0.05, 2);
    const rects = [new Rectangle('1', 0, 0, 0.05, 2)];

    const result = packer.pack(bin, rects, baseOptions);

    expect(result.leftovers).toEqual([]);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toEqual(
      expect.objectContaining({
        data: '1',
        left: 0,
        bottom: 0,
        width: 0.05,
        height: 2,
      }),
    );
  });

  it('greedily fills a stick when parts plus kerfs sum to the bin length', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0, 0, 0.05, 1);
    const rects = [
      new Rectangle('a', 0, 0, 0.05, 0.4),
      new Rectangle('b', 0, 0, 0.05, 0.3),
      new Rectangle('c', 0, 0, 0.05, 0.296),
    ];
    const options: PackOptions = { ...baseOptions, gap: 0.002 };

    const result = packer.pack(bin, rects, options);

    expect(result.leftovers).toEqual([]);
    expect(result.placements).toHaveLength(3);
    expect(result.placements[0].bottom).toBeCloseTo(0, 6);
    expect(result.placements[0].data).toBe('a');
    expect(result.placements[1].bottom).toBeCloseTo(0.402, 6);
    expect(result.placements[1].data).toBe('b');
    expect(result.placements[2].bottom).toBeCloseTo(0.704, 6);
    expect(result.placements[2].data).toBe('c');
  });

  it('places the first part at the leading edge with no kerf, kerf only between cuts', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0, 0, 0.05, 1);
    const rects = [
      new Rectangle('a', 0, 0, 0.05, 0.3),
      new Rectangle('b', 0, 0, 0.05, 0.3),
    ];
    const options: PackOptions = { ...baseOptions, gap: 0.005 };

    const result = packer.pack(bin, rects, options);

    expect(result.placements[0].bottom).toBe(0);
    expect(result.placements[1].bottom).toBeCloseTo(0.305, 6);
  });

  it('returns a part too long for the stick as a leftover with no partial placement', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0, 0, 0.05, 1);
    const rects = [new Rectangle('big', 0, 0, 0.05, 1.5)];

    const result = packer.pack(bin, rects, baseOptions);

    expect(result.placements).toEqual([]);
    expect(result.leftovers).toEqual(['big']);
  });

  it('rejects parts whose cross-section does not match the bin', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0, 0, 0.05, 1);
    const state = packer.createBinState!(bin);
    const wrongCrossSection = new Rectangle('x', 0, 0, 0.07, 0.5);

    const placement = packer.tryPlaceInBinState!(
      state,
      wrongCrossSection,
      baseOptions,
    );

    expect(placement).toBeNull();
  });

  it('supports lookback by placing a small part on an earlier opened bin', () => {
    const packer = createLinearPacker<string>();
    const binA = new Rectangle(null, 0, 0, 0.05, 1);
    const binB = new Rectangle(null, 0, 0, 0.05, 1);
    const stateA = packer.createBinState!(binA);
    const stateB = packer.createBinState!(binB);

    const big = new Rectangle('big', 0, 0, 0.05, 0.7);
    const medium = new Rectangle('medium', 0, 0, 0.05, 0.6);
    const small = new Rectangle('small', 0, 0, 0.05, 0.2);

    const a1 = packer.tryPlaceInBinState!(stateA, big, baseOptions);
    expect(a1).not.toBeNull();

    const aFail = packer.tryPlaceInBinState!(stateA, medium, baseOptions);
    expect(aFail).toBeNull();

    const b1 = packer.tryPlaceInBinState!(stateB, medium, baseOptions);
    expect(b1).not.toBeNull();

    const aSmall = packer.tryPlaceInBinState!(stateA, small, baseOptions);
    expect(aSmall).not.toBeNull();
    expect(aSmall!.bottom).toBeCloseTo(0.7, 6);
  });

  it('orders placements longest-first regardless of input order', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0, 0, 0.05, 2);
    const rects = [
      new Rectangle('short', 0, 0, 0.05, 0.2),
      new Rectangle('long', 0, 0, 0.05, 0.9),
      new Rectangle('medium', 0, 0, 0.05, 0.5),
    ];

    const result = packer.pack(bin, rects, baseOptions);

    expect(result.placements.map((p) => p.data)).toEqual([
      'long',
      'medium',
      'short',
    ]);
  });

  it('handles empty input without throwing', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0, 0, 0.05, 1);

    const result = packer.pack(bin, [], baseOptions);

    expect(result).toEqual({ placements: [], leftovers: [] });
  });

  it('returns leftovers when capacity is insufficient and places longest first', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0, 0, 0.05, 1.2);
    const rects = [
      new Rectangle('a', 0, 0, 0.05, 0.5),
      new Rectangle('b', 0, 0, 0.05, 0.4),
      new Rectangle('c', 0, 0, 0.05, 0.3),
      new Rectangle('d', 0, 0, 0.05, 0.6),
      new Rectangle('e', 0, 0, 0.05, 0.7),
    ];

    const result = packer.pack(bin, rects, baseOptions);

    expect(result.placements.map((p) => p.data)).toEqual(['e', 'a']);
    expect(result.placements[0].bottom).toBe(0);
    expect(result.placements[1].bottom).toBeCloseTo(0.7, 6);
    expect(new Set(result.leftovers)).toEqual(new Set(['b', 'c', 'd']));
  });

  it('accepts a part whose width differs from the bin by less than precision', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0, 0, 0.05, 1);
    const state = packer.createBinState!(bin);
    const slightlyOff = new Rectangle('p', 0, 0, 0.05 + 1e-9, 0.4);

    const placement = packer.tryPlaceInBinState!(
      state,
      slightlyOff,
      baseOptions,
    );

    expect(placement).not.toBeNull();
    expect(placement!.bottom).toBe(0);
  });

  it('ignores allowRotations: cross-section never rotates', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0, 0, 0.05, 1);
    const tallNarrow = new Rectangle('p', 0, 0, 0.5, 0.05);

    const result = packer.pack(bin, [tallNarrow], {
      ...baseOptions,
      allowRotations: true,
    });

    expect(result.placements).toEqual([]);
    expect(result.leftovers).toEqual(['p']);
  });

  it('respects bin offsets: placements start at bin.bottom, not 0', () => {
    const packer = createLinearPacker<string>();
    const bin = new Rectangle(null, 0.1, 0.5, 0.05, 1);
    const rects = [
      new Rectangle('a', 0, 0, 0.05, 0.3),
      new Rectangle('b', 0, 0, 0.05, 0.3),
    ];
    const options: PackOptions = { ...baseOptions, gap: 0.002 };

    const result = packer.pack(bin, rects, options);

    expect(result.placements[0].left).toBe(0.1);
    expect(result.placements[0].bottom).toBe(0.5);
    expect(result.placements[1].bottom).toBeCloseTo(0.802, 6);
  });
});
