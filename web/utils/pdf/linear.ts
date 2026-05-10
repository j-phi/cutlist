import { rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import { aggregateLinearShoppingList, type LinearBoardLayout } from 'cutlist';
import {
  A4_H_MM,
  A4_W_MM,
  FOOTER_BAND_MM,
  HEADER_BAND_MM,
  MM,
} from './constants';
import { addPage, type Ctx } from './context';
import { truncate } from './text';

const TITLE_AREA_MM = 10;
const GROUP_HEADER_HEIGHT_MM = 14;
const STICK_BAR_HEIGHT_MM = 12;
const STICK_FOOTER_HEIGHT_MM = 6;
const STICK_BLOCK_HEIGHT_MM = STICK_BAR_HEIGHT_MM + STICK_FOOTER_HEIGHT_MM + 4;

interface RGB {
  r: number;
  g: number;
  b: number;
}

const FALLBACK_BASE: RGB = { r: 0.86, g: 0.75, b: 0.57 };

function parseHexColor(hex: string | undefined): RGB {
  if (!hex) return FALLBACK_BASE;
  const cleaned = hex.replace('#', '').trim();
  const expanded =
    cleaned.length === 3
      ? cleaned
          .split('')
          .map((c) => c + c)
          .join('')
      : cleaned;
  if (expanded.length !== 6) return FALLBACK_BASE;
  const n = Number.parseInt(expanded, 16);
  if (!Number.isFinite(n)) return FALLBACK_BASE;
  return {
    r: ((n >> 16) & 0xff) / 255,
    g: ((n >> 8) & 0xff) / 255,
    b: (n & 0xff) / 255,
  };
}

function mixWithBlack(c: RGB, t: number): RGB {
  const k = 1 - t;
  return { r: c.r * k, g: c.g * k, b: c.b * k };
}

function isLightColor(c: RGB): boolean {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b > 0.6;
}

interface PdfMaterialColors {
  board: RGB;
  chip: RGB;
  text: RGB;
}

function pdfMaterialColors(hex: string | undefined): PdfMaterialColors {
  const base = parseHexColor(hex);
  return {
    board: mixWithBlack(base, 0.35),
    chip: base,
    text: mixWithBlack(base, 0.55),
  };
}

/**
 * Append per-material shopping list + horizontal stick view pages for any
 * linear (1D) layouts. Sheet pages remain unchanged; this is invoked after
 * the sheet section by `exportCutlistPdf`.
 */
export function drawLinearPages(ctx: Ctx, layouts: LinearBoardLayout[]): void {
  if (layouts.length === 0) return;
  const groups = aggregateLinearShoppingList(layouts);
  if (groups.length === 0) return;

  const { formatSize } = ctx.opts;
  const margin = ctx.opts.margin;
  const pageWmm = A4_W_MM;
  const pageHmm = A4_H_MM;
  const contentWmm = pageWmm - 2 * margin;

  // Single horizontal scale across the whole linear section so sticks of
  // different lengths render at proportional widths. Pin the longest stick
  // to the content width so even worst-case fits.
  const maxLengthM = layouts.reduce(
    (acc, l) => Math.max(acc, l.stock.lengthM),
    0,
  );
  const ptPerMm = maxLengthM > 0 ? (contentWmm * MM) / (maxLengthM * 1000) : MM;

  // Top-of-content cursor in PDF points (measured from page top).
  let page = addPage(ctx, { wMm: pageWmm, hMm: pageHmm }, 'Timber');
  let cursorY = topY(page, margin) - TITLE_AREA_MM * MM;
  drawSectionTitle(ctx, page, margin, topY(page, margin));

  for (let gi = 0; gi < groups.length; gi++) {
    const group = groups[gi];
    const summary = formatShoppingSummary(group, formatSize);

    // Group header — start a new page if the header alone wouldn't fit.
    if (cursorY - GROUP_HEADER_HEIGHT_MM * MM < bottomY(page, margin)) {
      page = addPage(ctx, { wMm: pageWmm, hMm: pageHmm }, 'Timber');
      cursorY = topY(page, margin) - TITLE_AREA_MM * MM;
      drawSectionTitle(ctx, page, margin, topY(page, margin));
    }

    drawGroupHeader(ctx, page, margin, cursorY, group.material, summary);
    cursorY -= GROUP_HEADER_HEIGHT_MM * MM;

    for (let li = 0; li < group.layouts.length; li++) {
      const layout = group.layouts[li];
      if (cursorY - STICK_BLOCK_HEIGHT_MM * MM < bottomY(page, margin)) {
        page = addPage(ctx, { wMm: pageWmm, hMm: pageHmm }, 'Timber');
        cursorY = topY(page, margin) - TITLE_AREA_MM * MM;
        drawSectionTitle(ctx, page, margin, topY(page, margin));
        // Repeat the group header at the top of the new page so context
        // doesn't get lost mid-list.
        drawGroupHeader(ctx, page, margin, cursorY, group.material, summary);
        cursorY -= GROUP_HEADER_HEIGHT_MM * MM;
      }
      drawStick(ctx, page, layout, li, margin, cursorY, ptPerMm);
      cursorY -= STICK_BLOCK_HEIGHT_MM * MM;
    }

    // Inter-group spacing.
    if (gi < groups.length - 1) {
      cursorY -= 4 * MM;
    }
  }
}

function topY(page: PDFPage, marginMm: number): number {
  const { height } = page.getSize();
  return height - (marginMm + HEADER_BAND_MM) * MM;
}

function bottomY(page: PDFPage, marginMm: number): number {
  return (marginMm + FOOTER_BAND_MM) * MM;
}

function drawSectionTitle(
  ctx: Ctx,
  page: PDFPage,
  marginMm: number,
  y: number,
): void {
  page.drawText('Timber Shopping List', {
    x: marginMm * MM,
    y: y - 6,
    size: 14,
    font: ctx.fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
}

function formatShoppingSummary(
  group: ReturnType<typeof aggregateLinearShoppingList>[number],
  formatSize: (m: number) => string | undefined,
): string {
  const parts = group.lengths.map(
    (l) => `${l.count}× ${formatSize(l.lengthM) ?? ''}`,
  );
  const stickWord = group.totalSticks === 1 ? 'stick' : 'sticks';
  return `${parts.join(', ')}  (${group.totalSticks} ${stickWord} total)`;
}

function drawGroupHeader(
  ctx: Ctx,
  page: PDFPage,
  marginMm: number,
  topYpt: number,
  material: string,
  summary: string,
): void {
  page.drawText(material, {
    x: marginMm * MM,
    y: topYpt - 9,
    size: 11,
    font: ctx.fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
  page.drawText(summary, {
    x: marginMm * MM,
    y: topYpt - 22,
    size: 9,
    font: ctx.font,
    color: rgb(0.3, 0.3, 0.3),
  });
}

function drawStick(
  ctx: Ctx,
  page: PDFPage,
  layout: LinearBoardLayout,
  boardIndexInGroup: number,
  marginMm: number,
  topYpt: number,
  ptPerMm: number,
): void {
  const { formatSize } = ctx.opts;
  const colors = pdfMaterialColors(layout.stock.color);
  const totalM = layout.stock.lengthM;
  const barLeftPt = marginMm * MM;
  const barWidthPt = totalM * 1000 * ptPerMm;
  const barHeightPt = STICK_BAR_HEIGHT_MM * MM;
  const barBottomPt = topYpt - barHeightPt;

  // Board background
  page.drawRectangle({
    x: barLeftPt,
    y: barBottomPt,
    width: barWidthPt,
    height: barHeightPt,
    color: rgb(colors.board.r, colors.board.g, colors.board.b),
    borderColor: rgb(0.15, 0.15, 0.15),
    borderWidth: 0.5,
  });

  // Cut chips
  const chipFontSize = 7;
  const labelColor = isLightColor(colors.chip)
    ? rgb(colors.text.r, colors.text.g, colors.text.b)
    : rgb(0.95, 0.95, 0.95);
  for (const placement of layout.placements) {
    const chipX = barLeftPt + placement.offsetM * 1000 * ptPerMm;
    const chipW = placement.lengthM * 1000 * ptPerMm;
    if (chipW <= 0) continue;
    page.drawRectangle({
      x: chipX,
      y: barBottomPt,
      width: chipW,
      height: barHeightPt,
      color: rgb(colors.chip.r, colors.chip.g, colors.chip.b),
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.3,
    });
    const fullLabel = `${placement.partNumber} · ${formatSize(placement.lengthM) ?? ''}`;
    const numberOnly = String(placement.partNumber);
    const fullW = ctx.font.widthOfTextAtSize(fullLabel, chipFontSize);
    const numberW = ctx.font.widthOfTextAtSize(numberOnly, chipFontSize);
    const padding = 2;
    let label: string | null = null;
    if (fullW + padding * 2 <= chipW) {
      label = fullLabel;
    } else if (numberW + padding * 2 <= chipW) {
      label = numberOnly;
    }
    if (label) {
      const labelW = ctx.font.widthOfTextAtSize(label, chipFontSize);
      const lx = chipX + (chipW - labelW) / 2;
      const ly = barBottomPt + (barHeightPt - chipFontSize) / 2 + 1;
      page.drawText(label, {
        x: lx,
        y: ly,
        size: chipFontSize,
        font: ctx.fontBold,
        color: labelColor,
      });
    }
  }

  // Hatched waste tail
  if (layout.wasteEndM > 0) {
    const wasteX = barLeftPt + (totalM - layout.wasteEndM) * 1000 * ptPerMm;
    const wasteW = layout.wasteEndM * 1000 * ptPerMm;
    page.drawRectangle({
      x: wasteX,
      y: barBottomPt,
      width: wasteW,
      height: barHeightPt,
      color: rgb(0.78, 0.78, 0.78),
    });
    drawHatch(page, wasteX, barBottomPt, wasteW, barHeightPt);
    page.drawLine({
      start: { x: wasteX, y: barBottomPt },
      end: { x: wasteX, y: barBottomPt + barHeightPt },
      thickness: 0.5,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  // Footer text — mirrors LinearLayoutListItem's on-screen footer.
  const cutCount = layout.placements.length;
  const cutsWord = cutCount === 1 ? 'cut' : 'cuts';
  const lengthLabel = formatSize(totalM) ?? '';
  const wasteLabel =
    layout.wasteEndM > 0 ? `${formatSize(layout.wasteEndM) ?? ''} waste` : '';
  const footerParts = [
    `#${boardIndexInGroup + 1}`,
    lengthLabel,
    `${cutCount} ${cutsWord}`,
  ];
  if (wasteLabel) footerParts.push(wasteLabel);
  const footerText = footerParts.join('  ·  ');
  const footerY = barBottomPt - STICK_FOOTER_HEIGHT_MM * MM + 2;
  const footerMaxWidth = barWidthPt;
  const truncated = truncate(ctx.font, footerText, 8, footerMaxWidth);
  page.drawText(truncated, {
    x: barLeftPt,
    y: footerY,
    size: 8,
    font: ctx.font,
    color: rgb(0.35, 0.35, 0.35),
  });
}

function drawHatch(
  page: PDFPage,
  x: number,
  y: number,
  w: number,
  h: number,
): void {
  const step = 4;
  const color = rgb(0.45, 0.45, 0.45);
  for (let d = -h; d < w; d += step) {
    const x1 = x + Math.max(0, d);
    const y1 = y + Math.max(0, -d);
    const x2 = x + Math.min(w, d + h);
    const y2 = y + Math.min(h, h - (d + h - w));
    if (x2 <= x1 || y2 <= y1) continue;
    page.drawLine({
      start: { x: x1, y: y1 },
      end: { x: x2, y: y2 },
      thickness: 0.3,
      color,
    });
  }
}
