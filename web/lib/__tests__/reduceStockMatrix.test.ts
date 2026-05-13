import { describe, expect, it } from 'vitest';
import { isLinearStock, reduceStockMatrix, type SheetStock } from '..';

const sheetOnly = (
  stocks: ReturnType<typeof reduceStockMatrix>,
): SheetStock[] => stocks.filter((s): s is SheetStock => !isLinearStock(s));

describe('reduceStockMatrix', () => {
  it('returns [] for an empty matrix', () => {
    expect(reduceStockMatrix([])).toEqual([]);
  });

  it('converts mm input to µm', () => {
    const result = sheetOnly(
      reduceStockMatrix([
        {
          kind: 'sheet',
          material: 'MDF',
          sizes: [{ width: 1220, length: 2440, thickness: [18] }],
        },
      ]),
    );
    expect(result).toHaveLength(1);
    expect(result[0].thickness).toBe(18_000);
    expect(result[0].width).toBe(1_220_000);
    expect(result[0].length).toBe(2_440_000);
  });

  it('returns one stock per size × thickness combination', () => {
    const result = sheetOnly(
      reduceStockMatrix([
        {
          kind: 'sheet',
          material: 'Ply',
          sizes: [
            { width: 600, length: 2440, thickness: [12] },
            { width: 1220, length: 2440, thickness: [12] },
          ],
        },
      ]),
    );
    expect(result).toHaveLength(2);
    expect(result.map((s) => s.width)).toEqual([600_000, 1_220_000]);
  });

  it('returns sizes × thicknesses count', () => {
    // 2 sizes × 3 thicknesses each = 6
    const result = reduceStockMatrix([
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [
          { width: 600, length: 1800, thickness: [9, 12, 18] },
          { width: 1220, length: 2440, thickness: [9, 12, 18] },
        ],
      },
    ]);
    expect(result).toHaveLength(6);
  });

  it('supports different thicknesses per size', () => {
    const result = sheetOnly(
      reduceStockMatrix([
        {
          kind: 'sheet',
          material: 'Ply',
          sizes: [
            { width: 1220, length: 2440, thickness: [18, 12, 9] },
            { width: 1220, length: 1220, thickness: [12] },
          ],
        },
      ]),
    );
    expect(result).toHaveLength(4);
    const small = result.filter(
      (s) => s.length === 1_220_000 && s.width === 1_220_000,
    );
    expect(small).toHaveLength(1);
    expect(small[0].thickness).toBe(12_000);
  });

  it('preserves material on all stocks', () => {
    const result = reduceStockMatrix([
      {
        kind: 'sheet',
        material: 'Oak',
        sizes: [
          { width: 300, length: 1800, thickness: [18] },
          { width: 600, length: 2400, thickness: [18] },
        ],
      },
    ]);
    expect(result.every((s) => s.material === 'Oak')).toBe(true);
  });

  it('combines all stocks from multiple StockMatrix items', () => {
    const result = reduceStockMatrix([
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
      {
        kind: 'sheet',
        material: 'Ply',
        sizes: [{ width: 600, length: 1800, thickness: [12] }],
      },
    ]);
    expect(result).toHaveLength(2);
    expect(result[0].material).toBe('MDF');
    expect(result[1].material).toBe('Ply');
  });
});
