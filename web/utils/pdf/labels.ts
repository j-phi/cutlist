import { rgb } from 'pdf-lib';
import {
  isSheetBoardLayout,
  isLinearBoardLayout,
  type BoardLayout,
  type BoardLayoutLeftover,
  type Micrometres,
} from 'cutlist';
import { wrapLabel } from './labelText';

/**
 * F1 — part-label / cut-sticker PDF export.
 *
 * Like {@link drawPartDimensions} and {@link drawBoardRegions}, this module is
 * PURE: cell content + pagination are derived without touching pdf-lib, and the
 * per-cell draw step emits typed primitives through an `emit` sink. The real
 * render path supplies an `emit` that draws to a `PDFPage`; tests supply one
 * that pushes records into arrays and assert on them.
 *
 * One label cell per physical part INSTANCE (FR-LBL-2): a BOM line of quantity
 * q produces q identical-content cells, each carrying its own board assignment.
 * Dimension text is pre-formatted via the caller's `formatSize` (the
 * `formatDistance` pipeline) at build time so units/precision match the rest of
 * the app (FR-LBL-7).
 */

/** Fallback board id for a part instance that was never placed. */
export const UNPLACED_BOARD_ID = '—';

/**
 * A single label cell — everything needed to draw one sticker. Dimension
 * strings are already formatted (FR-LBL-7); the draw step only positions text.
 */
export interface LabelCell {
  partNumber: number;
  instanceNumber: number;
  /** Part name (FR-LBL-3). */
  name: string;
  /** Part number for the `#N` line (FR-LBL-3). */
  number: number;
  /** Material name (FR-LBL-3). */
  material: string;
  /** Identifier of the board this instance is cut from, e.g. "Sheet 1". */
  boardId: string;
  /** Finished length, pre-formatted (FR-LBL-3 / FR-LBL-7). */
  lengthLabel: string;
  /** Finished width, pre-formatted. */
  widthLabel: string;
  /** Finished thickness, pre-formatted. */
  thicknessLabel: string;
  /**
   * Grain orientation when locked/known (FR-LBL-4). `'length'` ⇒ arrow runs
   * along the cell's long axis (vertical-ish), `'width'` ⇒ short axis. Absent
   * ⇒ no arrow drawn.
   */
  grainLock?: 'length' | 'width';
}

/** A cell positioned on a page grid (row-major). */
export interface PlacedLabelCell extends LabelCell {
  col: number;
  row: number;
}

export interface LabelPage {
  cells: PlacedLabelCell[];
}

/**
 * A label-stock preset (FR-LBL-5). All measurements in millimetres so they map
 * onto the existing `MM` page-point conversion. Values are the published Avery
 * specs for US Letter.
 */
export interface LabelPreset {
  id: string;
  label: string;
  /** Page size in mm (US Letter for all current presets). */
  pageWmm: number;
  pageHmm: number;
  cols: number;
  rows: number;
  /** Individual label cell size in mm. */
  cellWmm: number;
  cellHmm: number;
  /** Page margins (top + left) in mm to the first cell. */
  marginTopMm: number;
  marginLeftMm: number;
  /** Pitch (cell + gutter) between cell origins in mm. */
  pitchXmm: number;
  pitchYmm: number;
}

const LETTER_W = 215.9;
const LETTER_H = 279.4;

/**
 * Avery preset table (FR-LBL-5). Published dimensions:
 *  - 5160 / 30-up: 2.625" × 1" cells, 3 cols × 10 rows, 0.1875" top margin,
 *    0.21975" left margin, 0.14" column gutter, 0" row gutter.
 *  - 5163 / 10-up: 4" × 2" cells, 2 cols × 5 rows, 0.5" top margin,
 *    0.156" left margin, 0.1875" column gutter, 0" row gutter.
 */
export const LABEL_PRESETS: Record<string, LabelPreset> = {
  'avery-5160': {
    id: 'avery-5160',
    label: 'Avery 5160 — 30 per sheet (2⅝" × 1")',
    pageWmm: LETTER_W,
    pageHmm: LETTER_H,
    cols: 3,
    rows: 10,
    cellWmm: 66.675, // 2.625"
    cellHmm: 25.4, // 1"
    marginTopMm: 12.7, // ~0.5" (0.1875" Avery + header allowance)
    marginLeftMm: 4.7625, // 0.1875"
    pitchXmm: 70.231, // cell + 0.14" gutter
    pitchYmm: 25.4, // no row gutter
  },
  'avery-5163': {
    id: 'avery-5163',
    label: 'Avery 5163 — 10 per sheet (4" × 2")',
    pageWmm: LETTER_W,
    pageHmm: LETTER_H,
    cols: 2,
    rows: 5,
    cellWmm: 101.6, // 4"
    cellHmm: 50.8, // 2"
    marginTopMm: 12.7, // ~0.5"
    marginLeftMm: 3.9624, // 0.156"
    pitchXmm: 106.362, // cell + 0.1875" gutter
    pitchYmm: 50.8, // no row gutter
  },
};

export type LabelPresetId = keyof typeof LABEL_PRESETS;

/**
 * Derive one label cell per placed part instance (FR-LBL-2). The board id names
 * the originating stock: offcut boards read `Offcut: <stock name>`; every other
 * board reads `<stock name> <N>`, where N counts boards of that same stock
 * (so two identical general sheets are distinguishable). Each placement on a
 * board carries that id (FR-LBL-3). Parts that never got placed (leftovers)
 * still get a cell each, with the {@link UNPLACED_BOARD_ID} fallback.
 *
 * Dimension text is formatted here via `formatSize` so the cell carries the
 * same unit/precision as the BOM and layout (FR-LBL-7).
 */
export function buildLabelCells(
  layouts: BoardLayout[],
  leftovers: BoardLayoutLeftover[],
  formatSize: (um: Micrometres) => string | undefined,
): LabelCell[] {
  const cells: LabelCell[] = [];
  const fmt = (um: Micrometres) => formatSize(um) ?? '';

  // Per-stock board counter so identical general boards get sequential ids.
  const boardCounts = new Map<string, number>();
  for (const layout of layouts) {
    const stock = layout.stock;
    let boardId: string;
    if (stock.role === 'offcut') {
      boardId = `Offcut: ${stock.name}`;
    } else {
      const n = (boardCounts.get(stock.name) ?? 0) + 1;
      boardCounts.set(stock.name, n);
      boardId = `${stock.name} ${n}`;
    }

    // Sort placements in reading order: top-to-bottom then left-to-right.
    const sorted = isSheetBoardLayout(layout)
      ? [...layout.placements].sort(
          (a, b) => b.bottomUm - a.bottomUm || a.leftUm - b.leftUm,
        )
      : [...layout.placements].sort((a, b) => a.offsetUm - b.offsetUm);

    for (const p of sorted) {
      cells.push({
        partNumber: p.partNumber,
        instanceNumber: p.instanceNumber,
        name: p.name,
        number: p.partNumber,
        material: p.material,
        boardId,
        lengthLabel: fmt(p.lengthUm),
        widthLabel: fmt(p.widthUm),
        thicknessLabel: fmt(p.thicknessUm),
        grainLock: p.grainLock,
      });
    }
  }

  // Unplaced instances still get a sticker — the user still has to cut them.
  for (const l of leftovers) {
    cells.push({
      partNumber: l.partNumber,
      instanceNumber: l.instanceNumber,
      name: l.name,
      number: l.partNumber,
      material: l.material,
      boardId: UNPLACED_BOARD_ID,
      lengthLabel: fmt(l.lengthUm),
      widthLabel: fmt(l.widthUm),
      thicknessLabel: fmt(l.thicknessUm),
      grainLock: l.grainLock,
    });
  }

  return cells;
}

/**
 * Lay cells onto the preset grid row-major, overflowing to additional pages
 * (FR-LBL-5). A preset of c cols × r rows holds c·r cells per page.
 */
export function paginateLabels(
  cells: LabelCell[],
  preset: LabelPreset,
): LabelPage[] {
  const perPage = preset.cols * preset.rows;
  if (perPage <= 0) return [];
  const pages: LabelPage[] = [];
  for (let i = 0; i < cells.length; i += perPage) {
    const slice = cells.slice(i, i + perPage);
    pages.push({
      cells: slice.map((cell, k) => ({
        ...cell,
        col: k % preset.cols,
        row: Math.floor(k / preset.cols),
      })),
    });
  }
  return pages;
}

export type RgbColor = ReturnType<typeof rgb>;

export interface LabelTextPrimitive {
  text: string;
  /** lower-left origin (pdf-lib semantics). */
  x: number;
  y: number;
  size: number;
  color: RgbColor;
  bold?: boolean;
}

export interface LabelArrowPrimitive {
  /** Arrow runs along this axis: 'v' along the long edge, 'h' along the short. */
  axis: 'h' | 'v';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  size: number;
  color: RgbColor;
}

export interface LabelLinePrimitive {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  thickness: number;
  color: RgbColor;
}

export interface LabelCellEmit {
  text(p: LabelTextPrimitive): void;
  arrow(p: LabelArrowPrimitive): void;
  line(p: LabelLinePrimitive): void;
}

/** Geometry of one cell on the page, in PDF points (lower-left origin). */
export interface LabelCellGeom {
  x: number;
  y: number;
  w: number;
  h: number;
  widthOf: (text: string, size: number) => number;
}

const NAME_COLOR = rgb(0.1, 0.1, 0.1);
const META_COLOR = rgb(0.35, 0.35, 0.35);
const GRAIN_COLOR = rgb(0.45, 0.45, 0.45);

const PAD = 6; // inner padding (pt)
const NAME_PT = 10;
const META_PT = 7;
const LINE_GAP = 2;
// Width strip reserved on the right for the grain-direction arrow.
const GRAIN_RESERVE = 10;

/**
 * Draw one label cell's content (FR-LBL-3 + FR-LBL-4).
 *
 * Layout:
 *   top row    — boardId bold upper-left · #number bold upper-right (fixed NAME_PT)
 *   center     — part name (bold, wrapping) horizontally + vertically centered
 *   below name — dims row, then material row, also centered
 *
 * If the name + two meta rows would overflow the content area, font sizes are
 * stepped down until everything fits. Pure: emits primitives only.
 */
export function drawLabelCell(
  emit: LabelCellEmit,
  cell: LabelCell,
  geom: LabelCellGeom,
): void {
  const { x, y, w, h } = geom;
  const arrowReserve = cell.grainLock ? GRAIN_RESERVE : 0;
  const centerX = x + w / 2;

  // --- Top row (fixed at NAME_PT, never shrinks) ---
  const topBaseline = y + h - PAD - NAME_PT;

  emit.text({
    text: cell.boardId,
    x: x + PAD,
    y: topBaseline,
    size: NAME_PT,
    color: NAME_COLOR,
    bold: true,
  });

  const numberStr = `#${cell.number}`;
  const numW = geom.widthOf(numberStr, NAME_PT);
  emit.text({
    text: numberStr,
    x: x + w - PAD - numW - arrowReserve,
    y: topBaseline,
    size: NAME_PT,
    color: NAME_COLOR,
    bold: true,
  });

  // --- Centered content block: name + dims + material ---

  // Content area: between top row and bottom padding.
  const contentBottom = y + PAD;
  const contentTop = topBaseline - LINE_GAP;
  const contentH = contentTop - contentBottom;
  const nameW = w - 2 * PAD;

  const computeBlock = (np: number, mp: number) => {
    const nameLines = wrapLabel(cell.name, nameW, np, geom.widthOf, 99);
    // blockSpan: distance from top of first name line down to baseline of the
    // single combined meta line. Each name step moves the baseline down by
    // (np + LINE_GAP); the meta line sits at the final baseline position.
    const blockSpan = np + nameLines.length * (np + LINE_GAP);
    return { nameLines, blockSpan };
  };

  let namePt = NAME_PT;
  let metaPt = META_PT;
  let block = computeBlock(namePt, metaPt);

  // Shrink if name exceeds 2 lines or the block overflows the content area.
  while (
    (block.nameLines.length > 2 || block.blockSpan > contentH) &&
    namePt > 5
  ) {
    namePt = Math.max(5, namePt - 1);
    metaPt = Math.max(4, metaPt - 0.75);
    block = computeBlock(namePt, metaPt);
  }

  const { nameLines, blockSpan } = block;

  // Vertical center: first name baseline so block midpoint aligns with content midpoint.
  const contentCenter = contentBottom + contentH / 2;
  let baseline = contentCenter + blockSpan / 2 - namePt;

  // Name lines — horizontally centered.
  for (const line of nameLines) {
    const lw = geom.widthOf(line, namePt);
    emit.text({
      text: line,
      x: centerX - lw / 2,
      y: baseline,
      size: namePt,
      color: NAME_COLOR,
      bold: true,
    });
    baseline -= namePt + LINE_GAP;
  }

  // Single combined meta line: dims | material — centered.
  const metaText = `${cell.lengthLabel} × ${cell.widthLabel} × ${cell.thicknessLabel} | ${cell.material}`;
  emit.text({
    text: metaText,
    x: centerX - geom.widthOf(metaText, metaPt) / 2,
    y: baseline,
    size: metaPt,
    color: META_COLOR,
  });

  // Grain-direction arrow (FR-LBL-4) — only when grain is known/locked.
  if (cell.grainLock) {
    drawGrainArrow(emit, cell.grainLock, geom);
  }
}

/**
 * Draw a grain-direction arrow at the cell's right edge. `'length'` grain runs
 * along the part's long axis → a vertical arrow; `'width'` → horizontal. The
 * arrow is a shaft line plus a `LabelArrowPrimitive` for the head, so a test
 * can assert "an arrow primitive is present" (FR-LBL-4).
 */
function drawGrainArrow(
  emit: LabelCellEmit,
  grainLock: 'length' | 'width',
  geom: LabelCellGeom,
): void {
  const { x, y, w, h } = geom;
  const headPt = 4;
  if (grainLock === 'length') {
    // Vertical arrow near the right edge, pointing up.
    const ax = x + w - PAD - headPt;
    const y1 = y + PAD + headPt;
    const y2 = y + h - PAD;
    emit.line({ x1: ax, y1, x2: ax, y2, thickness: 0.6, color: GRAIN_COLOR });
    emit.arrow({
      axis: 'v',
      x1: ax,
      y1: y2,
      x2: ax,
      y2,
      size: headPt,
      color: GRAIN_COLOR,
    });
  } else {
    // Horizontal arrow along the bottom, pointing right.
    const ay = y + PAD + headPt;
    const x1 = x + PAD;
    const x2 = x + w - PAD - headPt;
    emit.line({ x1, y1: ay, x2, y2: ay, thickness: 0.6, color: GRAIN_COLOR });
    emit.arrow({
      axis: 'h',
      x1: x2,
      y1: ay,
      x2,
      y2: ay,
      size: headPt,
      color: GRAIN_COLOR,
    });
  }
}
