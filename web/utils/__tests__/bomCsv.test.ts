import { describe, expect, it } from 'vitest';
import { mmToUm, type Micrometres } from 'cutlist';
import {
  BOM_CSV_TEMPLATE,
  parseBomTable,
  parseDimCell,
  parseGrainCell,
  type BomParseOptions,
} from '../bomCsv';

const mmOpts: BomParseOptions = {
  defaultUnit: 'mm',
  defaultThicknessUm: mmToUm(18),
};
const inOpts: BomParseOptions = {
  defaultUnit: 'in',
  defaultThicknessUm: mmToUm(18),
};

describe('parseDimCell', () => {
  it('parses a trailing-mm cell regardless of default unit', () => {
    // 750mm should resolve to mm even with an inch default.
    expect(parseDimCell('750mm', 'in')).toBe(mmToUm(750));
  });

  it('parses inch signals: ", in, fraction, mixed, feet-inches', () => {
    expect(parseDimCell('30in', 'mm')).toBe(mmToUm(30 * 25.4));
    expect(parseDimCell('3/4"', 'mm')).toBe(mmToUm(0.75 * 25.4));
    expect(parseDimCell('1 1/2', 'mm')).toBe(mmToUm(1.5 * 25.4));
    expect(parseDimCell(`1'6"`, 'mm')).toBe(mmToUm(18 * 25.4));
  });

  it('treats a bare number using the default unit', () => {
    expect(parseDimCell('750', 'mm')).toBe(mmToUm(750));
    expect(parseDimCell('2', 'in')).toBe(mmToUm(2 * 25.4));
  });

  it('returns null on unparseable or non-positive cells', () => {
    expect(parseDimCell('abc', 'mm')).toBeNull();
    expect(parseDimCell('0', 'mm')).toBeNull();
    expect(parseDimCell('', 'mm')).toBeNull();
  });
});

describe('parseBomTable delimiter detection', () => {
  it('parses comma and tab versions to identical logical data', () => {
    const csv = 'name,qty,length,width,material\nShelf,2,600mm,300mm,Plywood';
    const tsv =
      'name\tqty\tlength\twidth\tmaterial\nShelf\t2\t600mm\t300mm\tPlywood';
    const a = parseBomTable(csv, mmOpts);
    const b = parseBomTable(tsv, mmOpts);
    expect(a.errors).toEqual([]);
    expect(b.errors).toEqual([]);
    expect(a.rows).toEqual(b.rows);
    expect(a.rows[0]).toEqual({
      name: 'Shelf',
      qty: 2,
      lengthUm: mmToUm(600),
      widthUm: mmToUm(300),
      thicknessUm: mmToUm(18),
      material: 'Plywood',
    });
  });
});

describe('BOM_CSV_TEMPLATE', () => {
  // Guards against drift: the copy-to-clipboard template headers must keep
  // parsing cleanly through the importer the user pastes them back into.
  it('round-trips through parseBomTable with no errors', () => {
    const { rows, errors } = parseBomTable(BOM_CSV_TEMPLATE, mmOpts);
    expect(errors).toEqual([]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      name: 'Side Panel',
      qty: 2,
      lengthUm: mmToUm(600),
      widthUm: mmToUm(300),
      thicknessUm: mmToUm(18),
      material: 'Plywood',
    });
    expect('grainLock' in rows[0]).toBe(false);
  });
});

describe('parseBomTable header aliasing', () => {
  it('maps case-insensitive aliases in any order with unknown columns ignored', () => {
    const csv =
      'Color,LEN,W,Quantity,Part,Stock\nblue,600mm,300mm,2,Shelf,Pine';
    const { rows, errors } = parseBomTable(csv, mmOpts);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      name: 'Shelf',
      lengthUm: mmToUm(600),
      widthUm: mmToUm(300),
      qty: 2,
      material: 'Pine',
    });
  });

  it('uses last-wins for duplicate headers', () => {
    const csv =
      'name,qty,length,width,material,material\nA,1,10mm,10mm,Oak,Maple';
    const { rows } = parseBomTable(csv, mmOpts);
    expect(rows[0].material).toBe('Maple');
  });

  it('still maps a column whose header has a leading BOM', () => {
    const csv = '﻿name,qty,length,width,material\nA,1,10mm,10mm,Oak';
    const { rows, errors } = parseBomTable(csv, mmOpts);
    expect(errors).toEqual([]);
    expect(rows[0].name).toBe('A');
  });
});

describe('parseBomTable CSV tokenization', () => {
  it('handles quoted commas, embedded newlines, escaped quotes, CRLF, trailing blanks', () => {
    const csv =
      'name,qty,length,width,material\r\n' +
      '"Shelf, top",1,600mm,300mm,Plywood\r\n' +
      '"Line\none",1,10mm,10mm,Oak\r\n' +
      '"He said ""hi""",1,10mm,10mm,Oak\r\n' +
      '\r\n';
    const { rows, errors } = parseBomTable(csv, mmOpts);
    expect(errors).toEqual([]);
    expect(rows.map((r) => r.name)).toEqual([
      'Shelf, top',
      'Line\none',
      'He said "hi"',
    ]);
  });
});

describe('parseBomTable header validation', () => {
  it('reports a row:0 error and no rows when a required column is missing', () => {
    const csv = 'name,length,width,material\nA,10mm,10mm,Oak';
    const { rows, errors } = parseBomTable(csv, mmOpts);
    expect(rows).toEqual([]);
    expect(errors).toHaveLength(1);
    expect(errors[0].row).toBe(0);
    expect(errors[0].message).toMatch(/qty/i);
  });

  it('returns empty rows and empty errors for a header-only input', () => {
    const csv = 'name,qty,length,width,material';
    expect(parseBomTable(csv, mmOpts)).toEqual({ rows: [], errors: [] });
  });
});

describe('parseBomTable per-cell units', () => {
  it('respects per-cell unit signals and the mm default', () => {
    const csv =
      'name,qty,length,width,material\nA,1,750mm,30in,Oak\nB,1,750,300,Pine';
    const { rows, errors } = parseBomTable(csv, mmOpts);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({
      lengthUm: mmToUm(750),
      widthUm: mmToUm(30 * 25.4),
    });
    // bare numbers use the mm default
    expect(rows[1]).toMatchObject({
      lengthUm: mmToUm(750),
      widthUm: mmToUm(300),
    });
  });

  it('respects the inch default for bare numbers', () => {
    const csv = 'name,qty,length,width,material\nA,1,2,3,Oak';
    const { rows } = parseBomTable(csv, inOpts);
    expect(rows[0]).toMatchObject({
      lengthUm: mmToUm(2 * 25.4),
      widthUm: mmToUm(3 * 25.4),
    });
  });
});

describe('parseBomTable thickness handling', () => {
  it('uses the cell when the thickness column has a value', () => {
    const csv =
      'name,qty,length,width,material,thickness\nA,1,10mm,10mm,Oak,25mm';
    const { rows } = parseBomTable(csv, mmOpts);
    expect(rows[0].thicknessUm).toBe(mmToUm(25));
  });

  it('falls back to the default when the thickness cell is blank', () => {
    const csv = 'name,qty,length,width,material,thickness\nA,1,10mm,10mm,Oak,';
    const { rows } = parseBomTable(csv, mmOpts);
    expect(rows[0].thicknessUm).toBe(mmOpts.defaultThicknessUm);
  });

  it('falls back to the default when the thickness column is absent', () => {
    const csv = 'name,qty,length,width,material\nA,1,10mm,10mm,Oak';
    const { rows } = parseBomTable(csv, mmOpts);
    expect(rows[0].thicknessUm).toBe(mmOpts.defaultThicknessUm);
  });
});

describe('parseGrainCell', () => {
  it('returns undefined for blank input', () => {
    expect(parseGrainCell('')).toBeUndefined();
    expect(parseGrainCell('  ')).toBeUndefined();
  });

  it('maps length aliases case-insensitively', () => {
    expect(parseGrainCell('l')).toBe('length');
    expect(parseGrainCell('len')).toBe('length');
    expect(parseGrainCell('length')).toBe('length');
    expect(parseGrainCell('LENGTH')).toBe('length');
    expect(parseGrainCell('  Length  ')).toBe('length');
  });

  it('maps width aliases case-insensitively', () => {
    expect(parseGrainCell('w')).toBe('width');
    expect(parseGrainCell('wid')).toBe('width');
    expect(parseGrainCell('width')).toBe('width');
    expect(parseGrainCell('WIDTH')).toBe('width');
  });

  it('returns null for unrecognized non-blank input', () => {
    expect(parseGrainCell('along grain')).toBeNull();
    expect(parseGrainCell('yes')).toBeNull();
    expect(parseGrainCell('horizontal')).toBeNull();
  });
});

describe('parseBomTable grain column', () => {
  it('parses grain=length and grain=width into grainLock on the row', () => {
    const csv =
      'name,qty,length,width,material,grain\nDoor Rail,2,700mm,70mm,Oak,length\nCross Rail,2,400mm,70mm,Oak,w';
    const { rows, errors } = parseBomTable(csv, mmOpts);
    expect(errors).toEqual([]);
    expect(rows[0].grainLock).toBe('length');
    expect(rows[1].grainLock).toBe('width');
  });

  it('leaves grainLock absent when the grain column is absent', () => {
    const csv = 'name,qty,length,width,material\nShelf,1,600mm,300mm,Plywood';
    const { rows } = parseBomTable(csv, mmOpts);
    expect('grainLock' in rows[0]).toBe(false);
  });

  it('leaves grainLock absent when the grain cell is blank', () => {
    const csv =
      'name,qty,length,width,material,grain\nShelf,1,600mm,300mm,Plywood,';
    const { rows } = parseBomTable(csv, mmOpts);
    expect('grainLock' in rows[0]).toBe(false);
  });

  it('fails the row on an unrecognized grain value', () => {
    const csv =
      'name,qty,length,width,material,grain\nPanel,1,600mm,300mm,Oak,diagonal';
    const { rows, errors } = parseBomTable(csv, mmOpts);
    expect(rows).toHaveLength(0);
    expect(errors[0].message).toMatch(/grain/i);
  });

  it('recognises grain column aliases', () => {
    const csv =
      'Part Name,Qty,Length,Width,Material,Grain Direction\nPanel,1,600mm,300mm,Oak,length';
    const { rows, errors } = parseBomTable(csv, mmOpts);
    expect(errors).toEqual([]);
    expect(rows[0].grainLock).toBe('length');
  });
});

describe('parseBomTable per-row validation (partial import)', () => {
  it('skips bad rows with sensible messages while keeping valid ones', () => {
    const csv = [
      'name,qty,length,width,material',
      'Good,1,600mm,300mm,Plywood', // row 1 valid
      'NoWidth,1,600mm,,Oak', // row 2 missing width
      'ZeroQty,0,10mm,10mm,Oak', // row 3 qty 0
      'FracQty,2.5,10mm,10mm,Oak', // row 4 qty decimal
      'TextQty,abc,10mm,10mm,Oak', // row 5 qty non-number
      ',1,10mm,10mm,Oak', // row 6 empty name
      'NoMat,1,10mm,10mm,', // row 7 empty material
      'BadLen,1,xyz,10mm,Oak', // row 8 unparseable length
      'Good2,3,500mm,200mm,Pine', // row 9 valid, qty stays 3
    ].join('\n');
    const { rows, errors } = parseBomTable(csv, mmOpts);

    expect(rows.map((r) => r.name)).toEqual(['Good', 'Good2']);
    // qty is NOT pre-expanded
    expect(rows.find((r) => r.name === 'Good2')!.qty).toBe(3);

    const byRow = Object.fromEntries(errors.map((e) => [e.row, e.message]));
    expect(byRow[2]).toMatch(/width/i);
    expect(byRow[3]).toMatch(/qty/i);
    expect(byRow[4]).toMatch(/qty/i);
    expect(byRow[5]).toMatch(/qty/i);
    expect(byRow[6]).toMatch(/name/i);
    expect(byRow[7]).toMatch(/material/i);
    expect(byRow[8]).toMatch(/length/i);
    // each bad row carries its raw line for display
    expect(errors.find((e) => e.row === 2)!.raw).toContain('NoWidth');
  });
});
