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
    // Regression: FBX stores "the same" part with sub-micron AABB
    // differences (e.g. 19.050 vs 19.051). With 0.1mm grid-snap these
    // straddled the 19.05 boundary and split into separate rows.
    const result = groupPartInfos([
      info('A', { thickness: 0.01905, width: 0.0826, length: 0.89535 }, 0),
      info('B', { thickness: 0.019051, width: 0.0826, length: 0.89535 }, 1),
    ]);
    expect(result.parts.map((p) => p.partNumber)).toEqual([1, 1]);
  });

  it('writes the same stored dims for all members of a noisy cluster', () => {
    // Each part flows on into the engine as a PartToCut — if stored sizes
    // differ post-grouping, the engine treats them as distinct rects.
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

  it('groups a rotated instance with its un-rotated peer', () => {
    const result = groupPartInfos([
      info('A', { thickness: 0.018, width: 0.1, length: 0.2 }, 0),
      info('B', { thickness: 0.018, width: 0.2, length: 0.1 }, 1),
    ]);
    expect(result.parts.map((p) => p.partNumber)).toEqual([1, 1]);
    expect(result.parts[0].size.width).toBeLessThan(
      result.parts[0].size.length,
    );
  });
});
