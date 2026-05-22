import { describe, expect, it } from 'vitest';
import { parseStockTable, type StockParseOptions } from '../stockCsv';

const mmOpts: StockParseOptions = { defaultUnit: 'mm' };
const inOpts: StockParseOptions = { defaultUnit: 'in' };

describe('parseStockTable valid input', () => {
  it('parses a CSV header + rows to mm numbers', () => {
    const csv =
      'name,width,height,thickness\nPlywood,1220mm,2440mm,18mm\nPine,1220,2440,18';
    const { rows, errors } = parseStockTable(csv, mmOpts);
    expect(errors).toEqual([]);
    expect(rows).toEqual([
      {
        name: 'Plywood',
        widthMm: 1220,
        lengthMm: 2440,
        thicknessMm: 18,
        quantity: 1,
      },
      {
        name: 'Pine',
        widthMm: 1220,
        lengthMm: 2440,
        thicknessMm: 18,
        quantity: 1,
      },
    ]);
  });

  it('parses a TSV identically to CSV', () => {
    const csv = 'name,width,height,thickness\nPlywood,1220mm,2440mm,18mm';
    const tsv = 'name\twidth\theight\tthickness\nPlywood\t1220mm\t2440mm\t18mm';
    expect(parseStockTable(tsv, mmOpts).rows).toEqual(
      parseStockTable(csv, mmOpts).rows,
    );
  });

  it('converts an inch dimension under an mm default', () => {
    // 48in -> 1219.2mm
    const csv = 'name,width,height,thickness\nA,48in,96in,18mm';
    const { rows } = parseStockTable(csv, mmOpts);
    expect(rows[0].widthMm).toBeCloseTo(1219.2, 4);
    expect(rows[0].lengthMm).toBeCloseTo(2438.4, 4);
  });
});

describe('parseStockTable quantity column', () => {
  it('parses a positive integer quantity via the qty alias', () => {
    const csv = 'name,width,length,thickness,qty\nA,100mm,200mm,18mm,5';
    expect(parseStockTable(csv, mmOpts).rows[0].quantity).toBe(5);
  });

  it('defaults quantity to 1 when the column is absent', () => {
    const csv = 'name,width,length,thickness\nA,100mm,200mm,18mm';
    expect(parseStockTable(csv, mmOpts).rows[0].quantity).toBe(1);
  });

  it.each([
    ['blank cell', '100mm,200mm,18mm,'],
    ['zero', '100mm,200mm,18mm,0'],
    ['negative', '100mm,200mm,18mm,-3'],
    ['fractional', '100mm,200mm,18mm,2.5'],
    ['non-numeric', '100mm,200mm,18mm,abc'],
  ])(
    'falls back to 1 for an invalid quantity (%s) without skipping the row',
    (_label, tail) => {
      const csv = `name,width,length,thickness,quantity\nA,${tail}`;
      const { rows, errors } = parseStockTable(csv, mmOpts);
      expect(errors).toEqual([]);
      expect(rows).toHaveLength(1);
      expect(rows[0].quantity).toBe(1);
    },
  );

  it('accepts the count alias', () => {
    const csv = 'name,width,length,thickness,count\nA,100mm,200mm,18mm,3';
    expect(parseStockTable(csv, mmOpts).rows[0].quantity).toBe(3);
  });
});

describe('parseStockTable Height/Length aliasing', () => {
  it('maps a "Height" header to lengthMm', () => {
    const csv = 'name,width,height,thickness\nA,100mm,200mm,18mm';
    expect(parseStockTable(csv, mmOpts).rows[0].lengthMm).toBe(200);
  });

  it('maps a "Length" header to lengthMm', () => {
    const csv = 'name,width,length,thickness\nA,100mm,200mm,18mm';
    expect(parseStockTable(csv, mmOpts).rows[0].lengthMm).toBe(200);
  });
});

describe('parseStockTable per-cell units', () => {
  it('respects per-cell unit signals and the default unit', () => {
    // width 18mm explicit, thickness 3/4" fraction, length bare under in default
    const csv = 'name,width,length,thickness\nA,18mm,2,3/4"';
    const { rows, errors } = parseStockTable(csv, inOpts);
    expect(errors).toEqual([]);
    expect(rows[0].widthMm).toBe(18);
    expect(rows[0].lengthMm).toBeCloseTo(2 * 25.4, 4);
    expect(rows[0].thicknessMm).toBeCloseTo(0.75 * 25.4, 4);
  });
});

describe('parseStockTable partial import', () => {
  it('skips invalid rows with messages and keeps the valid ones', () => {
    const csv = [
      'name,width,length,thickness',
      'Good,100mm,200mm,18mm', // row 1 valid
      'NoThick,100mm,200mm,', // row 2 missing thickness cell
      'ZeroW,0mm,200mm,18mm', // row 3 zero width
      ',100mm,200mm,18mm', // row 4 empty name
      'BadDim,xyz,200mm,18mm', // row 5 unparseable width
      'Good2,300mm,400mm,12mm', // row 6 valid
    ].join('\n');
    const { rows, errors } = parseStockTable(csv, mmOpts);

    expect(rows.map((r) => r.name)).toEqual(['Good', 'Good2']);

    const byRow = Object.fromEntries(errors.map((e) => [e.row, e.message]));
    expect(byRow[2]).toMatch(/thick/i);
    expect(byRow[3]).toMatch(/width/i);
    expect(byRow[4]).toMatch(/name/i);
    expect(byRow[5]).toMatch(/width/i);
    expect(errors.find((e) => e.row === 2)!.raw).toContain('NoThick');
  });
});

describe('parseStockTable header validation', () => {
  it('reports a row:0 error and no rows when a required column is missing', () => {
    const csv = 'name,width,height\nA,100mm,200mm';
    const { rows, errors } = parseStockTable(csv, mmOpts);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(0);
    expect(errors[0].message).toMatch(/thickness/i);
  });

  it('returns empty rows and empty errors for header-only input', () => {
    const csv = 'name,width,height,thickness';
    expect(parseStockTable(csv, mmOpts)).toEqual({ rows: [], errors: [] });
  });
});

describe('parseStockTable header robustness', () => {
  it('uses last-wins for duplicate headers, ignores unknown columns, handles BOM', () => {
    const csv =
      '﻿name,color,width,height,thickness,thickness\nA,blue,100mm,200mm,18mm,12mm';
    const { rows, errors } = parseStockTable(csv, mmOpts);
    expect(errors).toEqual([]);
    expect(rows[0].name).toBe('A');
    expect(rows[0].thicknessMm).toBe(12);
  });
});
