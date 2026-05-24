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
import { decideLabelLayout } from './labelText';
import { isOutsideBoardMode, planPartMeasurement } from './measurementMode';
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

    // Measurements (F14 + F20 Part B). `measurementMode` selects HOW the
    // piece's W×H render; `edge` is F14's engineering dimension lines. The
    // other modes are handled below so they can share the piece interior with
    // the name label via the occupancy set.
    const mode = ctx.opts.measurementMode ?? 'edge';
    const partPlan = planPartMeasurement(mode, !!ctx.opts.showDimensions);
    if (partPlan.kind === 'edge') {
      const emit = makePartDimensionEmit(
        ctx,
        page,
        tileXpt,
        tileYpt,
        tileWpt,
        tileHpt,
      );
      const dimGeom: DimensionGeom = {
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
        dimGeom,
      );
    }

    // Part name label (dimensions handled above by drawPartDimensions).
    // Uses the shared F20 horizontal-first / wrap / rotate-last decision so the
    // PDF agrees with the on-screen layout.
    const nameToDraw = showBomName ? (placement.name ?? null) : null;
    if (nameToDraw) {
      drawPartLabels(ctx, page, nameToDraw, {
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
        placement: ctx.opts.labelPlacement ?? 'center',
        dimensionsEnabled: partPlan.kind === 'edge',
      });
    }

    // F20 Part B — `text` / `inside` measurement value sits in the piece
    // interior, after the name label has claimed its space, so the two never
    // overwrite each other (occupancy clamp). `outside` is handled per-board
    // below the placement loop.
    if (partPlan.kind === 'interior') {
      const sizeText = formatPartSizeText(
        formatSize,
        (placement.rightUm - placement.leftUm) as Micrometres,
        (placement.topUm - placement.bottomUm) as Micrometres,
      );
      if (sizeText) {
        drawInteriorMeasurement(ctx, page, sizeText, {
          px,
          py,
          pw,
          ph,
          tileXpt,
          tileYpt,
          tileWpt,
          tileHpt,
        });
      }
    }
  }

  // F20 Part B — `outside` measurement mode: per-board overall dimensions with
  // extension lines that run PAST the board boundary and value text in the
  // margin outside the stock, so they never overlap any piece. Per-board
  // (rather than per-part) keeps the margin legible — per-part outside dims
  // get dense fast on a full sheet. Drawn once per tile.
  if (
    isOutsideBoardMode(
      ctx.opts.measurementMode ?? 'edge',
      !!ctx.opts.showDimensions,
    )
  ) {
    drawOutsideBoardDimensions(ctx, page, {
      boardX,
      boardY,
      boardWpt,
      boardHpt,
      widthUm: stock.widthUm,
      lengthUm: stock.lengthUm,
      formatSize,
    });
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

interface PartLabelGeom {
  px: number;
  py: number;
  pw: number;
  ph: number;
  placedWidthMm: number;
  placedLengthMm: number;
  scale: number;
  tileXpt: number;
  tileYpt: number;
  tileWpt: number;
  tileHpt: number;
  placement: 'top' | 'center';
  dimensionsEnabled: boolean;
}

const NAME_COLOR = rgb(0.2, 0.2, 0.2);

/**
 * Draw the part name inside the placed rectangle using the shared F20
 * horizontal-first decision ({@link decideLabelLayout}).
 *
 * Horizontal-first: the name runs horizontally and wraps onto ≤ 3 lines; it
 * rotates 90° only when even a wrapped horizontal block can't fit (FR-LBLT-1/3).
 * The decision is shared with {@link PartListItem} on screen — only the
 * coordinate mapping below is PDF-specific (FR-LBLT-7).
 *
 * Text is laid out on the *visible* portion of the piece within the tile so
 * pieces near tile edges still receive a label, and clamped to that rect
 * (FR-LBLT-6) so trailing lines drop rather than overflow a neighbour.
 */
function drawPartLabels(
  ctx: Ctx,
  page: PDFPage,
  name: string,
  geom: PartLabelGeom,
) {
  const {
    px,
    py,
    pw,
    ph,
    placedWidthMm,
    scale,
    tileXpt,
    tileYpt,
    tileWpt,
    tileHpt,
  } = geom;

  // Clamp to visible portion — pieces near tile edges use their visible centre.
  const visX1 = Math.max(px, tileXpt);
  const visY1 = Math.max(py, tileYpt);
  const visX2 = Math.min(px + pw, tileXpt + tileWpt);
  const visY2 = Math.min(py + ph, tileYpt + tileHpt);
  if (visX2 <= visX1 || visY2 <= visY1) return;
  const visW = visX2 - visX1;
  const visH = visY2 - visY1;

  const ONE_INCH_MM = 25.4;
  const MIN_NAME_PT = 4;
  const capMm = Math.min(placedWidthMm / 3, ONE_INCH_MM);
  const pt = Math.min(14, Math.max(MIN_NAME_PT, (capMm / scale) * MM));
  const lineHeight = pt * 1.1;

  const layout = decideLabelLayout({
    text: name,
    width: visW,
    height: visH,
    fontPt: pt,
    lineHeight,
    placement: geom.placement,
    dimensionsEnabled: geom.dimensionsEnabled,
    measure: (t, size) => ctx.font.widthOfTextAtSize(t, size),
  });
  if (layout.lines.length === 0) return;

  const visCx = (visX1 + visX2) / 2;
  // Block top: 'top' anchors to the visible top band; 'center' centres on Y.
  const blockH = layout.lines.length * lineHeight;
  const blockTopY =
    layout.placement === 'top'
      ? visY2 - pt
      : (visY1 + visY2) / 2 + blockH / 2 - pt;

  for (let i = 0; i < layout.lines.length; i++) {
    const line = layout.lines[i];
    const w = ctx.font.widthOfTextAtSize(line, pt);
    if (layout.rotate === 90) {
      // 90° CCW: lines stack along X (right→left), glyphs run up +Y, centred.
      const lineX = visCx + blockH / 2 - i * lineHeight - pt;
      const lineY = (visY1 + visY2) / 2 - w / 2;
      const bbox = { x: lineX, y: lineY, w: pt, h: w };
      if (ctx.occupancy.intersects(bbox)) continue;
      ctx.occupancy.add(bbox);
      page.drawText(line, {
        x: lineX + pt,
        y: lineY,
        size: pt,
        font: ctx.font,
        color: NAME_COLOR,
        rotate: degrees(90),
      });
    } else {
      const lx = visCx - w / 2;
      const ly = blockTopY - i * lineHeight;
      const bbox = { x: lx, y: ly, w, h: pt };
      if (
        lx < tileXpt ||
        lx + w > tileXpt + tileWpt ||
        ly < tileYpt ||
        ly + pt > tileYpt + tileHpt
      ) {
        continue;
      }
      if (ctx.occupancy.intersects(bbox)) continue;
      ctx.occupancy.add(bbox);
      page.drawText(line, {
        x: lx,
        y: ly,
        size: pt,
        font: ctx.font,
        color: NAME_COLOR,
      });
    }
  }
}

/** Build the "L × W" plain-text size string for `text`/`inside` modes. */
function formatPartSizeText(
  formatSize: (um: Micrometres) => string | undefined,
  widthUm: Micrometres,
  heightUm: Micrometres,
): string | null {
  const w = formatSize(widthUm);
  const h = formatSize(heightUm);
  if (!w || !h) return null;
  return `${h} × ${w}`;
}

interface InteriorGeom {
  px: number;
  py: number;
  pw: number;
  ph: number;
  tileXpt: number;
  tileYpt: number;
  tileWpt: number;
  tileHpt: number;
}

/**
 * F20 Part B — `text` / `inside` measurement value drawn inside the piece. The
 * value text is occupancy-checked against the part rect's already-claimed name
 * label and other text; if no clear slot is found within the piece it is
 * SUPPRESSED rather than overwriting (FR-LBLT-6 + "do not write over existing
 * text"). Placed below the centre when free, else nudged up.
 */
function drawInteriorMeasurement(
  ctx: Ctx,
  page: PDFPage,
  text: string,
  geom: InteriorGeom,
) {
  const { px, py, pw, ph, tileXpt, tileYpt, tileWpt, tileHpt } = geom;
  const visX1 = Math.max(px, tileXpt);
  const visY1 = Math.max(py, tileYpt);
  const visX2 = Math.min(px + pw, tileXpt + tileWpt);
  const visY2 = Math.min(py + ph, tileYpt + tileHpt);
  if (visX2 <= visX1 || visY2 <= visY1) return;

  const MIN_PT = 4;
  const pt = Math.min(8, Math.max(MIN_PT, (visX2 - visX1) / 8));
  const w = ctx.font.widthOfTextAtSize(text, pt);
  if (w > visX2 - visX1) return; // won't fit horizontally

  const cx = (visX1 + visX2) / 2;
  const lx = cx - w / 2;
  // Deterministic downward search for a clear horizontal slot inside the rect.
  const candidates = [
    (visY1 + visY2) / 2 - pt / 2, // centre
    visY1 + pt, // bottom band
    visY2 - 2 * pt, // upper band
  ];
  for (const ly of candidates) {
    if (ly < visY1 || ly + pt > visY2) continue;
    const bbox = { x: lx, y: ly, w, h: pt };
    if (ctx.occupancy.intersects(bbox)) continue;
    ctx.occupancy.add(bbox);
    page.drawText(text, {
      x: lx,
      y: ly,
      size: pt,
      font: ctx.font,
      color: rgb(0.25, 0.25, 0.25),
    });
    return;
  }
  // No clear slot — suppress (geometry retained, text not drawn).
}

interface OutsideGeom {
  boardX: number;
  boardY: number;
  boardWpt: number;
  boardHpt: number;
  widthUm: Micrometres;
  lengthUm: Micrometres;
  formatSize: (um: Micrometres) => string | undefined;
}

/**
 * F20 Part B — `outside` measurement mode (per-board). Extension lines run
 * PAST the board boundary and the overall board W/L value text sits in the
 * margin OUTSIDE the stock, so the value never overlaps any piece. Per-board
 * (one width dim below the board, one length dim left of it) keeps the margin
 * legible; per-part outside dims would crowd a full sheet.
 */
function drawOutsideBoardDimensions(
  ctx: Ctx,
  page: PDFPage,
  geom: OutsideGeom,
) {
  const { boardX, boardY, boardWpt, boardHpt, widthUm, lengthUm, formatSize } =
    geom;
  const OUT = 14; // how far outside the board edge the dim line sits (pt)
  const ARROW = 3;
  const PT = 7;
  const color = rgb(0.1, 0.1, 0.1);

  // ── Width dim, below the board. ──
  const xLineY = boardY - OUT;
  // Extension lines from board corners down past the dim line.
  page.drawLine({
    start: { x: boardX, y: boardY },
    end: { x: boardX, y: xLineY - 2 },
    thickness: 0.3,
    color,
  });
  page.drawLine({
    start: { x: boardX + boardWpt, y: boardY },
    end: { x: boardX + boardWpt, y: xLineY - 2 },
    thickness: 0.3,
    color,
  });
  drawArrowH(page, boardX, xLineY, 1, ARROW, -1e9, -1e9, 1e12, 1e12, color);
  drawArrowH(
    page,
    boardX + boardWpt,
    xLineY,
    -1,
    ARROW,
    -1e9,
    -1e9,
    1e12,
    1e12,
    color,
  );
  page.drawLine({
    start: { x: boardX, y: xLineY },
    end: { x: boardX + boardWpt, y: xLineY },
    thickness: 0.5,
    color,
  });
  const wText = formatSize(widthUm);
  if (wText) {
    const ww = ctx.font.widthOfTextAtSize(wText, PT);
    page.drawText(wText, {
      x: boardX + boardWpt / 2 - ww / 2,
      y: xLineY - PT - 2,
      size: PT,
      font: ctx.font,
      color,
    });
  }

  // ── Length dim, left of the board. ──
  const yLineX = boardX - OUT;
  page.drawLine({
    start: { x: boardX, y: boardY },
    end: { x: yLineX - 2, y: boardY },
    thickness: 0.3,
    color,
  });
  page.drawLine({
    start: { x: boardX, y: boardY + boardHpt },
    end: { x: yLineX - 2, y: boardY + boardHpt },
    thickness: 0.3,
    color,
  });
  drawArrowV(page, yLineX, boardY, 1, ARROW, -1e9, -1e9, 1e12, 1e12, color);
  drawArrowV(
    page,
    yLineX,
    boardY + boardHpt,
    -1,
    ARROW,
    -1e9,
    -1e9,
    1e12,
    1e12,
    color,
  );
  page.drawLine({
    start: { x: yLineX, y: boardY },
    end: { x: yLineX, y: boardY + boardHpt },
    thickness: 0.5,
    color,
  });
  const lText = formatSize(lengthUm);
  if (lText) {
    const lw = ctx.font.widthOfTextAtSize(lText, PT);
    page.drawText(lText, {
      x: yLineX - PT - 2,
      y: boardY + boardHpt / 2 - lw / 2,
      size: PT,
      font: ctx.font,
      color,
      rotate: degrees(90),
    });
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
