import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { PDFFont, PDFPage } from 'pdf-lib';
import type { BoardLayout, BoardLayoutLeftover, Micrometres } from 'cutlist';
import { MM } from './pdf/constants';
import {
  buildLabelCells,
  drawLabelCell,
  paginateLabels,
  LABEL_PRESETS,
  type LabelCellEmit,
  type LabelCellGeom,
  type LabelPreset,
  type LabelPresetId,
} from './pdf/labels';

export interface ExportLabelsOptions {
  layouts: BoardLayout[];
  leftovers: BoardLayoutLeftover[];
  /** Same `formatDistance` pipeline as the rest of the app (FR-LBL-7). */
  formatSize: (um: Micrometres) => string | undefined;
  /** Label-stock preset (FR-LBL-5). Defaults to Avery 5160 (30-up). */
  preset?: LabelPresetId;
}

/**
 * F1 — generate a SEPARATE PDF of part-label / cut-sticker cells (not the
 * board-layout PDF). One cell per physical part instance (FR-LBL-2), laid onto
 * the chosen Avery preset grid (FR-LBL-5).
 */
export async function exportLabelsPdf(
  options: ExportLabelsOptions,
): Promise<Uint8Array> {
  const preset = LABEL_PRESETS[options.preset ?? 'avery-5160'];
  const cells = buildLabelCells(
    options.layouts,
    options.leftovers,
    options.formatSize,
  );
  const pages = paginateLabels(cells, preset);

  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  // Always emit at least an empty page so the export is a valid PDF artifact.
  if (pages.length === 0) {
    doc.addPage([preset.pageWmm * MM, preset.pageHmm * MM]);
    return await doc.save();
  }

  for (const labelPage of pages) {
    const page = doc.addPage([preset.pageWmm * MM, preset.pageHmm * MM]);
    for (const cell of labelPage.cells) {
      const geom = cellGeometry(cell.col, cell.row, preset, page, fontBold);
      drawCellBorder(page, geom);
      drawLabelCell(makeLabelEmit(page, font, fontBold), cell, geom);
    }
  }

  return await doc.save();
}

/** Map a grid position to a PDF-points rect (lower-left origin). */
function cellGeometry(
  col: number,
  row: number,
  preset: LabelPreset,
  page: PDFPage,
  font: PDFFont,
): LabelCellGeom {
  const pageH = page.getSize().height;
  const x = (preset.marginLeftMm + col * preset.pitchXmm) * MM;
  // Rows count from the top; PDF y grows upward.
  const topY = pageH - preset.marginTopMm * MM - row * preset.pitchYmm * MM;
  const y = topY - preset.cellHmm * MM;
  return {
    x,
    y,
    w: preset.cellWmm * MM,
    h: preset.cellHmm * MM,
    widthOf: (text, size) => font.widthOfTextAtSize(text, size),
  };
}

function drawCellBorder(page: PDFPage, geom: LabelCellGeom): void {
  page.drawRectangle({
    x: geom.x,
    y: geom.y,
    width: geom.w,
    height: geom.h,
    borderColor: rgb(0.85, 0.85, 0.85),
    borderWidth: 0.4,
  });
}

/** Real PDF render sink for {@link drawLabelCell}. */
function makeLabelEmit(
  page: PDFPage,
  font: PDFFont,
  fontBold: PDFFont,
): LabelCellEmit {
  return {
    text(p) {
      // Truncate to fit the cell width so a long name never spills out.
      page.drawText(p.text, {
        x: p.x,
        y: p.y,
        size: p.size,
        font: p.bold ? fontBold : font,
        color: p.color,
      });
    },
    arrow(p) {
      const half = p.size / 2;
      if (p.axis === 'v') {
        // Head at (x2,y2) pointing up.
        page.drawLine({
          start: { x: p.x2, y: p.y2 },
          end: { x: p.x2 - half, y: p.y2 - p.size },
          thickness: 0.6,
          color: p.color,
        });
        page.drawLine({
          start: { x: p.x2, y: p.y2 },
          end: { x: p.x2 + half, y: p.y2 - p.size },
          thickness: 0.6,
          color: p.color,
        });
      } else {
        // Head at (x2,y2) pointing right.
        page.drawLine({
          start: { x: p.x2, y: p.y2 },
          end: { x: p.x2 - p.size, y: p.y2 - half },
          thickness: 0.6,
          color: p.color,
        });
        page.drawLine({
          start: { x: p.x2, y: p.y2 },
          end: { x: p.x2 - p.size, y: p.y2 + half },
          thickness: 0.6,
          color: p.color,
        });
      }
    },
    line(p) {
      page.drawLine({
        start: { x: p.x1, y: p.y1 },
        end: { x: p.x2, y: p.y2 },
        thickness: p.thickness,
        color: p.color,
      });
    },
  };
}
