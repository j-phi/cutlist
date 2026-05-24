import { describe, it, expect } from 'vitest';
import { umToMm, type Micrometres } from 'cutlist';
import type {
  ArrowPrimitive,
  DimensionEmit,
  LeaderPrimitive,
  LinePrimitive,
  TextPrimitive,
} from '../dimensions';
import {
  assignWaterfallLevels,
  drawOutsideWaterfall,
  levelOffsetPt,
  planOutsideWaterfall,
  waterfallStripPt,
  type OutsideGeom,
  type Span,
} from '../outsideDimensions';

function recorder() {
  const lines: LinePrimitive[] = [];
  const arrows: ArrowPrimitive[] = [];
  const texts: TextPrimitive[] = [];
  const leaders: LeaderPrimitive[] = [];
  const emit: DimensionEmit = {
    line: (p) => lines.push(p),
    arrow: (p) => arrows.push(p),
    text: (p) => texts.push(p),
    leader: (p) => leaders.push(p),
  };
  return { emit, lines, arrows, texts, leaders };
}

const span = (startUm: number, endUm: number): Span => ({ startUm, endUm });
const levelOf = (
  leveled: ReturnType<typeof assignWaterfallLevels>,
  s: number,
  e: number,
) => leveled.find((x) => x.startUm === s && x.endUm === e)!.level;

describe('assignWaterfallLevels', () => {
  it('collapses identical extents to a single dimension', () => {
    // A column of three equal-width parts → one width extent.
    const out = assignWaterfallLevels([
      span(0, 600),
      span(0, 600),
      span(0, 600),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0].level).toBe(0);
  });

  it('places nested extents on strictly increasing levels (smallest innermost)', () => {
    // BP9: a containing extent must sit outside everything it contains, so its
    // dimension line never crosses the shorter ones.
    const out = assignWaterfallLevels([
      span(0, 300),
      span(0, 100),
      span(0, 200),
    ]);
    expect(levelOf(out, 0, 100)).toBeLessThan(levelOf(out, 0, 200));
    expect(levelOf(out, 0, 200)).toBeLessThan(levelOf(out, 0, 300));
  });

  it('keeps abutting / disjoint extents on the same level (a chain)', () => {
    // Shared endpoints are not an overlap — a row of adjacent parts is one row.
    const out = assignWaterfallLevels([
      span(0, 100),
      span(100, 250),
      span(250, 400),
    ]);
    expect(out.every((s) => s.level === 0)).toBe(true);
  });

  it('separates partially-overlapping extents onto different levels', () => {
    const out = assignWaterfallLevels([span(0, 200), span(100, 300)]);
    expect(levelOf(out, 0, 200)).not.toBe(levelOf(out, 100, 300));
  });

  it('drops degenerate (zero / negative width) extents', () => {
    expect(assignWaterfallLevels([span(50, 50), span(100, 90)])).toHaveLength(
      0,
    );
  });
});

describe('planOutsideWaterfall', () => {
  it('derives width extents from left/right and height extents from bottom/top', () => {
    const plan = planOutsideWaterfall([
      {
        leftUm: 0 as Micrometres,
        rightUm: 100 as Micrometres,
        bottomUm: 0 as Micrometres,
        topUm: 50 as Micrometres,
      },
      {
        leftUm: 0 as Micrometres,
        rightUm: 100 as Micrometres,
        bottomUm: 50 as Micrometres,
        topUm: 90 as Micrometres,
      },
    ]);
    // Two equal-width parts stacked → one width extent; two distinct heights.
    expect(plan.width).toHaveLength(1);
    expect(plan.widthLevelCount).toBe(1);
    expect(plan.height).toHaveLength(2);
    expect(plan.heightLevelCount).toBe(1); // the two heights abut → same level
  });
});

describe('waterfallStripPt', () => {
  it('is zero with no levels and grows with depth', () => {
    expect(waterfallStripPt(0)).toBe(0);
    expect(waterfallStripPt(2)).toBeGreaterThan(waterfallStripPt(1));
    // The strip must clear at least the outermost dimension line.
    expect(waterfallStripPt(3)).toBeGreaterThan(levelOffsetPt(2));
  });
});

describe('drawOutsideWaterfall', () => {
  // Board 100 µm wide × 80 µm tall, drawn 1 pt per µm with the board origin at
  // page (200, 200) so the margins below / left are on-page.
  function geomFor(plan: ReturnType<typeof planOutsideWaterfall>): OutsideGeom {
    const boardX = 200;
    const boardY = 200;
    return {
      boardX,
      boardY,
      boardWpt: 100,
      boardHpt: 80,
      toPageX: (um) => boardX + um,
      toPageY: (um) => boardY + um,
      plan,
      formatSize: (um) => `${umToMm(um)}`,
      widthOf: (t, size) => t.length * size * 0.5,
    };
  }

  it('emits one width dim below and one height dim left per distinct extent', () => {
    const plan = planOutsideWaterfall([
      {
        leftUm: 0 as Micrometres,
        rightUm: 100 as Micrometres,
        bottomUm: 0 as Micrometres,
        topUm: 80 as Micrometres,
      },
    ]);
    const r = recorder();
    drawOutsideWaterfall(r.emit, geomFor(plan));
    // One width + one height extent → two value texts.
    expect(r.texts).toHaveLength(2);
    // Width text is horizontal, height text is rotated 90°.
    expect(r.texts.some((t) => t.rotate === 0)).toBe(true);
    expect(r.texts.some((t) => t.rotate === 90)).toBe(true);
  });

  it('stacks a containing extent further from the board than the one it contains', () => {
    // Nested widths 0–40 (inner) and 0–100 (outer). Width dims sit BELOW the
    // board (smaller y = further out), so the outer dim line must be below the
    // inner one — a direct check that dimension lines never cross (BP9).
    const plan = planOutsideWaterfall([
      {
        leftUm: 0 as Micrometres,
        rightUm: 40 as Micrometres,
        bottomUm: 0 as Micrometres,
        topUm: 80 as Micrometres,
      },
      {
        leftUm: 0 as Micrometres,
        rightUm: 100 as Micrometres,
        bottomUm: 0 as Micrometres,
        topUm: 80 as Micrometres,
      },
    ]);
    const r = recorder();
    drawOutsideWaterfall(r.emit, geomFor(plan));
    // The horizontal dimension lines are the ones at constant y spanning x.
    const innerY = 200 - levelOffsetPt(0);
    const outerY = 200 - levelOffsetPt(1);
    expect(outerY).toBeLessThan(innerY);
    // A dimension line exists at each level's y.
    const dimYs = new Set(
      r.lines.filter((l) => l.y1 === l.y2).map((l) => l.y1),
    );
    expect(dimYs.has(innerY)).toBe(true);
    expect(dimYs.has(outerY)).toBe(true);
  });
});
