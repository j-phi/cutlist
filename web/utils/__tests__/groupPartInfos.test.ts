import { describe, expect, it } from 'vitest';
import { groupPartInfos, type PartInfo } from '../groupPartInfos';

function info(
  name: string,
  size: { thickness: number; width: number; length: number },
  nodeIndex = 0,
): PartInfo {
  return {
    name,
    colorKey: 'plywood',
    colorHex: '#000',
    rgb: [0, 0, 0],
    size,
    nodeIndex,
  };
}

describe('groupPartInfos', () => {
  it('merges parts whose dims differ by sub-mm export noise', () => {
    // FBX commonly stores "the same" part with sub-micron AABB differences
    // (e.g. 19.050 vs 19.051 mm). Real-world regression: with 0.1 mm grid
    // snap these straddled the 19.05 boundary and split into two rows.
    const result = groupPartInfos([
      info('A', { thickness: 0.01905, width: 0.0826, length: 0.89535 }, 0),
      info('B', { thickness: 0.019051, width: 0.0826, length: 0.89535 }, 1),
    ]);
    expect(result.parts).toHaveLength(2);
    expect(result.parts[0].partNumber).toBe(1);
    expect(result.parts[1].partNumber).toBe(1);
  });

  it('writes the same stored dims for all members of a noisy cluster', () => {
    // Once parts are grouped, their stored size must be identical — otherwise
    // the engine sees them as distinct PartToCut entries downstream.
    const result = groupPartInfos([
      info('A', { thickness: 0.01905, width: 0.0826, length: 0.89535 }, 0),
      info('B', { thickness: 0.019051, width: 0.082601, length: 0.89535 }, 1),
    ]);
    expect(result.parts[0].size).toEqual(result.parts[1].size);
  });

  it('keeps parts separate when dims differ by more than the tolerance', () => {
    const result = groupPartInfos([
      info('A', { thickness: 0.019, width: 0.08, length: 0.9 }, 0),
      info('B', { thickness: 0.019, width: 0.085, length: 0.9 }, 1),
    ]);
    expect(new Set(result.parts.map((p) => p.partNumber)).size).toBe(2);
  });

  it('does not chain real different parts into one cluster', () => {
    // Three thicknesses: 3/4" (19.05), 13/16" (20.64), 7/8" (22.23). Each
    // pair is > tolerance apart, so they must stay distinct even though
    // they're "close" by woodworking standards.
    const result = groupPartInfos([
      info('A', { thickness: 0.01905, width: 0.1, length: 0.5 }, 0),
      info('B', { thickness: 0.02064, width: 0.1, length: 0.5 }, 1),
      info('C', { thickness: 0.02223, width: 0.1, length: 0.5 }, 2),
    ]);
    expect(new Set(result.parts.map((p) => p.partNumber)).size).toBe(3);
  });

  it('canonicalises W/L so a rotated instance groups with its peer', () => {
    // Same part, one stored as 100×200 the other as 200×100. Width always
    // becomes the smaller dimension, length the larger.
    const result = groupPartInfos([
      info('A', { thickness: 0.018, width: 0.1, length: 0.2 }, 0),
      info('B', { thickness: 0.018, width: 0.2, length: 0.1 }, 1),
    ]);
    expect(new Set(result.parts.map((p) => p.partNumber)).size).toBe(1);
    expect(result.parts[0].size.width).toBeLessThan(
      result.parts[0].size.length,
    );
  });
});
