import { degrees, rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import { umToMm, type Micrometres, type SheetBoardLayout } from 'cutlist';
import type { RulerMeasurement } from '~/composables/useRulerStore';
import type { PdfScale } from '../exportPdf';
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
import { drawClippedHatch, drawClippedRect, drawTileBorder } from './geometry';
import { drawMeasurement } from './measurements';

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
  const { scale } = ctx.opts;
  const stock = layout.stock;
  const boardWmm = umToMm(stock.widthUm);
  const boardLmm = umToMm(stock.lengthUm);
  // Paper dimensions (mm) at the chosen scale
  const paperWmm = boardWmm / scale;
  const paperHmm = boardLmm / scale;

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
) {
  const { scale, formatSize, showPartNumbers, showBomName } = ctx.opts;
  const margin = ctx.opts.margin;
  const overlap = ctx.opts.tileOverlap;
  const stock = layout.stock;

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
    drawClippedRect(page, px, py, pw, ph, tileXpt, tileYpt, tileWpt, tileHpt, {
      borderColor: rgb(0.1, 0.1, 0.1),
      borderWidth: 0.5,
      color: rgb(1, 1, 1),
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

    // Part name — centered in the piece, rotated 90° for portrait pieces.
    if (showBomName && placement.name) {
      drawPartName(
        ctx,
        page,
        placement.name,
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
 * Draw the part name centered inside its placed rectangle.
 * Portrait pieces (taller than wide) get the text rotated 90° CCW so it reads
 * along the long axis without overflowing the narrow width.
 */
function drawPartName(
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
  const isPortrait = placedLengthMm > placedWidthMm;
  const shortMm = Math.min(placedWidthMm, placedLengthMm);
  const longPt = ((isPortrait ? placedLengthMm : placedWidthMm) / scale) * MM;

  // Font size: cap at one-third of the shorter physical dimension, max 14pt.
  const ONE_INCH_MM = 25.4;
  const capMm = Math.min(shortMm / 3, ONE_INCH_MM);
  const rawPt = (capMm / scale) * MM;
  const namePt = Math.max(5, Math.min(14, rawPt));

  const textW = ctx.font.widthOfTextAtSize(name, namePt);

  // Skip if text would overflow more than 85% of the long dimension.
  if (textW > longPt * 0.85) return;

  const cx = px + pw / 2;
  const cy = py + ph / 2;

  if (isPortrait) {
    // 90° CCW rotation: text width maps to the vertical axis, height to horizontal.
    // Origin is placed so the visual center of the text lands at (cx, cy).
    const originX = cx + namePt / 2;
    const originY = cy - textW / 2;

    // Verify the piece itself is at least partially inside the tile before drawing.
    if (px + pw < tileXpt || px > tileXpt + tileWpt) return;
    if (py + ph < tileYpt || py > tileYpt + tileHpt) return;

    page.drawText(name, {
      x: originX,
      y: originY,
      size: namePt,
      font: ctx.font,
      color: rgb(0.2, 0.2, 0.2),
      rotate: degrees(90),
    });
  } else {
    // Horizontal: center the text in the rectangle.
    const lx = cx - textW / 2;
    const ly = cy - namePt / 2;

    // Only draw if fully inside tile.
    if (
      lx >= tileXpt &&
      lx + textW <= tileXpt + tileWpt &&
      ly >= tileYpt &&
      ly + namePt <= tileYpt + tileHpt
    ) {
      page.drawText(name, {
        x: lx,
        y: ly,
        size: namePt,
        font: ctx.font,
        color: rgb(0.2, 0.2, 0.2),
      });
    }
  }
}

function drawScaleLegend(
  ctx: Ctx,
  page: PDFPage,
  pageW: number,
  baselineY: number,
  scale: PdfScale,
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
