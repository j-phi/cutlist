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
  drawClippedDashedBorder,
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
import { decideLabelLayout, wrapLabel } from './labelText';
import { isOutsideBoardMode, planPartMeasurement } from './measurementMode';
import {
  drawOutsideWaterfall,
  planOutsideWaterfall,
  waterfallStripPt,
  type OutsideWaterfallPlan,
} from './outsideDimensions';
import { drawInsidePartDimensions } from './insideDimensions';
import { partColorRgb } from 'cutlist';

/**
 * Find the smallest integer scale ≥ 1 that fits the board on a single page.
 * Orientation (portrait/landscape) follows the board's own aspect ratio.
 *
 * `dimLeftMm` / `dimBottomMm` reserve space on the left and bottom for
 * dimension annotation lines (used when `edge` or `outside` mode is active).
 * They differ for `outside` mode, where the height-waterfall (left) and
 * width-waterfall (bottom) can stack to different depths.
 */
export function computeBoardScale(
  boardWmm: number,
  boardHmm: number,
  margin: number,
  dimLeftMm = 0,
  dimBottomMm = 0,
): number {
  const landscape = boardWmm > boardHmm;
  const pageWmm = landscape ? LETTER_H_MM : LETTER_W_MM;
  const pageHmm = landscape ? LETTER_W_MM : LETTER_H_MM;
  const printableWmm = pageWmm - 2 * margin - LEGEND_BAND_MM - dimLeftMm;
  const printableHmm =
    pageHmm -
    2 * margin -
    HEADER_BAND_MM -
    BOARD_TITLE_BAND_MM -
    FOOTER_BAND_MM -
    dimBottomMm;
  const minScale = Math.max(boardWmm / printableWmm, boardHmm / printableHmm);
  return Math.max(1, Math.ceil(minScale));
}

/** Indigo-500 (Tailwind) for material-allowance hatching. */
const ALLOWANCE_COLOR = rgb(0.388, 0.4, 0.945);

/**
 * Space (mm) reserved on the left and bottom of the board for dimension
 * annotation lines when `edge` or `outside` measurement mode is active.
 * Guarantees leader lines and outside-board dimension text land within the
 * printable area rather than running into the page margin.
 */
export const DIM_ANNOTATION_MM = 15;

interface TileGeom {
  pageWmm: number;
  pageHmm: number;
  paperWmm: number; // full board width on paper at scale
  paperHmm: number; // full board height on paper at scale
  printableWmm: number;
  printableHmm: number;
  dimLeftMm: number; // space reserved on the left for dimension annotations
  dimBottomMm: number; // space reserved on the bottom for dimension annotations
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

  // Reserve annotation space when edge/outside dimension lines are active so
  // leaders and outside-board text land inside the printable area. `edge` uses
  // a fixed strip (leaders); `outside` sizes each strip to its waterfall depth.
  const mode = ctx.opts.measurementMode ?? 'edge';
  const showDims = !!ctx.opts.showDimensions;
  const outsidePlan: OutsideWaterfallPlan | undefined =
    showDims && mode === 'outside'
      ? planOutsideWaterfall(layout.placements)
      : undefined;

  let dimLeftMm = 0;
  let dimBottomMm = 0;
  if (showDims && mode === 'edge') {
    dimLeftMm = DIM_ANNOTATION_MM;
    dimBottomMm = DIM_ANNOTATION_MM;
  } else if (showDims && mode === 'outside' && outsidePlan) {
    dimLeftMm = waterfallStripPt(outsidePlan.heightLevelCount) / MM;
    dimBottomMm = waterfallStripPt(outsidePlan.widthLevelCount) / MM;
  }

  const effectiveScale =
    ctx.opts.scale === 'auto'
      ? computeBoardScale(
          boardWmm,
          boardLmm,
          ctx.opts.margin,
          dimLeftMm,
          dimBottomMm,
        )
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

  // Board area = printable minus annotation space on left and bottom.
  const boardAreaWmm = printableWmm - dimLeftMm;
  const boardAreaHmm = printableHmm - dimBottomMm;
  const stepWmm = Math.max(1, boardAreaWmm - overlap);
  const stepHmm = Math.max(1, boardAreaHmm - overlap);
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
        {
          pageWmm,
          pageHmm,
          paperWmm,
          paperHmm,
          printableWmm,
          printableHmm,
          dimLeftMm,
          dimBottomMm,
        },
        measurements,
        effectiveScale,
        outsidePlan,
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
  outsidePlan: OutsideWaterfallPlan | undefined,
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

  // Board area is printable minus annotation space. Step uses board area so
  // the annotation space (left/bottom strip) is consistently available.
  const boardAreaWmm = geom.printableWmm - geom.dimLeftMm;
  const boardAreaHmm = geom.printableHmm - geom.dimBottomMm;
  const dimLeftPt = geom.dimLeftMm * MM;
  const stepWpt = Math.max(1, boardAreaWmm - overlap) * MM;
  const stepHpt = Math.max(1, boardAreaHmm - overlap) * MM;

  // Board outline in board-paper coordinates
  const boardWpt = geom.paperWmm * MM;
  const boardHpt = geom.paperHmm * MM;

  // Anchor the board inset from the tile edge by dimLeftPt on the left so
  // dimension annotations (leaders, outside-board lines) land in the reserved
  // strip rather than running into the page margin. The bottom annotation strip
  // is guaranteed by computeBoardScale: boardHpt ≤ boardAreaHmm * MM, so
  // boardY = tileTopYpt - boardHpt ≥ tileYpt + dimBottomMm * MM.
  const boardX = tileXpt + dimLeftPt - col * stepWpt;
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
        // Claim the number so the name label / dimensions avoid it.
        ctx.occupancy.add({ x: lx, y: ly, w: textW, h: usePt });
      }
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
    } else if (partPlan.kind === 'inside-dims') {
      // F20 Part B — `inside` mode: W + H dimension lines drawn inside the
      // piece. Drawn before the name label so the label avoids their text
      // (occupancy). Uses the on-board footprint extents (matches the box).
      const emit = makePartDimensionEmit(
        ctx,
        page,
        tileXpt,
        tileYpt,
        tileWpt,
        tileHpt,
      );
      drawInsidePartDimensions(emit, {
        px,
        py,
        pw,
        ph,
        widthUm: (placement.rightUm - placement.leftUm) as Micrometres,
        heightUm: (placement.topUm - placement.bottomUm) as Micrometres,
        formatSize,
        widthOf: (text, size) => ctx.font.widthOfTextAtSize(text, size),
        occupancy: ctx.occupancy,
      });
    }

    // Part name label and interior measurement.
    const nameToDraw = showBomName ? (placement.name ?? null) : null;

    if (mode === 'text' && partPlan.kind === 'interior') {
      // 'text' mode: BOM name + WxH measurement as one vertically- and
      // horizontally-centred block. Name lines on top, measurement below.
      const sizeText = formatPartSizeText(
        formatSize,
        (placement.rightUm - placement.leftUm) as Micrometres,
        (placement.topUm - placement.bottomUm) as Micrometres,
      );
      if (sizeText) {
        drawTextModeCenteredBlock(ctx, page, nameToDraw, sizeText, {
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
    } else if (nameToDraw) {
      // F20 horizontal-first name label. In `inside` mode the W/H dimensions own
      // the bottom + left bands, so the name anchors to the top to stay clear.
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
        placement:
          partPlan.kind === 'inside-dims'
            ? 'top'
            : (ctx.opts.labelPlacement ?? 'center'),
        dimensionsEnabled:
          partPlan.kind === 'edge' || partPlan.kind === 'inside-dims',
      });
    }

    // Claim the part rectangle so LATER parts' labels / dimension text and the
    // leftover-region labels never sit on top of this piece (FR-DIM-5). Added
    // AFTER this part's own name + measurements so they aren't blocked by the
    // piece they legitimately live inside; the visible (clipped) portion is
    // what matters.
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
  }

  // F20 Part B — `outside` measurement mode: waterfall dimensioning. Every
  // distinct piece WIDTH is dimensioned below the board and every distinct
  // HEIGHT to its left, stacked smallest-innermost so dimension lines never
  // cross (BP 9). Extension lines run PAST the board edge into the reserved
  // strip; value text sits outside the stock, never overlapping a piece.
  if (
    outsidePlan &&
    isOutsideBoardMode(
      ctx.opts.measurementMode ?? 'edge',
      !!ctx.opts.showDimensions,
    )
  ) {
    const emit = makePartDimensionEmit(
      ctx,
      page,
      tileXpt,
      tileYpt,
      tileWpt,
      tileHpt,
    );
    drawOutsideWaterfall(emit, {
      boardX,
      boardY,
      boardWpt,
      boardHpt,
      toPageX: (um) => boardX + (umToMm(um as Micrometres) / scale) * MM,
      toPageY: (um) => boardY + (umToMm(um as Micrometres) / scale) * MM,
      plan: outsidePlan,
      formatSize,
      widthOf: (text, size) => ctx.font.widthOfTextAtSize(text, size),
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
      showOffcutDimensions: ctx.opts.showOffcutDimensions ?? true,
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
 * 'text' measurement mode — BOM name (if provided) + WxH size string drawn as
 * a vertically-and-horizontally-centred block inside the piece. Name lines
 * appear on top; the measurement string is on the bottom line. Bypasses
 * occupancy checking because both elements live within the piece's own
 * already-claimed rect; tile-bounds guards prevent spill into adjacent tiles.
 */
function drawTextModeCenteredBlock(
  ctx: Ctx,
  page: PDFPage,
  name: string | null,
  sizeText: string,
  geom: InteriorGeom,
) {
  const { px, py, pw, ph, tileXpt, tileYpt, tileWpt, tileHpt } = geom;
  const visX1 = Math.max(px, tileXpt);
  const visY1 = Math.max(py, tileYpt);
  const visX2 = Math.min(px + pw, tileXpt + tileWpt);
  const visY2 = Math.min(py + ph, tileYpt + tileHpt);
  if (visX2 <= visX1 || visY2 <= visY1) return;

  const visW = visX2 - visX1;
  const visH = visY2 - visY1;
  const cx = (visX1 + visX2) / 2;

  const MIN_PT = 4;
  const MAX_PT = 14;
  const pt = Math.min(MAX_PT, Math.max(MIN_PT, visW / 8));
  const lineHeight = pt * 1.2;
  const budgetW = visW * 0.88;

  const measureFn = (t: string, size: number) =>
    ctx.font.widthOfTextAtSize(t, size);

  if (measureFn(sizeText, pt) > budgetW) return;

  const nameLines: string[] = name
    ? wrapLabel(name, budgetW, pt, measureFn, 3)
    : [];

  // Name lines first, measurement last.
  const allLines = [...nameLines, sizeText];

  // Drop name lines (from the bottom of the name block) until the block fits.
  const maxH = visH * 0.88;
  while (allLines.length > 1 && allLines.length * lineHeight > maxH) {
    allLines.splice(allLines.length - 2, 1);
  }

  const totalH = allLines.length * lineHeight;
  // blockTopY = baseline of the first (topmost) line in PDF Y-up coordinates.
  const blockTopY = (visY1 + visY2) / 2 + totalH / 2 - pt;

  const color = rgb(0.2, 0.2, 0.2);
  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];
    const w = measureFn(line, pt);
    const lx = cx - w / 2;
    const ly = blockTopY - i * lineHeight;
    if (lx < tileXpt || lx + w > tileXpt + tileWpt) continue;
    if (ly < tileYpt || ly + pt > tileYpt + tileHpt) continue;
    page.drawText(line, {
      x: lx,
      y: ly,
      size: pt,
      font: ctx.font,
      color,
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
        if (p.dotted) {
          drawClippedDashedBorder(
            page,
            p.x,
            p.y,
            p.w,
            p.h,
            cx,
            cy,
            cw,
            ch,
            rgb(0.25, 0.45, 0.25),
          );
        } else {
          drawClippedRect(page, p.x, p.y, p.w, p.h, cx, cy, cw, ch, {
            borderColor: style.color,
            borderWidth: 0.4,
          });
        }
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
