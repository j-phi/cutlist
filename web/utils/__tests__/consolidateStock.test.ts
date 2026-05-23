import { describe, expect, it } from 'vitest';
import type { SheetStockMatrix, StockMatrix } from 'cutlist';
import { consolidateStock, mergeSheetSizes } from '../consolidateStock';

type SheetSize = SheetStockMatrix['sizes'][number];

const sheet = (
  material: string,
  sizes: SheetSize[],
  extra: Partial<SheetStockMatrix> = {},
): SheetStockMatrix => ({
  kind: 'sheet',
  material,
  role: 'offcut',
  sizes,
  ...extra,
});

describe('mergeSheetSizes', () => {
  it('sums quantities of identical offcut board types', () => {
    // Same physical board listed twice → one board type with the summed count.
    const out = mergeSheetSizes(
      [
        { width: 1220, length: 2440, thickness: [18], quantity: 4 },
        { width: 1220, length: 2440, thickness: [18], quantity: 4 },
      ],
      'offcut',
    );
    expect(out).toEqual([
      { width: 1220, length: 2440, thickness: [18], quantity: 8 },
    ]);
  });

  it('merges same-size different-thickness offcuts when quantities match', () => {
    const out = mergeSheetSizes(
      [
        { width: 1220, length: 2440, thickness: [18], quantity: 2 },
        { width: 1220, length: 2440, thickness: [12], quantity: 2 },
      ],
      'offcut',
    );
    expect(out).toEqual([
      { width: 1220, length: 2440, thickness: [12, 18], quantity: 2 },
    ]);
  });

  it('keeps same-size offcuts as separate rows when quantities differ', () => {
    // A size row carries a single quantity, so differing counts can't share it.
    const out = mergeSheetSizes(
      [
        { width: 1220, length: 2440, thickness: [18], quantity: 4 },
        { width: 1220, length: 2440, thickness: [12], quantity: 2 },
      ],
      'offcut',
    );
    expect(out).toEqual([
      { width: 1220, length: 2440, thickness: [18], quantity: 4 },
      { width: 1220, length: 2440, thickness: [12], quantity: 2 },
    ]);
  });

  it('defaults a missing offcut quantity to 1 before summing', () => {
    const out = mergeSheetSizes(
      [
        { width: 600, length: 600, thickness: [18] },
        { width: 600, length: 600, thickness: [18], quantity: 1 },
      ],
      'offcut',
    );
    expect(out).toEqual([
      { width: 600, length: 600, thickness: [18], quantity: 2 },
    ]);
  });

  it('merges general-stock thicknesses by size and never writes a quantity', () => {
    // General stock is infinite; duplicates collapse, thicknesses union, and
    // no quantity field is produced.
    const out = mergeSheetSizes(
      [
        { width: 1220, length: 2440, thickness: [18] },
        { width: 1220, length: 2440, thickness: [12] },
        { width: 1220, length: 2440, thickness: [18] },
      ],
      'general',
    );
    expect(out).toEqual([{ width: 1220, length: 2440, thickness: [12, 18] }]);
  });

  it('keeps named offcut boards separate even when dimensions match', () => {
    // Two physical remnants that happen to be the same size but are distinct
    // pieces (different names) must not have their quantities merged.
    const out = mergeSheetSizes(
      [
        {
          name: 'Board 1',
          width: 584,
          length: 813,
          thickness: [19],
          quantity: 1,
        },
        {
          name: 'Board 2',
          width: 584,
          length: 813,
          thickness: [19],
          quantity: 1,
        },
      ],
      'offcut',
    );
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({ name: 'Board 1', quantity: 1 });
    expect(out[1]).toMatchObject({ name: 'Board 2', quantity: 1 });
  });

  it('still merges unnamed offcut boards of the same dimensions', () => {
    const out = mergeSheetSizes(
      [
        { width: 584, length: 813, thickness: [19], quantity: 1 },
        { width: 584, length: 813, thickness: [19], quantity: 1 },
      ],
      'offcut',
    );
    expect(out).toEqual([
      { width: 584, length: 813, thickness: [19], quantity: 2 },
    ]);
  });

  it('preserves a thickness-less size instead of dropping it', () => {
    const out = mergeSheetSizes(
      [
        { width: 1220, length: 2440, thickness: [18], quantity: 1 },
        { width: 800, length: 400, thickness: [], quantity: 1 },
      ],
      'offcut',
    );
    expect(out).toContainEqual({
      width: 800,
      length: 400,
      thickness: [],
      quantity: 1,
    });
  });
});

describe('consolidateStock', () => {
  it('merges same role+material sheet panels into the first one in place', () => {
    const input: StockMatrix[] = [
      sheet('Ply', [
        { width: 1220, length: 2440, thickness: [18], quantity: 1 },
      ]),
      sheet('MDF', [{ width: 800, length: 400, thickness: [12], quantity: 1 }]),
      sheet('Ply', [{ width: 600, length: 600, thickness: [18], quantity: 2 }]),
    ];
    const { result, removed } = consolidateStock(input);

    expect(removed).toBe(1);
    expect(result.map((m) => m.material)).toEqual(['Ply', 'MDF']);
    expect((result[0] as SheetStockMatrix).sizes).toEqual([
      { width: 1220, length: 2440, thickness: [18], quantity: 1 },
      { width: 600, length: 600, thickness: [18], quantity: 2 },
    ]);
  });

  it('does not merge an offcut panel into a general panel of the same material', () => {
    const input: StockMatrix[] = [
      sheet('Ply', [{ width: 1220, length: 2440, thickness: [18] }], {
        role: 'general',
      }),
      sheet('Ply', [{ width: 600, length: 600, thickness: [18], quantity: 1 }]),
    ];
    const { result, removed } = consolidateStock(input);

    expect(removed).toBe(0);
    expect(result).toHaveLength(2);
    expect(result.map((m) => m.role)).toEqual(['general', 'offcut']);
  });

  it('leaves linear stock untouched and in position', () => {
    const linear: StockMatrix = {
      kind: 'linear',
      material: 'Pine',
      role: 'general',
      size: {
        crossSectionWidth: 89,
        crossSectionThickness: 38,
        lengths: [2400],
      },
    };
    const input: StockMatrix[] = [
      sheet('Ply', [{ width: 1220, length: 2440, thickness: [18] }]),
      linear,
      sheet('Ply', [{ width: 600, length: 600, thickness: [18] }]),
    ];
    const { result, removed } = consolidateStock(input);

    expect(removed).toBe(1);
    // Linear panel survives untouched; merged Ply lands at its first position.
    expect(result.map((m) => m.kind)).toEqual(['sheet', 'linear']);
    expect(result[1]).toBe(linear);
  });

  it('unions thicknessAlgorithms across merged panels, earlier wins on conflict', () => {
    const input: StockMatrix[] = [
      sheet('Ply', [{ width: 1220, length: 2440, thickness: [18] }], {
        thicknessAlgorithms: { '18': 'tidy' },
      }),
      sheet('Ply', [{ width: 600, length: 600, thickness: [12] }], {
        thicknessAlgorithms: { '18': 'compact', '12': 'cnc' },
      }),
    ];
    const { result } = consolidateStock(input);
    expect((result[0] as SheetStockMatrix).thicknessAlgorithms).toEqual({
      '18': 'tidy',
      '12': 'cnc',
    });
  });
});
