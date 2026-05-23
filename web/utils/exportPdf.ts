import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type {
  BoardLayoutLeftover,
  LinearBoardLayout,
  Micrometres,
  SheetBoardLayout,
} from 'cutlist';
import type { RulerMeasurement } from '~/composables/useRulerStore';
import { drawBomPages, type BomRow } from './pdf/bom';
import { drawBoardTiles } from './pdf/board';
import type { Ctx } from './pdf/context';
import { OccupancySet } from './pdf/occupancy';
import { drawLinearPages } from './pdf/linear';
import { drawSheetShoppingPages } from './pdf/sheets';

export type PdfScale = 1 | 5 | 10 | 20 | 50 | 'auto';

export interface ExportPdfOptions {
  documentName: string;
  generatedAt: Date;
  scale: PdfScale;
  margin?: number; // mm
  tileOverlap?: number; // mm
  /**
   * Pre-aggregated BOM rows to print. Supplying these directly (rather than
   * re-deriving from placements) lets callers export the BOM even when no
   * board layouts have been generated yet — e.g. before stock is assigned.
   */
  bomRows: BomRow[];
  layouts: SheetBoardLayout[];
  /** Linear (1D timber) layouts. Rendered as a separate section after sheets. */
  linearLayouts: LinearBoardLayout[];
  leftovers: BoardLayoutLeftover[];
  formatSize: (um: Micrometres) => string | undefined;
  showPartNumbers: boolean;
  showBomName: boolean;
  showDimensions: boolean;
  /**
   * Blade kerf width in µm (project blade width). Used by the board renderer to
   * draw the kerf gap between adjacent parts as a distinct strip (F6 /
   * FR-VIZ-1). 0 / undefined ⇒ no kerf strips drawn.
   */
  bladeWidthUm?: number;
  /**
   * F6 / FR-VIZ-3 (optional, presentational only — NOT a persisted schema
   * field). When true, each part rectangle is filled with its stable per-part
   * hue ({@link partColorRgb}) so it matches the on-screen layout diagram and
   * the 3D viewer key. Defaults to grayscale (`false`).
   */
  colorParts?: boolean;
  measurements?: RulerMeasurement[];
}

export async function exportCutlistPdf(
  options: ExportPdfOptions,
): Promise<Uint8Array> {
  const opts = {
    margin: 10,
    tileOverlap: 5,
    ...options,
  };

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const ctx: Ctx = {
    doc,
    font,
    fontBold,
    opts,
    totalPagesPlaceholder: [],
    pageCount: { value: 0 },
    occupancy: new OccupancySet(),
  };

  // Page 1+: BOM
  drawBomPages(ctx, opts.bomRows);

  // Sheet shopping list — how many sheets to buy, per material+thickness.
  // Project stock isn't plumbed into export options, so this reports offcuts
  // used (not total available); the aggregator falls back gracefully.
  drawSheetShoppingPages(ctx, opts.layouts);

  // Pages: each board, possibly tiled
  const measurements = opts.measurements ?? [];
  opts.layouts.forEach((layout, i) => {
    const boardMeasurements = measurements.filter((m) => m.boardIndex === i);
    drawBoardTiles(ctx, layout, i + 1, opts.layouts.length, boardMeasurements);
  });

  // Pages: linear (timber) shopping list + stick view, after the sheet section.
  drawLinearPages(ctx, opts.linearLayouts);

  // Fill in "Page N of M" placeholders
  const totalPages = ctx.pageCount.value;
  for (const ph of ctx.totalPagesPlaceholder) {
    ph.page.drawText(String(totalPages), {
      x: ph.x,
      y: ph.y,
      size: ph.size,
      font,
      color: rgb(0.3, 0.3, 0.3),
    });
  }

  return await doc.save();
}
