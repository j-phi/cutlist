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
  role: 'general' | 'offcut' = 'general',
): SheetBoardLayout {
  return {
    kind: 'sheet',
    stock: {
      name,
      material: placements[0]?.material ?? 'Plywood',
      widthUm: um(1220),
      lengthUm: um(2440),
      thicknessUm: um(18),
      role,
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

describe('buildLabelCells — board id names the originating stock', () => {
  const part = (partNumber: number) => ({
    partNumber,
    instanceNumber: 0,
    name: 'Side',
    material: 'Plywood',
    widthUm: um(300),
    lengthUm: um(600),
    thicknessUm: um(18),
  });

  it('numbers general boards per stock so identical sheets are distinguishable', () => {
    const cells = buildLabelCells(
      [
        sheetLayout('Maple Ply', [part(1)]),
        sheetLayout('Maple Ply', [part(2)]),
      ],
      [],
      mmFormat,
    );
    expect(cells.map((c) => c.boardId)).toEqual(['Maple Ply 1', 'Maple Ply 2']);
  });

  it('labels offcut boards by name without a counter', () => {
    const [cell] = buildLabelCells(
      [sheetLayout('Garage scrap', [part(1)], 'offcut')],
      [],
      mmFormat,
    );
    expect(cell.boardId).toBe('Offcut: Garage scrap');
  });

  it('counts each stock independently (numbering tied to engine order)', () => {
    // Engine order Maple, Oak, Maple ⇒ the two Maple boards are 1 and 2.
    const cells = buildLabelCells(
      [
        sheetLayout('Maple Ply', [part(1)]),
        sheetLayout('Oak Ply', [part(2)]),
        sheetLayout('Maple Ply', [part(3)]),
      ],
      [],
      mmFormat,
    );
    // Grouped by board name after numbering: both Maple boards, then Oak.
    expect(cells.map((c) => c.boardId)).toEqual([
      'Maple Ply 1',
      'Maple Ply 2',
      'Oak Ply 1',
    ]);
  });
});

describe('buildLabelCells — sticker ordering', () => {
  const part = (partNumber: number, name: string) => ({
    partNumber,
    instanceNumber: 0,
    name,
    material: 'Plywood',
    widthUm: um(300),
    lengthUm: um(600),
    thicknessUm: um(18),
  });

  it('groups stickers by board name, numeric-aware (Ply 2 before Ply 10)', () => {
    // Engine emits boards 1..10 in order, but cells must group 1,2,…,10.
    const layouts = Array.from({ length: 10 }, (_, i) =>
      sheetLayout('Ply', [part(i + 1, `P${i + 1}`)]),
    );
    const cells = buildLabelCells(layouts, [], mmFormat);
    expect(cells.map((c) => c.boardId)).toEqual(
      Array.from({ length: 10 }, (_, i) => `Ply ${i + 1}`),
    );
  });

  it('prints all offcut boards first, then other boards, each by name', () => {
    const cells = buildLabelCells(
      [
        sheetLayout('Oak Ply', [part(1, 'A')]),
        sheetLayout('Garage scrap', [part(2, 'B')], 'offcut'),
        sheetLayout('Maple Ply', [part(3, 'C')]),
        sheetLayout('Attic scrap', [part(4, 'D')], 'offcut'),
      ],
      [],
      mmFormat,
    );
    expect(cells.map((c) => c.boardId)).toEqual([
      'Offcut: Attic scrap',
      'Offcut: Garage scrap',
      'Maple Ply 1',
      'Oak Ply 1',
    ]);
  });

  it('keeps placed cells before unplaced leftover cells', () => {
    const cells = buildLabelCells(
      [sheetLayout('Ply', [part(1, 'Placed')])],
      [
        {
          partNumber: 9,
          instanceNumber: 0,
          name: 'Unplaced',
          material: 'Plywood',
          widthUm: um(200),
          lengthUm: um(500),
          thicknessUm: um(18),
        },
      ],
      mmFormat,
    );
    expect(cells.map((c) => c.name)).toEqual(['Placed', 'Unplaced']);
  });
});

describe('buildLabelCells — board reading order', () => {
  /** Sheet layout with explicit placement coordinates. */
  function sheetAt(
    placements: Array<{ name: string; leftUm: number; bottomUm: number }>,
  ): SheetBoardLayout {
    return {
      kind: 'sheet',
      stock: {
        name: 'Sheet 1',
        material: 'Plywood',
        widthUm: um(1220),
        lengthUm: um(2440),
        thicknessUm: um(18),
        role: 'general',
      },
      marginUm: um(0) as Micrometres,
      algorithm: 'tidy',
      placements: placements.map((p, i) => ({
        partNumber: i + 1,
        instanceNumber: 0,
        name: p.name,
        material: 'Plywood',
        widthUm: um(100) as Micrometres,
        lengthUm: um(200) as Micrometres,
        thicknessUm: um(18) as Micrometres,
        leftUm: um(p.leftUm) as Micrometres,
        rightUm: um(p.leftUm + 100) as Micrometres,
        bottomUm: um(p.bottomUm) as Micrometres,
        topUm: um(p.bottomUm + 200) as Micrometres,
        allowanceWidthUm: um(0) as Micrometres,
        allowanceLengthUm: um(0) as Micrometres,
      })),
    };
  }

  it('orders cells top-to-bottom then left-to-right within each board', () => {
    // Layout: D is top-left, C is top-right, B is mid-left, A is bottom-left.
    const layout = sheetAt([
      { name: 'A', leftUm: 0, bottomUm: 0 },
      { name: 'B', leftUm: 0, bottomUm: 300 },
      { name: 'C', leftUm: 600, bottomUm: 800 },
      { name: 'D', leftUm: 0, bottomUm: 800 },
    ]);
    const cells = buildLabelCells([layout], [], mmFormat);
    expect(cells.map((c) => c.name)).toEqual(['D', 'C', 'B', 'A']);
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

describe('drawLabelCell — title wrapping and font shrink', () => {
  /** Collect all text primitives for a cell drawn into a w×h box. */
  function cellPrimitives(
    name: string,
    w: number,
    h: number,
    number = 1,
  ): LabelTextPrimitive[] {
    const texts: LabelTextPrimitive[] = [];
    const cell: LabelCell = {
      partNumber: number,
      instanceNumber: 0,
      name,
      number,
      material: 'Plywood',
      boardId: 'Sheet 1',
      lengthLabel: '600 mm',
      widthLabel: '300 mm',
      thicknessLabel: '18 mm',
    };
    drawLabelCell(
      { text: (p) => texts.push(p), arrow: () => {}, line: () => {} },
      cell,
      { x: 0, y: 0, w, h, widthOf: (t, s) => t.length * s * 0.5 },
    );
    return texts;
  }

  it('boardId is upper-left, #number is upper-right, name wraps centered below', () => {
    const name = 'Back Wall | Bottom Right Box: Toe Kick: Front/Back';
    const texts = cellPrimitives(name, 200, 72, 27);
    const bold = texts.filter((t) => t.bold);

    const numPrim = bold.find((t) => t.text === '#27');
    const boardPrim = bold.find((t) => t.text === 'Sheet 1');
    expect(numPrim).toBeDefined();
    expect(boardPrim).toBeDefined();

    // Number is to the right of the boardId — both in the top row.
    expect(numPrim!.x).toBeGreaterThan(boardPrim!.x);

    // Name wraps into at most 2 centered lines below the top row.
    const nameLines = bold.filter(
      (t) => t.text !== '#27' && t.text !== 'Sheet 1',
    );
    expect(nameLines.length).toBeGreaterThanOrEqual(1);
    expect(nameLines.length).toBeLessThanOrEqual(2);

    const combined = nameLines.map((t) => t.text).join(' ');
    expect(combined).toContain('Back Wall');
    expect(combined).toContain('Toe Kick');

    // Single combined meta line contains dims and material joined by |.
    const nonBold = texts.filter((t) => !t.bold);
    const metaLine = nonBold.find((t) => t.text.includes('|'));
    expect(metaLine?.text).toContain('600 mm');
    expect(metaLine?.text).toContain('Plywood');
  });

  it('shrinks name font when name exceeds 2 lines', () => {
    // An extremely long name forces the 2-line cap to trigger shrinking.
    const name =
      'A Very Long Cabinet Component Name That Definitely Will Not Fit At Default Size';
    const texts = cellPrimitives(name, 200, 72);
    const bold = texts.filter((t) => t.bold);
    const nameLines = bold.filter(
      (t) => t.text !== '#1' && t.text !== 'Sheet 1',
    );
    // Capped at 2 lines.
    expect(nameLines.length).toBeLessThanOrEqual(2);
    // Font was reduced from the default 10.
    expect(nameLines[0].size).toBeLessThan(10);
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
