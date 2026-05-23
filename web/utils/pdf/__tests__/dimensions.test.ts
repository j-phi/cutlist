import { describe, it, expect } from 'vitest';
import { rgb } from 'pdf-lib';
import { mmToUm, umToMm, type Micrometres } from 'cutlist';
import { MM } from '../constants';
import { OccupancySet, aabbIntersects, type Aabb } from '../occupancy';
import {
  drawPartDimensions,
  DIMENSION_COLOR,
  DIM_TEXT_PADDING,
  type ArrowPrimitive,
  type DimensionEmit,
  type DimensionGeom,
  type DimensionPart,
  type LeaderPrimitive,
  type LinePrimitive,
  type TextPrimitive,
} from '../dimensions';

// Deterministic text-width oracle: width = chars · size · 0.5. Stand-in for
// font.widthOfTextAtSize so geometry assertions are exact.
const widthOf = (text: string, size: number) => text.length * size * 0.5;

interface Recorder extends DimensionEmit {
  lines: LinePrimitive[];
  arrows: ArrowPrimitive[];
  texts: TextPrimitive[];
  leaders: LeaderPrimitive[];
}

function recorder(): Recorder {
  const lines: LinePrimitive[] = [];
  const arrows: ArrowPrimitive[] = [];
  const texts: TextPrimitive[] = [];
  const leaders: LeaderPrimitive[] = [];
  return {
    lines,
    arrows,
    texts,
    leaders,
    line: (p) => lines.push(p),
    arrow: (p) => arrows.push(p),
    text: (p) => texts.push(p),
    leader: (p) => leaders.push(p),
  };
}

// Build geom for a part of (wMm × hMm) at 1:scale, placed at page point
// origin (px, py). formatSize defaults to a mm string.
function geomFor(
  wMm: number,
  hMm: number,
  scale: number,
  opts: {
    px?: number;
    py?: number;
    occupancy?: OccupancySet;
    formatSize?: (um: Micrometres) => string | undefined;
  } = {},
): DimensionGeom {
  const px = opts.px ?? 100;
  const py = opts.py ?? 100;
  return {
    px,
    py,
    pw: (wMm / scale) * MM,
    ph: (hMm / scale) * MM,
    formatSize: opts.formatSize ?? ((um) => `${Math.round(umToMm(um))}mm`),
    widthOf,
    occupancy: opts.occupancy ?? new OccupancySet(),
  };
}

function partFor(
  wMm: number,
  hMm: number,
  partColor?: ReturnType<typeof rgb>,
): DimensionPart {
  return {
    leftUm: 0 as Micrometres,
    rightUm: mmToUm(wMm),
    bottomUm: 0 as Micrometres,
    topUm: mmToUm(hMm),
    partColor,
  };
}

describe('drawPartDimensions', () => {
  it('FR-DIM-1: emits two value-texts and four arrowheads for a comfortable part', () => {
    const r = recorder();
    drawPartDimensions(r, partFor(600, 400), geomFor(600, 400, 10));
    expect(r.texts.length).toBe(2);
    expect(r.arrows.length).toBe(4);
  });

  it('FR-DIM-2: X value-text center == part X-center (±0.5pt)', () => {
    const r = recorder();
    const geom = geomFor(600, 400, 10);
    drawPartDimensions(r, partFor(600, 400), geom);
    const xText = r.texts.find((t) => t.rotate === 0)!;
    const partCx = geom.px + geom.pw / 2;
    const textCx = xText.x + (xText.bbox.w ?? 0) / 2;
    expect(Math.abs(textCx - partCx)).toBeLessThanOrEqual(0.5);
  });

  it('FR-DIM-3: comfortable edge breaks the X line into two collinear, symmetric segments with gap = textW + 2·padding', () => {
    const r = recorder();
    const geom = geomFor(600, 400, 10);
    const label = '600mm';
    drawPartDimensions(r, partFor(600, 400), geom);

    const xLineY = geom.py - 5; // DIM_INSET_PT
    // The two thick (0.6) horizontal segments at the X dimension line.
    const segs = r.lines.filter(
      (l) => l.thickness === 0.6 && l.y1 === xLineY && l.y2 === xLineY,
    );
    expect(segs.length).toBe(2);
    const left = segs.find((s) => s.x1 === geom.px)!;
    const right = segs.find((s) => s.x2 === geom.px + geom.pw)!;
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();

    const mid = geom.px + geom.pw / 2;
    // Both collinear (same y already filtered). Symmetric about midpoint.
    const leftInner = left.x2;
    const rightInner = right.x1;
    expect(Math.abs(mid - leftInner - (rightInner - mid))).toBeLessThan(1e-6);

    const expectedGap = widthOf(label, 7) + 2 * DIM_TEXT_PADDING;
    expect(rightInner - leftInner).toBeCloseTo(expectedGap, 6);
  });

  it('FR-DIM-4: a 30×400 part emits an X leader and no inline X value-text', () => {
    const r = recorder();
    const geom = geomFor(30, 400, 10);
    drawPartDimensions(r, partFor(30, 400), geom);

    // X is too narrow → leader emitted.
    expect(r.leaders.length).toBeGreaterThanOrEqual(1);
    // No X value-text inside the part box.
    const boxX1 = geom.px;
    const boxX2 = geom.px + geom.pw;
    const boxY1 = geom.py;
    const boxY2 = geom.py + geom.ph;
    const insideXText = r.texts.find(
      (t) =>
        t.rotate === 0 &&
        t.bbox.x + t.bbox.w > boxX1 &&
        t.bbox.x < boxX2 &&
        t.bbox.y + t.bbox.h > boxY1 &&
        t.bbox.y < boxY2,
    );
    expect(insideXText).toBeUndefined();
  });

  it('FR-DIM-5: two adjacent narrow parts forcing leaders never overlap recorded text bboxes', () => {
    const occupancy = new OccupancySet();
    const r = recorder();
    // Two narrow parts side by side, sharing the page occupancy set. Both
    // force X leaders that drop below the box; the second must dodge the first.
    const geomA = geomFor(30, 400, 10, { px: 100, py: 200, occupancy });
    const geomB = geomFor(30, 400, 10, {
      px: 100 + geomA.pw + 2,
      py: 200,
      occupancy,
    });
    drawPartDimensions(r, partFor(30, 400), geomA);
    drawPartDimensions(r, partFor(30, 400), geomB);

    const boxes = r.texts.map((t) => t.bbox);
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        expect(aabbIntersects(boxes[i], boxes[j])).toBe(false);
      }
    }
  });

  it('FR-DIM-6: width value-text comes straight from formatSize', () => {
    const r = recorder();
    const formatSize = (um: Micrometres) =>
      um === mmToUm(600) ? 'WIDTH_TOKEN' : 'OTHER';
    drawPartDimensions(
      r,
      partFor(600, 400),
      geomFor(600, 400, 10, { formatSize }),
    );
    const widthText = r.texts.find((t) => t.rotate === 0)!;
    expect(widthText.text).toBe('WIDTH_TOKEN');
  });

  it('FR-DIM-7: a part hue never leaks into dimension strokes', () => {
    const r = recorder();
    const red = rgb(1, 0, 0);
    drawPartDimensions(r, partFor(600, 400, red), geomFor(600, 400, 10));
    const sameColor = (c: ReturnType<typeof rgb>) =>
      c.red === DIMENSION_COLOR.red &&
      c.green === DIMENSION_COLOR.green &&
      c.blue === DIMENSION_COLOR.blue;
    for (const l of r.lines) expect(sameColor(l.color)).toBe(true);
    for (const a of r.arrows) expect(sameColor(a.color)).toBe(true);
    for (const ld of r.leaders) expect(sameColor(ld.color)).toBe(true);
  });

  it('FR-DIM-8: portrait part rotates the height value-text 90° and centers it on Y (±0.5pt)', () => {
    const r = recorder();
    const geom = geomFor(400, 600, 10); // portrait: taller than wide
    drawPartDimensions(r, partFor(400, 600), geom);
    const yText = r.texts.find((t) => t.rotate === 90)!;
    expect(yText).toBeTruthy();
    expect(yText.rotate).toBe(90);
    // 90° text baseline runs up +Y from originY; its center is originY + h/2.
    const textCy = yText.bbox.y + yText.bbox.h / 2;
    const partCy = geom.py + geom.ph / 2;
    expect(Math.abs(textCy - partCy)).toBeLessThanOrEqual(0.5);
  });
});

describe('OccupancySet', () => {
  it('reports intersection only for genuinely overlapping rects (touching edges do not count)', () => {
    const set = new OccupancySet();
    const a: Aabb = { x: 0, y: 0, w: 10, h: 10 };
    set.add(a);
    expect(set.intersects({ x: 5, y: 5, w: 10, h: 10 })).toBe(true);
    // Shares the right edge only — no area overlap.
    expect(set.intersects({ x: 10, y: 0, w: 10, h: 10 })).toBe(false);
    // Fully separated.
    expect(set.intersects({ x: 100, y: 100, w: 5, h: 5 })).toBe(false);
  });
});
