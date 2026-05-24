import { describe, it, expect } from 'vitest';
import { umToMm, type Micrometres } from 'cutlist';
import { OccupancySet } from '../occupancy';
import {
  drawBoardRegions,
  deriveLeftoverRegions,
  deriveKerfStrips,
  REGION_STYLE,
  type RegionEmit,
  type RegionGeom,
  type RegionPrimitive,
  type RegionLabelPrimitive,
  type UmRect,
} from '../regions';

// Recording emit (typed-array pattern): assert on emitted primitives, not on
// pdf-lib draws.
function recorder() {
  const regions: RegionPrimitive[] = [];
  const labels: RegionLabelPrimitive[] = [];
  const emit: RegionEmit = {
    region: (p) => regions.push(p),
    label: (p) => labels.push(p),
  };
  return { emit, regions, labels };
}

/** Identity-ish geom: 1 page point per mm so µm boxes map to readable points,
 * with a deterministic 6-pt-per-char text width oracle. */
function makeGeom(usable: UmRect, occupancy = new OccupancySet()): RegionGeom {
  const toPage = (um: number) => umToMm(um as Micrometres); // 1 pt / mm
  return {
    usable,
    toPageX: toPage,
    toPageY: toPage,
    formatSize: (um) => `${Math.round(umToMm(um))} mm`,
    widthOf: (text, size) => text.length * size * 0.5,
    occupancy,
  };
}

const mm = (n: number) => (n * 1000) as unknown as number; // mm → µm

describe('board regions (F6)', () => {
  it('kerf strips and leftover regions use distinct style tokens (FR-VIZ-1)', () => {
    // Two parts side by side with a 3 mm blade gap between them, leaving a
    // leftover strip on the right of an 800×600 mm usable board.
    const kerfUm = mm(3);
    const placements: UmRect[] = [
      { leftUm: mm(0), rightUm: mm(200), bottomUm: mm(0), topUm: mm(400) },
      {
        leftUm: mm(203),
        rightUm: mm(403),
        bottomUm: mm(0),
        topUm: mm(400),
      },
    ];
    const usable: UmRect = {
      leftUm: mm(0),
      rightUm: mm(800),
      bottomUm: mm(0),
      topUm: mm(600),
    };
    const { emit, regions } = recorder();
    drawBoardRegions(emit, placements, makeGeom(usable), kerfUm);

    const kerf = regions.filter((r) => r.kind === 'kerf');
    const leftover = regions.filter((r) => r.kind === 'leftover');
    expect(kerf.length).toBeGreaterThan(0);
    expect(leftover.length).toBeGreaterThan(0);

    // The two kinds resolve to DISTINCT styles — kerf must not read as waste.
    expect(REGION_STYLE.kerf).not.toEqual(REGION_STYLE.leftover);
    expect(REGION_STYLE.kerf.pattern).not.toBe(REGION_STYLE.leftover.pattern);
  });

  it('labels a 600 × 400 mm leftover with its dimensions (FR-VIZ-2)', () => {
    // One part bottom-left of a 1000×400 usable board leaves a right strip that
    // is (1000-400)=600 wide × 400 tall → a 600 × 400 mm leftover region.
    const usable: UmRect = {
      leftUm: 0,
      rightUm: mm(1000),
      bottomUm: 0,
      topUm: mm(400),
    };
    const placements: UmRect[] = [
      { leftUm: 0, rightUm: mm(400), bottomUm: 0, topUm: mm(400) },
    ];
    const { emit, labels } = recorder();
    drawBoardRegions(emit, placements, makeGeom(usable), 0);

    // Region is 600 wide × 400 tall → label formats height × width.
    const found = labels.find((l) => l.text === '400 × 600 mm');
    expect(found).toBeDefined();
    // Label sits inside the right strip (x ≥ 400 in page points = mm here).
    expect(found!.x).toBeGreaterThanOrEqual(400);
  });

  it('derives the L-shaped leftover (right strip + top strip)', () => {
    // Cluster occupies bottom-left 300×200 of a 500×500 usable board.
    const placements: UmRect[] = [
      { leftUm: 0, rightUm: mm(300), bottomUm: 0, topUm: mm(200) },
    ];
    const usable: UmRect = {
      leftUm: 0,
      rightUm: mm(500),
      bottomUm: 0,
      topUm: mm(500),
    };
    const regions = deriveLeftoverRegions(placements, usable);
    // Right strip: x in [300,500], full height.
    expect(regions).toContainEqual({
      leftUm: mm(300),
      rightUm: mm(500),
      bottomUm: 0,
      topUm: mm(500),
    });
    // Top strip: x in [0,300], y in [200,500].
    expect(regions).toContainEqual({
      leftUm: 0,
      rightUm: mm(300),
      bottomUm: mm(200),
      topUm: mm(500),
    });
  });

  it('no kerf strips when blade width is zero', () => {
    const placements: UmRect[] = [
      { leftUm: 0, rightUm: mm(200), bottomUm: 0, topUm: mm(400) },
      { leftUm: mm(203), rightUm: mm(403), bottomUm: 0, topUm: mm(400) },
    ];
    expect(deriveKerfStrips(placements, 0)).toEqual([]);
  });

  it('showOffcutDimensions:false suppresses labels and dotted flag', () => {
    const usable: UmRect = {
      leftUm: 0,
      rightUm: mm(1000),
      bottomUm: 0,
      topUm: mm(400),
    };
    const placements: UmRect[] = [
      { leftUm: 0, rightUm: mm(400), bottomUm: 0, topUm: mm(400) },
    ];
    const { emit, regions, labels } = recorder();
    const geom = { ...makeGeom(usable), showOffcutDimensions: false };
    drawBoardRegions(emit, placements, geom, 0);

    expect(labels).toHaveLength(0);
    const leftovers = regions.filter((r) => r.kind === 'leftover');
    expect(leftovers.length).toBeGreaterThan(0);
    expect(leftovers.every((r) => !r.dotted)).toBe(true);
  });

  it('leftover label yields the slot to an occupied region', () => {
    // Pre-claim the entire right strip so the label cannot place.
    const usable: UmRect = {
      leftUm: 0,
      rightUm: mm(1000),
      bottomUm: 0,
      topUm: mm(400),
    };
    const placements: UmRect[] = [
      { leftUm: 0, rightUm: mm(400), bottomUm: 0, topUm: mm(400) },
    ];
    const occ = new OccupancySet();
    // Claim a big box over the right strip in PAGE POINTS (1 pt / mm here):
    // x in [400, 1000], y in [0, 400].
    occ.add({ x: 400, y: 0, w: 600, h: 400 });
    const { emit, labels } = recorder();
    drawBoardRegions(emit, placements, makeGeom(usable, occ), 0);
    expect(labels).toHaveLength(0);
  });
});
