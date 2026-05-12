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
    // (e.g. 19.050 vs 19.051 mm thickness) that straddle a 0.5 boundary
    // when rounded at 0.1 mm. Grouping must absorb that.
    const result = groupPartInfos([
      info('A', { thickness: 0.01905, width: 0.0826, length: 0.89535 }, 0),
      info('B', { thickness: 0.019051, width: 0.0826, length: 0.89535 }, 1),
    ]);
    expect(result.parts).toHaveLength(2);
    expect(result.parts[0].partNumber).toBe(1);
    expect(result.parts[1].partNumber).toBe(1);
  });

  it('keeps parts separate when dims differ by more than the tolerance', () => {
    const result = groupPartInfos([
      info('A', { thickness: 0.019, width: 0.08, length: 0.9 }, 0),
      info('B', { thickness: 0.019, width: 0.085, length: 0.9 }, 1),
    ]);
    expect(new Set(result.parts.map((p) => p.partNumber)).size).toBe(2);
  });
});
