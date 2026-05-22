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
import { drawClippedHatch, drawClippedRect, drawTileBorder } from './geometry';
import { drawMeasurement } from './measurements';

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

    // Part labels: name and/or dimensions, non-overlapping.
    const nameToDraw = showBomName ? (placement.name ?? null) : null;
    const dimLabel = ctx.opts.showDimensions
      ? `${formatSize((placement.rightUm - placement.leftUm) as Micrometres) ?? `${Math.round(placedWidthMm)}mm`} × ${formatSize((placement.topUm - placement.bottomUm) as Micrometres) ?? `${Math.round(placedLengthMm)}mm`}`
      : null;
    if (nameToDraw || dimLabel) {
      drawPartLabels(
        ctx,
        page,
        nameToDraw,
        dimLabel,
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
 * Draw the part name and/or dimension label (W × H) inside the placed rectangle.
 *
 * Landscape pieces: name above, dims below, stacked vertically and centered.
 * Portrait pieces (90° CCW): name and dims side-by-side in the reading direction
 *   (name first, dims to the right), the pair centered on the narrow axis —
 *   exactly the landscape block layout rotated 90° CCW.
 *
 * Text is centered on the *visible* portion of the piece within the tile so that
 * pieces near tile edges always receive a label. Font sizes scale down to a
 * minimum before a label is dropped.
 */
function drawPartLabels(
  ctx: Ctx,
  page: ReturnType<Ctx['doc']['addPage']>,
  name: string | null,
  dimLabel: string | null,
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
  const GAP = 2; // pt between name and dim label
  const MIN_NAME_PT = 4;
  const MIN_DIM_PT = 3;

  // Compute font size + rendered width, scaling down proportionally before
  // dropping a label so small pieces still receive readable (if tiny) text.
  const fitLabel = (
    text: string,
    maxPt: number,
    minPt: number,
    capMm: number,
  ): { pt: number; w: number } | null => {
    let pt = Math.min(maxPt, Math.max(minPt, (capMm / scale) * MM));
    let w = ctx.font.widthOfTextAtSize(text, pt);
    if (w > visLongPt * 0.85) {
      pt = Math.max(minPt, (pt * visLongPt * 0.85) / w);
      w = ctx.font.widthOfTextAtSize(text, pt);
      if (w > visLongPt) return null; // even min size won't fit
    }
    return { pt, w };
  };

  const nameFit = name
    ? fitLabel(name, 14, MIN_NAME_PT, Math.min(shortMm / 3, ONE_INCH_MM))
    : null;
  const dimFit = dimLabel
    ? fitLabel(dimLabel, 10, MIN_DIM_PT, Math.min(shortMm / 4, ONE_INCH_MM))
    : null;

  if (!nameFit && !dimFit) return;

  const visCx = (visX1 + visX2) / 2;
  const visCy = (visY1 + visY2) / 2;

  if (isPortrait) {
    // Portrait: both labels rotated 90° CCW, each running along the long (y) axis.
    // Two-column layout — name in the left column (lower x), dims in the right
    // column (higher x) — mirroring how landscape stacks name above dims but
    // rotated 90° CCW. Each label is independently y-centered at visCy; the
    // combined [name | gap | dims] block is x-centered at visCx.
    //
    // For 90° CCW text the baseline is the RIGHT edge of the glyph body, so:
    //   nameOriginX = visCx + (namePt − GAP − dimPt) / 2
    //   dimOriginX  = visCx + (namePt + GAP + dimPt) / 2
    if (nameFit && dimFit) {
      const blockXWidth = nameFit.pt + GAP + dimFit.pt;
      const visNarrowPt = visX2 - visX1;
      if (blockXWidth <= visNarrowPt * 0.9) {
        page.drawText(name!, {
          x: visCx + (nameFit.pt - GAP - dimFit.pt) / 2,
          y: visCy - nameFit.w / 2,
          size: nameFit.pt,
          font: ctx.font,
          color: rgb(0.2, 0.2, 0.2),
          rotate: degrees(90),
        });
        page.drawText(dimLabel!, {
          x: visCx + (nameFit.pt + GAP + dimFit.pt) / 2,
          y: visCy - dimFit.w / 2,
          size: dimFit.pt,
          font: ctx.font,
          color: rgb(0.35, 0.35, 0.35),
          rotate: degrees(90),
        });
        return;
      }
      // Not enough narrow width for two columns — fall through to name only.
    }
    if (nameFit) {
      page.drawText(name!, {
        x: visCx + nameFit.pt / 2,
        y: visCy - nameFit.w / 2,
        size: nameFit.pt,
        font: ctx.font,
        color: rgb(0.2, 0.2, 0.2),
        rotate: degrees(90),
      });
    } else if (dimFit) {
      page.drawText(dimLabel!, {
        x: visCx + dimFit.pt / 2,
        y: visCy - dimFit.w / 2,
        size: dimFit.pt,
        font: ctx.font,
        color: rgb(0.35, 0.35, 0.35),
        rotate: degrees(90),
      });
    }
  } else {
    // Landscape: name above (higher y), dims below, centered at visCx/visCy.
    const drawText = (
      text: string,
      pt: number,
      w: number,
      lx: number,
      ly: number,
      color: ReturnType<typeof rgb>,
    ) => {
      if (
        lx >= tileXpt &&
        lx + w <= tileXpt + tileWpt &&
        ly >= tileYpt &&
        ly + pt <= tileYpt + tileHpt
      ) {
        page.drawText(text, { x: lx, y: ly, size: pt, font: ctx.font, color });
      }
    };

    if (nameFit && dimFit) {
      const blockH = nameFit.pt + GAP + dimFit.pt;
      drawText(
        name!,
        nameFit.pt,
        nameFit.w,
        visCx - nameFit.w / 2,
        visCy - blockH / 2 + dimFit.pt + GAP,
        rgb(0.2, 0.2, 0.2),
      );
      drawText(
        dimLabel!,
        dimFit.pt,
        dimFit.w,
        visCx - dimFit.w / 2,
        visCy - blockH / 2,
        rgb(0.35, 0.35, 0.35),
      );
    } else if (nameFit) {
      drawText(
        name!,
        nameFit.pt,
        nameFit.w,
        visCx - nameFit.w / 2,
        visCy - nameFit.pt / 2,
        rgb(0.2, 0.2, 0.2),
      );
    } else if (dimFit) {
      drawText(
        dimLabel!,
        dimFit.pt,
        dimFit.w,
        visCx - dimFit.w / 2,
        visCy - dimFit.pt / 2,
        rgb(0.35, 0.35, 0.35),
      );
    }
  }
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
