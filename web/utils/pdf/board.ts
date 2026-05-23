import { degrees, rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import { umToMm, type Micrometres, type SheetBoardLayout } from 'cutlist';
import type { RulerMeasurement } from '~/composables/useRulerStore';
import {
  BOARD_TITLE_BAND_MM,
  FOOTER_BAND_MM,
  HEADER_BAND_MM,
  LEGEND_BAND_MM,
  LETTER_H_MM,
  LETTER_W_MM,
  MM,
} from './constants';
import { addPage, type Ctx } from './context';
import {
  drawArrowH,
  drawArrowV,
  drawClippedHatch,
  drawClippedLine,
  drawClippedRect,
  drawTileBorder,
} from './geometry';
import { drawMeasurement } from './measurements';
import {
  drawPartDimensions,
  type DimensionEmit,
  type DimensionGeom,
} from './dimensions';
import {
  drawBoardRegions,
  REGION_STYLE,
  type RegionEmit,
  type RegionGeom,
  type UmRect,
} from './regions';
import { partColorRgb } from 'cutlist';

/**
 * Find the smallest integer scale ≥ 1 that fits the board on a single page.
 * Orientation (portrait/landscape) follows the board's own aspect ratio.
 */
export function computeBoardScale(
  boardWmm: number,
  boardHmm: number,
  margin: number,
): number {
  const landscape = boardWmm > boardHmm;
  const pageWmm = landscape ? LETTER_H_MM : LETTER_W_MM;
  const pageHmm = landscape ? LETTER_W_MM : LETTER_H_MM;
  const printableWmm = pageWmm - 2 * margin - LEGEND_BAND_MM;
  const printableHmm =
    pageHmm -
    2 * margin -
    HEADER_BAND_MM -
    BOARD_TITLE_BAND_MM -
    FOOTER_BAND_MM;
  const minScale = Math.max(boardWmm / printableWmm, boardHmm / printableHmm);
  return Math.max(1, Math.ceil(minScale));
}

/** Indigo-500 (Tailwind) for material-allowance hatching. */
const ALLOWANCE_COLOR = rgb(0.388, 0.4, 0.945);

interface TileGeom {
  pageWmm: number;
  pageHmm: number;
  paperWmm: number; // full board width on paper at scale
  paperHmm: number; // full board height on paper at scale
  printableWmm: number;
  printableHmm: number;
}

export function drawBoardTiles(
  ctx: Ctx,
  layout: SheetBoardLayout,
  boardIndex: number,
  totalBoards: number,
  measurements: RulerMeasurement[],
) {
  const stock = layout.stock;
  const boardWmm = umToMm(stock.widthUm);
  const boardLmm = umToMm(stock.lengthUm);

  const effectiveScale =
    ctx.opts.scale === 'auto'
      ? computeBoardScale(boardWmm, boardLmm, ctx.opts.margin)
      : ctx.opts.scale;

  // Paper dimensions (mm) at the chosen scale
  const paperWmm = boardWmm / effectiveScale;
  const paperHmm = boardLmm / effectiveScale;

  // Decide page orientation per board so the board fills as much as possible
  const landscape = paperWmm > paperHmm;
  const pageWmm = landscape ? LETTER_H_MM : LETTER_W_MM;
  const pageHmm = landscape ? LETTER_W_MM : LETTER_H_MM;

  const margin = ctx.opts.margin;
  const overlap = ctx.opts.tileOverlap;
  const printableWmm = pageWmm - 2 * margin - LEGEND_BAND_MM; // legend column on the right
  const printableHmm =
    pageHmm -
    2 * margin -
    HEADER_BAND_MM -
    BOARD_TITLE_BAND_MM -
    FOOTER_BAND_MM;

  const stepWmm = Math.max(1, printableWmm - overlap);
  const stepHmm = Math.max(1, printableHmm - overlap);
  const cols = Math.max(1, Math.ceil((paperWmm - overlap) / stepWmm));
  const rows = Math.max(1, Math.ceil((paperHmm - overlap) / stepHmm));

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      drawBoardTilePage(
        ctx,
        layout,
        boardIndex,
        totalBoards,
        col,
        row,
        cols,
        rows,
        { pageWmm, pageHmm, paperWmm, paperHmm, printableWmm, printableHmm },
        measurements,
        effectiveScale,
      );
    }
  }
}

function drawBoardTilePage(
  ctx: Ctx,
  layout: SheetBoardLayout,
  boardIndex: number,
  totalBoards: number,
  col: number,
  row: number,
  cols: number,
  rows: number,
  geom: TileGeom,
  measurements: RulerMeasurement[],
  effectiveScale: number,
) {
  const { formatSize, showPartNumbers, showBomName } = ctx.opts;
  const margin = ctx.opts.margin;
  const overlap = ctx.opts.tileOverlap;
  const stock = layout.stock;
  const scale = effectiveScale;

  const subtitle =
    cols * rows > 1
      ? `Board ${boardIndex}/${totalBoards} · Tile ${col + 1},${row + 1} of ${cols}×${rows} · Scale 1:${scale}`
      : `Board ${boardIndex}/${totalBoards} · Scale 1:${scale}`;

  const page = addPage(ctx, { wMm: geom.pageWmm, hMm: geom.pageHmm }, subtitle);
  const { width: pageW, height: pageH } = page.getSize();

  // Board title area: two lines below the header rule.
  const titleAreaTop = pageH - (margin + HEADER_BAND_MM) * MM;
  const stockNameY = titleAreaTop - 13; // first line baseline
  const materialY = titleAreaTop - 27; // second line baseline

  // Line 1: stock name (prominent)
  const stockName = (stock as { name?: string }).name || stock.material;
  page.drawText(stockName, {
    x: margin * MM,
    y: stockNameY,
    size: 12,
    font: ctx.fontBold,
    color: rgb(0.08, 0.08, 0.08),
  });

  // Offcut badge — amber, right-aligned on the same line as the stock name
  const isOffcut = (stock as { role?: string }).role === 'offcut';
  if (isOffcut) {
    const badge = 'OFFCUT';
    const badgeW = ctx.fontBold.widthOfTextAtSize(badge, 8);
    page.drawText(badge, {
      x: pageW - margin * MM - badgeW,
      y: stockNameY + 1,
      size: 8,
      font: ctx.fontBold,
      color: rgb(0.85, 0.55, 0.1),
    });
  }

  // Line 2: material + dimensions (smaller, dimmer)
  const sizeText = `${formatSize(stock.lengthUm) ?? ''} × ${formatSize(stock.widthUm) ?? ''} × ${formatSize(stock.thicknessUm) ?? ''}`;
  page.drawText(`${stock.material}  ·  ${sizeText}`, {
    x: margin * MM,
    y: materialY,
    size: 9,
    font: ctx.font,
    color: rgb(0.35, 0.35, 0.35),
  });

  // Scale legend on the right side of the material line
  drawScaleLegend(ctx, page, pageW, materialY, scale);

  // Tile area in PDF points
  const tileXmm = margin;
  const tileYmm = margin + FOOTER_BAND_MM;
  const tileWpt = geom.printableWmm * MM;
  const tileHpt = geom.printableHmm * MM;
  const tileXpt = tileXmm * MM;
  const tileYpt = tileYmm * MM;
  const tileTopYpt = tileYpt + tileHpt;

  const stepWpt = (geom.printableWmm - overlap) * MM;
  const stepHpt = (geom.printableHmm - overlap) * MM;

  // Board outline in board-paper coordinates
  const boardWpt = geom.paperWmm * MM;
  const boardHpt = geom.paperHmm * MM;

  // Anchor the board's top-left to the tile's top-left for tile (0,0).
  // Each column step shifts the board left; each row step shifts it up so
  // the next section below is revealed in the fixed tile window.
  const boardX = tileXpt - col * stepWpt;
  const boardY = tileTopYpt - boardHpt + row * stepHpt;

  // Clip everything to the tile rectangle by drawing a clip box. pdf-lib
  // doesn't directly expose clipping for us, so we instead draw all rects with
  // intersection math.
  drawTileBorder(page, tileXpt, tileYpt, tileWpt, tileHpt);

  // Board outline (intersection with tile)
  drawClippedRect(
    page,
    boardX,
    boardY,
    boardWpt,
    boardHpt,
    tileXpt,
    tileYpt,
    tileWpt,
    tileHpt,
    {
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.8,
      color: rgb(0.96, 0.96, 0.96),
    },
  );

  // Parts
  for (const placement of layout.placements) {
    const placedWidthMm = umToMm(
      (placement.rightUm - placement.leftUm) as Micrometres,
    );
    const placedLengthMm = umToMm(
      (placement.topUm - placement.bottomUm) as Micrometres,
    );
    const px = boardX + (umToMm(placement.leftUm) / scale) * MM;
    const py = boardY + (umToMm(placement.bottomUm) / scale) * MM;
    const pw = (placedWidthMm / scale) * MM;
    const ph = (placedLengthMm / scale) * MM;
    // FR-VIZ-3: per-part hue fill when enabled, else white (grayscale default).
    const partFill = ctx.opts.colorParts
      ? (() => {
          const c = partColorRgb(placement.partNumber);
          return rgb(c.r, c.g, c.b);
        })()
      : rgb(1, 1, 1);
    drawClippedRect(page, px, py, pw, ph, tileXpt, tileYpt, tileWpt, tileHpt, {
      borderColor: rgb(0.1, 0.1, 0.1),
      borderWidth: 0.5,
      color: partFill,
    });

    // Indigo allowance hatch on the +X / +Y edges; the two strips overlap
    // at the corner to mark the L-shaped allowance region.
    const allowWpt = (umToMm(placement.allowanceWidthUm) / scale) * MM;
    const allowHpt = (umToMm(placement.allowanceLengthUm) / scale) * MM;
    if (allowWpt > 0) {
      drawClippedHatch(
        page,
        px + pw - allowWpt,
        py,
        allowWpt,
        ph,
        tileXpt,
        tileYpt,
        tileWpt,
        tileHpt,
        { color: ALLOWANCE_COLOR, spacing: 2, thickness: 0.3 },
      );
    }
    if (allowHpt > 0) {
      drawClippedHatch(
        page,
        px,
        py + ph - allowHpt,
        pw,
        allowHpt,
        tileXpt,
        tileYpt,
        tileWpt,
        tileHpt,
        { color: ALLOWANCE_COLOR, spacing: 2, thickness: 0.3 },
      );
    }
    // Part number — top-right corner (matches on-screen PartListItem).
    if (showPartNumbers) {
      const ONE_INCH_MM = 25.4;
      const realCapMm = Math.min(placedWidthMm / 2, ONE_INCH_MM);
      const fontPt = (realCapMm / scale) * MM;
      const MIN_PART_LABEL_PT = 4;
      const MAX_PART_LABEL_PT = 14;
      const usePt = Math.max(
        MIN_PART_LABEL_PT,
        Math.min(fontPt, MAX_PART_LABEL_PT),
      );
      const label = String(placement.partNumber);
      const textW = ctx.font.widthOfTextAtSize(label, usePt);
      const lx = px + pw - textW - 2;
      const ly = py + ph - usePt - 1;
      if (
        lx >= tileXpt &&
        lx + textW <= tileXpt + tileWpt &&
        ly >= tileYpt &&
        ly + usePt <= tileYpt + tileHpt
      ) {
        page.drawText(label, {
          x: lx,
          y: ly,
          size: usePt,
          font: ctx.font,
          color: rgb(0.2, 0.2, 0.2),
        });
      }
    }

    // Claim the part rectangle so label/dimension text never sits on top of
    // another piece (FR-DIM-5). The visible (clipped) portion is what matters.
    const visX1 = Math.max(px, tileXpt);
    const visY1 = Math.max(py, tileYpt);
    const visX2 = Math.min(px + pw, tileXpt + tileWpt);
    const visY2 = Math.min(py + ph, tileYpt + tileHpt);
    if (visX2 > visX1 && visY2 > visY1) {
      ctx.occupancy.add({
        x: visX1,
        y: visY1,
        w: visX2 - visX1,
        h: visY2 - visY1,
      });
    }

    // Engineering dimension lines (F14): per-axis broken dimension line with
    // extension lines, arrowheads, and centered value text via formatSize.
    if (ctx.opts.showDimensions) {
      const emit = makePartDimensionEmit(
        ctx,
        page,
        tileXpt,
        tileYpt,
        tileWpt,
        tileHpt,
      );
      const geom: DimensionGeom = {
        px,
        py,
        pw,
        ph,
        formatSize,
        widthOf: (text, size) => ctx.font.widthOfTextAtSize(text, size),
        occupancy: ctx.occupancy,
      };
      drawPartDimensions(
        emit,
        {
          leftUm: placement.leftUm,
          rightUm: placement.rightUm,
          bottomUm: placement.bottomUm,
          topUm: placement.topUm,
        },
        geom,
      );
    }

    // Part name label (dimensions handled above by drawPartDimensions).
    const nameToDraw = showBomName ? (placement.name ?? null) : null;
    if (nameToDraw) {
      drawPartLabels(
        ctx,
        page,
        nameToDraw,
        px,
        py,
        pw,
        ph,
        placedWidthMm,
        placedLengthMm,
        scale,
        tileXpt,
        tileYpt,
        tileWpt,
        tileHpt,
      );
    }
  }

  // Kerf strips + leftover-region labels (F6). Derived purely from the placed
  // (already-aligned, F13) rectangles within the usable area. Drawn after parts
  // so leftover labels avoid the part/dimension bboxes already in `occupancy`.
  {
    const toPageX = (um: number) =>
      boardX + (umToMm(um as Micrometres) / scale) * MM;
    const toPageY = (um: number) =>
      boardY + (umToMm(um as Micrometres) / scale) * MM;
    const m = layout.marginUm ?? 0;
    const usable: UmRect = {
      leftUm: m,
      rightUm: stock.widthUm - m,
      bottomUm: m,
      topUm: stock.lengthUm - m,
    };
    const placementRects: UmRect[] = layout.placements.map((p) => ({
      leftUm: p.leftUm,
      rightUm: p.rightUm,
      bottomUm: p.bottomUm,
      topUm: p.topUm,
    }));
    const regionGeom: RegionGeom = {
      usable,
      toPageX,
      toPageY,
      formatSize,
      widthOf: (text, size) => ctx.font.widthOfTextAtSize(text, size),
      occupancy: ctx.occupancy,
    };
    drawBoardRegions(
      makeRegionEmit(ctx, page, tileXpt, tileYpt, tileWpt, tileHpt),
      placementRects,
      regionGeom,
      ctx.opts.bladeWidthUm ?? 0,
    );
  }

  // Ruler measurements
  for (const m of measurements) {
    drawMeasurement(
      ctx,
      page,
      m,
      boardX,
      boardY,
      scale,
      tileXpt,
      tileYpt,
      tileWpt,
      tileHpt,
    );
  }
}

/**
 * Draw the part name inside the placed rectangle.
 *
 * Landscape pieces: name centered. Portrait pieces: name rotated 90° CCW,
 * centered on the narrow axis. Dimensions are NOT drawn here — engineering
 * dimension lines are emitted separately by {@link drawPartDimensions}.
 *
 * Text is centered on the *visible* portion of the piece within the tile so
 * that pieces near tile edges still receive a label. Font sizes scale down to
 * a minimum before the label is dropped.
 */
function drawPartLabels(
  ctx: Ctx,
  page: ReturnType<Ctx['doc']['addPage']>,
  name: string,
  px: number,
  py: number,
  pw: number,
  ph: number,
  placedWidthMm: number,
  placedLengthMm: number,
  scale: number,
  tileXpt: number,
  tileYpt: number,
  tileWpt: number,
  tileHpt: number,
) {
  // Clamp to visible portion — pieces near tile edges use their visible centre.
  const visX1 = Math.max(px, tileXpt);
  const visY1 = Math.max(py, tileYpt);
  const visX2 = Math.min(px + pw, tileXpt + tileWpt);
  const visY2 = Math.min(py + ph, tileYpt + tileHpt);
  if (visX2 <= visX1 || visY2 <= visY1) return;

  const isPortrait = placedLengthMm > placedWidthMm;
  const shortMm = Math.min(placedWidthMm, placedLengthMm);
  const visLongPt = isPortrait ? visY2 - visY1 : visX2 - visX1;
  const ONE_INCH_MM = 25.4;
  const MIN_NAME_PT = 4;

  // Compute font size + rendered width, scaling down proportionally before
  // dropping the label so small pieces still receive readable (if tiny) text.
  const capMm = Math.min(shortMm / 3, ONE_INCH_MM);
  let pt = Math.min(14, Math.max(MIN_NAME_PT, (capMm / scale) * MM));
  let w = ctx.font.widthOfTextAtSize(name, pt);
  if (w > visLongPt * 0.85) {
    pt = Math.max(MIN_NAME_PT, (pt * visLongPt * 0.85) / w);
    w = ctx.font.widthOfTextAtSize(name, pt);
    if (w > visLongPt) return; // even min size won't fit
  }

  const visCx = (visX1 + visX2) / 2;
  const visCy = (visY1 + visY2) / 2;

  if (isPortrait) {
    // Rotated 90° CCW, centered on both axes.
    page.drawText(name, {
      x: visCx + pt / 2,
      y: visCy - w / 2,
      size: pt,
      font: ctx.font,
      color: rgb(0.2, 0.2, 0.2),
      rotate: degrees(90),
    });
  } else {
    const lx = visCx - w / 2;
    const ly = visCy - pt / 2;
    if (
      lx >= tileXpt &&
      lx + w <= tileXpt + tileWpt &&
      ly >= tileYpt &&
      ly + pt <= tileYpt + tileHpt
    ) {
      page.drawText(name, {
        x: lx,
        y: ly,
        size: pt,
        font: ctx.font,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
  }
}

/**
 * Real PDF render sink for {@link drawPartDimensions}. Translates the pure
 * primitive records into pdf-lib draws, clipped to the tile rectangle. Text is
 * dropped if its origin falls outside the tile (matches the existing
 * label-clipping behaviour).
 */
function makePartDimensionEmit(
  ctx: Ctx,
  page: PDFPage,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
): DimensionEmit {
  return {
    line(p) {
      drawClippedLine(
        page,
        p.x1,
        p.y1,
        p.x2,
        p.y2,
        cx,
        cy,
        cw,
        ch,
        p.thickness,
        p.color,
      );
    },
    arrow(p) {
      if (p.axis === 'h') {
        drawArrowH(
          page,
          p.tipX,
          p.tipY,
          p.dir,
          p.size,
          cx,
          cy,
          cw,
          ch,
          p.color,
        );
      } else {
        drawArrowV(
          page,
          p.tipX,
          p.tipY,
          p.dir,
          p.size,
          cx,
          cy,
          cw,
          ch,
          p.color,
        );
      }
    },
    leader(p) {
      drawClippedLine(
        page,
        p.x1,
        p.y1,
        p.x2,
        p.y2,
        cx,
        cy,
        cw,
        ch,
        p.thickness,
        p.color,
      );
    },
    text(p) {
      // Drop text whose bbox does not lie within the tile.
      if (
        p.bbox.x < cx ||
        p.bbox.x + p.bbox.w > cx + cw ||
        p.bbox.y < cy ||
        p.bbox.y + p.bbox.h > cy + ch
      ) {
        return;
      }
      page.drawText(p.text, {
        x: p.x,
        y: p.y,
        size: p.size,
        font: ctx.font,
        color: p.color,
        rotate: degrees(p.rotate),
      });
    },
  };
}

/**
 * Real PDF render sink for {@link drawBoardRegions}. Kerf strips render as a
 * solid fill (the saw ate this); leftover regions render as a hatched fill with
 * a faint border (reusable offcut) — two visually distinct styles (FR-VIZ-1).
 * Region labels render as plain clipped text (FR-VIZ-2).
 */
function makeRegionEmit(
  ctx: Ctx,
  page: PDFPage,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
): RegionEmit {
  return {
    region(p) {
      const style = REGION_STYLE[p.kind];
      if (style.pattern === 'solid') {
        drawClippedRect(page, p.x, p.y, p.w, p.h, cx, cy, cw, ch, {
          color: style.color,
        });
      } else {
        drawClippedHatch(page, p.x, p.y, p.w, p.h, cx, cy, cw, ch, {
          color: style.color,
          spacing: 4,
          thickness: 0.4,
        });
        drawClippedRect(page, p.x, p.y, p.w, p.h, cx, cy, cw, ch, {
          borderColor: style.color,
          borderWidth: 0.4,
        });
      }
    },
    label(p) {
      if (
        p.bbox.x < cx ||
        p.bbox.x + p.bbox.w > cx + cw ||
        p.bbox.y < cy ||
        p.bbox.y + p.bbox.h > cy + ch
      ) {
        return;
      }
      page.drawText(p.text, {
        x: p.x,
        y: p.y,
        size: p.size,
        font: ctx.font,
        color: p.color,
      });
    },
  };
}

function drawScaleLegend(
  ctx: Ctx,
  page: PDFPage,
  pageW: number,
  baselineY: number,
  scale: number,
) {
  // 100mm of real-world (or 50mm for 1:1) bar length
  const realMm = scale === 1 ? 50 : 100;
  const barMm = realMm / scale;
  const barPt = barMm * MM;
  const margin = ctx.opts.margin;
  const label = `${realMm} mm  ·  Scale 1:${scale}`;
  const labelW = ctx.font.widthOfTextAtSize(label, 8);
  // Right-align the label; the bar sits just below it at the same right edge.
  const right = pageW - margin * MM;
  const labelX = right - labelW;
  const barX = right - barPt;
  const barY = baselineY - 2;

  page.drawText(label, {
    x: labelX,
    y: baselineY + 4,
    size: 8,
    font: ctx.font,
    color: rgb(0.2, 0.2, 0.2),
  });
  page.drawLine({
    start: { x: barX, y: barY },
    end: { x: barX + barPt, y: barY },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: barX, y: barY - 2 },
    end: { x: barX, y: barY + 2 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
  page.drawLine({
    start: { x: barX + barPt, y: barY - 2 },
    end: { x: barX + barPt, y: barY + 2 },
    thickness: 1,
    color: rgb(0, 0, 0),
  });
}
