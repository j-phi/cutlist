import { rgb } from 'pdf-lib';
import type { PDFPage } from 'pdf-lib';
import { umToMm, type Micrometres } from 'cutlist';
import type { RulerMeasurement } from '~/composables/useRulerStore';
import { MM } from './constants';
import type { Ctx } from './context';
import { drawArrowH, drawArrowV, drawClippedLine } from './geometry';

export function drawMeasurement(
  ctx: Ctx,
  page: PDFPage,
  m: RulerMeasurement,
  boardX: number,
  boardY: number,
  scale: number,
  cx: number,
  cy: number,
  cw: number,
  ch: number,
) {
  const { formatSize } = ctx.opts;
  const toP = (um: Micrometres) => (umToMm(um) / scale) * MM;
  const distanceUm = Math.abs(m.anchorBUm - m.anchorAUm) as Micrometres;
  const label = formatSize(distanceUm) ?? `${Math.round(umToMm(distanceUm))}mm`;
  const minUm = Math.min(m.anchorAUm, m.anchorBUm) as Micrometres;
  const maxUm = Math.max(m.anchorAUm, m.anchorBUm) as Micrometres;
  const color = rgb(0.1, 0.1, 0.1);
  const extColor = rgb(0.4, 0.4, 0.4);
  const arrowSize = 3 * MM;

  if (m.axis === 'x') {
    const x1 = boardX + toP(minUm);
    const x2 = boardX + toP(maxUm);
    const y = boardY + toP(m.offsetUm);
    const midX = (x1 + x2) / 2;

    drawClippedLine(
      page,
      x1,
      boardY,
      x1,
      y + 2 * MM,
      cx,
      cy,
      cw,
      ch,
      0.3,
      extColor,
    );
    drawClippedLine(
      page,
      x2,
      boardY,
      x2,
      y + 2 * MM,
      cx,
      cy,
      cw,
      ch,
      0.3,
      extColor,
    );
    drawClippedLine(page, x1, y, x2, y, cx, cy, cw, ch, 0.6, color);
    drawArrowH(page, x1, y, 1, arrowSize, cx, cy, cw, ch, color);
    drawArrowH(page, x2, y, -1, arrowSize, cx, cy, cw, ch, color);

    const fontSize = Math.max(5, Math.min(8, toP(distanceUm) / 6));
    const textW = ctx.font.widthOfTextAtSize(label, fontSize);
    const lx = midX - textW / 2;
    const ly = y + 1.5;
    if (
      lx >= cx &&
      lx + textW <= cx + cw &&
      ly >= cy &&
      ly + fontSize <= cy + ch
    ) {
      page.drawText(label, {
        x: lx,
        y: ly,
        size: fontSize,
        font: ctx.font,
        color,
      });
    }
  } else {
    const y1 = boardY + toP(minUm);
    const y2 = boardY + toP(maxUm);
    const x = boardX + toP(m.offsetUm);
    const midY = (y1 + y2) / 2;

    drawClippedLine(
      page,
      boardX,
      y1,
      x + 2 * MM,
      y1,
      cx,
      cy,
      cw,
      ch,
      0.3,
      extColor,
    );
    drawClippedLine(
      page,
      boardX,
      y2,
      x + 2 * MM,
      y2,
      cx,
      cy,
      cw,
      ch,
      0.3,
      extColor,
    );
    drawClippedLine(page, x, y1, x, y2, cx, cy, cw, ch, 0.6, color);
    drawArrowV(page, x, y1, 1, arrowSize, cx, cy, cw, ch, color);
    drawArrowV(page, x, y2, -1, arrowSize, cx, cy, cw, ch, color);

    const fontSize = Math.max(5, Math.min(8, toP(distanceUm) / 6));
    const lx = x + 2;
    const ly = midY - fontSize / 2;
    if (lx >= cx && ly >= cy && ly + fontSize <= cy + ch) {
      page.drawText(label, {
        x: lx,
        y: ly,
        size: fontSize,
        font: ctx.font,
        color,
      });
    }
  }
}
