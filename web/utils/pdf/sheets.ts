import { rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import {
  aggregateSheetShoppingList,
  type Micrometres,
  type SheetBoardLayout,
  type SheetShoppingListGroup,
  type Stock,
} from 'cutlist';
import {
  FOOTER_BAND_MM,
  HEADER_BAND_MM,
  LETTER_H_MM,
  LETTER_W_MM,
  MM,
} from './constants';
import { addPage, type Ctx } from './context';

const TITLE_AREA_MM = 10;
const GROUP_BLOCK_HEIGHT_MM = 20;

/**
 * Append a sheet shopping-list section: per (material, thickness) group, how
 * many owned offcuts were used and how many general sheets to buy. Mirrors
 * `drawLinearPages`. Pass the expanded engine `stock` to report total offcuts
 * available; omit it to report only what was used.
 */
export function drawSheetShoppingPages(
  ctx: Ctx,
  layouts: SheetBoardLayout[],
  stock?: Stock[],
): void {
  if (layouts.length === 0) return;
  const groups = aggregateSheetShoppingList(layouts, stock);
  if (groups.length === 0) return;

  const margin = ctx.opts.margin;
  const pageWmm = LETTER_W_MM;
  const pageHmm = LETTER_H_MM;

  let page = addPage(ctx, { wMm: pageWmm, hMm: pageHmm }, 'Sheet Goods');
  let cursorY = topY(page, margin) - TITLE_AREA_MM * MM;
  drawSectionTitle(ctx, page, margin, topY(page, margin));

  for (const group of groups) {
    if (cursorY - GROUP_BLOCK_HEIGHT_MM * MM < bottomY(page, margin)) {
      page = addPage(ctx, { wMm: pageWmm, hMm: pageHmm }, 'Sheet Goods');
      cursorY = topY(page, margin) - TITLE_AREA_MM * MM;
      drawSectionTitle(ctx, page, margin, topY(page, margin));
    }
    drawGroup(ctx, page, margin, cursorY, group);
    cursorY -= GROUP_BLOCK_HEIGHT_MM * MM;
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
  page.drawText('Sheet Shopping List', {
    x: marginMm * MM,
    y: y - 6,
    size: 14,
    font: ctx.fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });
}

function buyText(
  group: SheetShoppingListGroup,
  formatSize: (um: Micrometres) => string | undefined,
): string {
  if (group.generalSizes.length === 0) return 'Buy: none';
  const parts = group.generalSizes.map(
    (s) =>
      `${s.count}× ${formatSize(s.widthUm) ?? ''} × ${
        formatSize(s.lengthUm) ?? ''
      }`,
  );
  return `Buy: ${parts.join(', ')}`;
}

function offcutText(group: SheetShoppingListGroup): string | null {
  if (group.offcutsAvailable <= 0) return null;
  return `Offcuts used: ${group.offcutsUsed}/${group.offcutsAvailable}`;
}

function drawGroup(
  ctx: Ctx,
  page: PDFPage,
  marginMm: number,
  topYpt: number,
  group: SheetShoppingListGroup,
): void {
  const { formatSize } = ctx.opts;
  const x = marginMm * MM;
  page.drawText(group.material, {
    x,
    y: topYpt - 9,
    size: 11,
    font: ctx.fontBold,
    color: rgb(0.1, 0.1, 0.1),
  });

  let lineY = topYpt - 22;
  const offcut = offcutText(group);
  if (offcut) {
    page.drawText(offcut, {
      x,
      y: lineY,
      size: 9,
      font: ctx.font,
      color: rgb(0.3, 0.3, 0.3),
    });
    lineY -= 12;
  }
  page.drawText(buyText(group, formatSize), {
    x,
    y: lineY,
    size: 9,
    font: ctx.font,
    color: rgb(0.3, 0.3, 0.3),
  });
}
