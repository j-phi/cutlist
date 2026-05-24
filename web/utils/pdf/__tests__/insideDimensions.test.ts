import { describe, it, expect } from 'vitest';
import { umToMm, type Micrometres } from 'cutlist';
import { OccupancySet } from '../occupancy';
import type {
  ArrowPrimitive,
  DimensionEmit,
  LeaderPrimitive,
  LinePrimitive,
  TextPrimitive,
} from '../dimensions';
import { drawInsidePartDimensions, type InsideGeom } from '../insideDimensions';

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

function geomFor(
  pw: number,
  ph: number,
  occupancy = new OccupancySet(),
): InsideGeom {
  return {
    px: 100,
    py: 100,
    pw,
    ph,
    widthUm: 200000 as Micrometres,
    heightUm: 150000 as Micrometres,
    formatSize: (um) => `${umToMm(um)}`,
    widthOf: (t, size) => t.length * size * 0.5,
    occupancy,
  };
}

describe('drawInsidePartDimensions', () => {
  it('labels both the width (horizontal) and height (rotated) of the piece', () => {
    const r = recorder();
    drawInsidePartDimensions(r.emit, geomFor(200, 150));
    const horizontal = r.texts.find((t) => t.rotate === 0);
    const vertical = r.texts.find((t) => t.rotate === 90);
    expect(horizontal?.text).toBe('200'); // width
    expect(vertical?.text).toBe('150'); // height
  });

  it('draws dimensions even when the part rect already occupies the page', () => {
    // Regression: the caller adds the whole part rectangle to the shared
    // occupancy set before drawing. Interior text must NOT be suppressed by the
    // part's own rect (it lives inside it on purpose).
    const occ = new OccupancySet();
    occ.add({ x: 100, y: 100, w: 200, h: 150 });
    const r = recorder();
    drawInsidePartDimensions(r.emit, geomFor(200, 150, occ));
    expect(r.texts).toHaveLength(2);
  });

  it('separates the width label (low) from the height label (left) so they do not overlap', () => {
    const r = recorder();
    const geom = geomFor(200, 150);
    drawInsidePartDimensions(r.emit, geom);
    const cx = geom.px + geom.pw / 2;
    const cy = geom.py + geom.ph / 2;
    const horizontal = r.texts.find((t) => t.rotate === 0)!;
    const vertical = r.texts.find((t) => t.rotate === 90)!;
    // Width text sits in the lower band, height text in the left band.
    expect(horizontal.bbox.y).toBeLessThan(cy);
    expect(vertical.bbox.x).toBeLessThan(cx);
    // Their bounding boxes are disjoint.
    const a = horizontal.bbox;
    const b = vertical.bbox;
    const overlap =
      a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
    expect(overlap).toBe(false);
  });

  it('still draws the extent (lines + arrows) on a piece too small for text', () => {
    // Crowded condition: the value can't fit between the extension lines, but
    // the dimension lines and arrowheads are always drawn so the extent reads.
    const r = recorder();
    drawInsidePartDimensions(r.emit, geomFor(14, 14));
    // Two arrowheads per dimension × two dimensions.
    expect(r.arrows).toHaveLength(4);
    expect(r.lines.length).toBeGreaterThan(0);
  });
});
