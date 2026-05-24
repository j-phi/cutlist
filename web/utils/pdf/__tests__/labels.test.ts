import { describe, expect, it } from 'vitest';
import {
  formatValue,
  mmToUm,
  type Micrometres,
  type SheetBoardLayout,
} from 'cutlist';
import {
  buildLabelCells,
  paginateLabels,
  drawLabelCell,
  LABEL_PRESETS,
  type LabelCell,
  type LabelCellEmit,
  type LabelTextPrimitive,
  type LabelArrowPrimitive,
} from '../labels';

const um = (mm: number) => mmToUm(mm);

/** Build a sheet layout with one placement per supplied part spec. */
function sheetLayout(
  name: string,
  placements: Array<{
    partNumber: number;
    instanceNumber: number;
    name: string;
    material: string;
    widthUm: Micrometres;
    lengthUm: Micrometres;
    thicknessUm: Micrometres;
    grainLock?: 'length' | 'width';
  }>,
): SheetBoardLayout {
  return {
    kind: 'sheet',
    stock: {
      name,
      material: placements[0]?.material ?? 'Plywood',
      widthUm: um(1220),
      lengthUm: um(2440),
      thicknessUm: um(18),
      role: 'general',
    },
    marginUm: um(0) as Micrometres,
    algorithm: 'tidy',
    placements: placements.map((p) => ({
      ...p,
      leftUm: um(0) as Micrometres,
      rightUm: p.widthUm,
      bottomUm: um(0) as Micrometres,
      topUm: p.lengthUm,
      allowanceWidthUm: um(0) as Micrometres,
      allowanceLengthUm: um(0) as Micrometres,
    })),
  };
}

/** mm/0.1mm format oracle — the same pipeline display uses (formatDistance). */
const mmFormat = (u: Micrometres) =>
  `${formatValue(u / 1000, 'mm', { kind: 'decimal', step: 0.1 })} mm`;
/** inch/1-16 format oracle. */
const inchFormat = (u: Micrometres) =>
  `${formatValue(u / 25400, 'in', { kind: 'fraction', denominator: 16 })}"`;

/** Collect every text string a cell emits. */
function cellText(cell: LabelCell): string {
  const texts: LabelTextPrimitive[] = [];
  const arrows: LabelArrowPrimitive[] = [];
  const emit: LabelCellEmit = {
    text: (p) => texts.push(p),
    arrow: (p) => arrows.push(p),
    line: () => {},
  };
  drawLabelCell(emit, cell, {
    x: 0,
    y: 0,
    w: 200,
    h: 72,
    widthOf: (t, s) => t.length * s * 0.5,
  });
  return texts.map((t) => t.text).join(' ');
}

describe('buildLabelCells — instance expansion (FR-LBL-2)', () => {
  it('emits one cell per physical instance, not per BOM line', () => {
    const layout = sheetLayout('Sheet 1', [
      ...[0, 1, 2].map((i) => ({
        partNumber: 2,
        instanceNumber: i,
        name: 'Side',
        material: 'Plywood',
        widthUm: um(300),
        lengthUm: um(600),
        thicknessUm: um(18),
      })),
      {
        partNumber: 3,
        instanceNumber: 0,
        name: 'Top',
        material: 'Plywood',
        widthUm: um(400),
        lengthUm: um(800),
        thicknessUm: um(18),
      },
    ]);
    const cells = buildLabelCells([layout], [], mmFormat);
    // A ×3 + B ×1 ⇒ 4 cells.
    expect(cells).toHaveLength(4);
  });

  it('emits q cells for an unplaced part with a fallback board id', () => {
    const cells = buildLabelCells(
      [],
      [
        {
          partNumber: 9,
          instanceNumber: 0,
          name: 'Shelf',
          material: 'Oak',
          widthUm: um(200),
          lengthUm: um(500),
          thicknessUm: um(18),
        },
        {
          partNumber: 9,
          instanceNumber: 1,
          name: 'Shelf',
          material: 'Oak',
          widthUm: um(200),
          lengthUm: um(500),
          thicknessUm: um(18),
        },
      ],
      mmFormat,
    );
    expect(cells).toHaveLength(2);
    expect(cells[0].boardId).toBe('—');
  });
});

describe('buildLabelCells — content completeness (FR-LBL-3)', () => {
  it("includes name, number, dims, material and board id in the cell's text", () => {
    const layout = sheetLayout('Sheet 1', [
      {
        partNumber: 2,
        instanceNumber: 0,
        name: 'Side',
        material: 'Plywood',
        widthUm: um(300),
        lengthUm: um(600),
        thicknessUm: um(18),
      },
    ]);
    const [cell] = buildLabelCells([layout], [], mmFormat);
    const text = cellText(cell);
    expect(text).toContain('Side'); // name
    expect(text).toContain('#2'); // number
    expect(text).toContain('Plywood'); // material
    expect(text).toContain('Sheet 1'); // board id
    expect(text).toContain('600 mm'); // length
    expect(text).toContain('300 mm'); // width
    expect(text).toContain('18 mm'); // thickness
  });
});

describe('buildLabelCells — unit consistency (FR-LBL-7)', () => {
  it('renders a 304.8 mm dimension as inches when the project unit is inch', () => {
    const layout = sheetLayout('Sheet 1', [
      {
        partNumber: 1,
        instanceNumber: 0,
        name: 'Rail',
        material: 'Maple',
        widthUm: um(304.8),
        lengthUm: um(304.8),
        thicknessUm: um(18),
      },
    ]);
    const [cell] = buildLabelCells([layout], [], inchFormat);
    const text = cellText(cell);
    expect(text).toContain('12"');
    expect(text).not.toContain('mm');
  });
});

describe('drawLabelCell — grain arrow (FR-LBL-4)', () => {
  function arrowsFor(grainLock?: 'length' | 'width'): LabelArrowPrimitive[] {
    const layout = sheetLayout('Sheet 1', [
      {
        partNumber: 1,
        instanceNumber: 0,
        name: 'Rail',
        material: 'Maple',
        widthUm: um(300),
        lengthUm: um(600),
        thicknessUm: um(18),
        grainLock,
      },
    ]);
    const [cell] = buildLabelCells([layout], [], mmFormat);
    const arrows: LabelArrowPrimitive[] = [];
    drawLabelCell(
      { text: () => {}, arrow: (p) => arrows.push(p), line: () => {} },
      cell,
      { x: 0, y: 0, w: 200, h: 72, widthOf: (t, s) => t.length * s * 0.5 },
    );
    return arrows;
  }

  it('draws a grain arrow when grain is locked', () => {
    expect(arrowsFor('length').length).toBeGreaterThan(0);
  });

  it('draws no grain arrow when grain is unconstrained', () => {
    expect(arrowsFor(undefined)).toHaveLength(0);
  });
});

describe('paginateLabels — Avery presets (FR-LBL-5)', () => {
  it('packs 35 labels onto Avery-5160 as 30 + 5 at the preset pitch', () => {
    const preset = LABEL_PRESETS['avery-5160'];
    const cells: LabelCell[] = Array.from({ length: 35 }, (_, i) => ({
      partNumber: i,
      instanceNumber: 0,
      name: `P${i}`,
      number: i,
      material: 'Plywood',
      boardId: 'Sheet 1',
      lengthLabel: '1 mm',
      widthLabel: '1 mm',
      thicknessLabel: '1 mm',
    }));
    const pages = paginateLabels(cells, preset);
    expect(pages).toHaveLength(2);
    expect(pages[0].cells).toHaveLength(30);
    expect(pages[1].cells).toHaveLength(5);
    // Row-major placement at the preset's pitch.
    expect(pages[0].cells[0].col).toBe(0);
    expect(pages[0].cells[0].row).toBe(0);
    expect(pages[0].cells[1].col).toBe(1);
    expect(pages[0].cells[3].col).toBe(0);
    expect(pages[0].cells[3].row).toBe(1);
  });

  it('Avery-5163 is a 2×5 grid (10-up)', () => {
    const preset = LABEL_PRESETS['avery-5163'];
    expect(preset.cols * preset.rows).toBe(10);
  });
});

describe('exportLabelsPdf — assembler smoke (FR-LBL-1)', () => {
  it('produces a non-empty PDF for a layout with placements', async () => {
    const { exportLabelsPdf } = await import('../../exportLabelsPdf');
    const layout = sheetLayout('Sheet 1', [
      {
        partNumber: 1,
        instanceNumber: 0,
        name: 'Side',
        material: 'Plywood',
        widthUm: um(300),
        lengthUm: um(600),
        thicknessUm: um(18),
        grainLock: 'length',
      },
    ]);
    const bytes = await exportLabelsPdf({
      layouts: [layout],
      leftovers: [],
      formatSize: mmFormat,
      preset: 'avery-5160',
    });
    // A PDF starts with "%PDF" and has non-trivial length.
    expect(bytes.byteLength).toBeGreaterThan(100);
    expect(String.fromCharCode(...bytes.slice(0, 4))).toBe('%PDF');
  });
});
