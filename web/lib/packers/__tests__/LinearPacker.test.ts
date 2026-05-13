import { describe, it, expect } from 'vitest';
import { createLinearPacker } from '../LinearPacker';
import type { PackOptions } from '../Packer';
import { Rectangle } from '../../geometry';
import { um } from '~/test-utils/units';

const baseOptions: PackOptions = {
  allowRotations: false,
  gap: um(0),
};

function r<T>(data: T, x: number, y: number, w: number, h: number) {
  return new Rectangle<T>(data, um(x), um(y), um(w), um(h));
}

describe('Linear Packer', () => {
  it('places a single part the same length as the stick at the start', () => {
    const packer = createLinearPacker<string>();
    const bin = r(null, 0, 0, 50, 2000);
    const rects = [r('1', 0, 0, 50, 2000)];

    const result = packer.pack(bin, rects, baseOptions);

    expect(result.leftovers).toEqual([]);
    expect(result.placements).toHaveLength(1);
    expect(result.placements[0]).toEqual(
      expect.objectContaining({
        data: '1',
        left: 0,
        bottom: 0,
        width: 50,
        height: 2000,
      }),
    );
  });

  it('greedily fills a stick when parts plus kerfs sum to the bin length', () => {
    const packer = createLinearPacker<string>();
    const bin = r(null, 0, 0, 50, 1000);
    const rects = [
      r('a', 0, 0, 50, 400),
      r('b', 0, 0, 50, 300),
      r('c', 0, 0, 50, 296),
    ];
    const options: PackOptions = { ...baseOptions, gap: um(2) };

    const result = packer.pack(bin, rects, options);

    expect(result.leftovers).toEqual([]);
    expect(result.placements).toHaveLength(3);
    expect(result.placements[0].bottom).toBe(0);
    expect(result.placements[0].data).toBe('a');
    expect(result.placements[1].bottom).toBe(402);
    expect(result.placements[1].data).toBe('b');
    expect(result.placements[2].bottom).toBe(704);
    expect(result.placements[2].data).toBe('c');
  });

  it('returns a part too long for the stick as a leftover with no partial placement', () => {
    const packer = createLinearPacker<string>();
    const bin = r(null, 0, 0, 50, 1000);
    const rects = [r('big', 0, 0, 50, 1500)];

    const result = packer.pack(bin, rects, baseOptions);

    expect(result.placements).toEqual([]);
    expect(result.leftovers).toEqual(['big']);
  });

  it('rejects parts whose cross-section does not match the bin', () => {
    const packer = createLinearPacker<string>();
    const bin = r(null, 0, 0, 50, 1000);
    const state = packer.createBinState!(bin);
    const wrongCrossSection = r('x', 0, 0, 70, 500);

    const placement = packer.tryPlaceInBinState!(
      state,
      wrongCrossSection,
      baseOptions,
    );

    expect(placement).toBeNull();
  });

  it('supports lookback by placing a small part on an earlier opened bin', () => {
    const packer = createLinearPacker<string>();
    const binA = r(null, 0, 0, 50, 1000);
    const binB = r(null, 0, 0, 50, 1000);
    const stateA = packer.createBinState!(binA);
    const stateB = packer.createBinState!(binB);

    const big = r('big', 0, 0, 50, 700);
    const medium = r('medium', 0, 0, 50, 600);
    const small = r('small', 0, 0, 50, 200);

    const a1 = packer.tryPlaceInBinState!(stateA, big, baseOptions);
    expect(a1).not.toBeNull();

    const aFail = packer.tryPlaceInBinState!(stateA, medium, baseOptions);
    expect(aFail).toBeNull();

    const b1 = packer.tryPlaceInBinState!(stateB, medium, baseOptions);
    expect(b1).not.toBeNull();

    const aSmall = packer.tryPlaceInBinState!(stateA, small, baseOptions);
    expect(aSmall).not.toBeNull();
    expect(aSmall!.bottom).toBe(700);
  });

  it('returns leftovers when capacity is insufficient and places longest first', () => {
    const packer = createLinearPacker<string>();
    const bin = r(null, 0, 0, 50, 1200);
    const rects = [
      r('a', 0, 0, 50, 500),
      r('b', 0, 0, 50, 400),
      r('c', 0, 0, 50, 300),
      r('d', 0, 0, 50, 600),
      r('e', 0, 0, 50, 700),
    ];

    const result = packer.pack(bin, rects, baseOptions);

    expect(result.placements.map((p) => p.data)).toEqual(['e', 'a']);
    expect(result.placements[0].bottom).toBe(0);
    expect(result.placements[1].bottom).toBe(700);
    expect(new Set(result.leftovers)).toEqual(new Set(['b', 'c', 'd']));
  });

  it('ignores allowRotations: cross-section never rotates', () => {
    const packer = createLinearPacker<string>();
    const bin = r(null, 0, 0, 50, 1000);
    const tallNarrow = r('p', 0, 0, 500, 50);

    const result = packer.pack(bin, [tallNarrow], {
      ...baseOptions,
      allowRotations: true,
    });

    expect(result.placements).toEqual([]);
    expect(result.leftovers).toEqual(['p']);
  });

  it('respects bin offsets: placements start at bin.bottom, not 0', () => {
    const packer = createLinearPacker<string>();
    const bin = r(null, 100, 500, 50, 1000);
    const rects = [r('a', 0, 0, 50, 300), r('b', 0, 0, 50, 300)];
    const options: PackOptions = { ...baseOptions, gap: um(2) };

    const result = packer.pack(bin, rects, options);

    expect(result.placements[0].left).toBe(100);
    expect(result.placements[0].bottom).toBe(500);
    expect(result.placements[1].bottom).toBe(802);
  });
});
