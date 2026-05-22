/**
 * Direct tests for the generic delimited-table parser. The parts (bomCsv) and
 * stock (stockCsv) importers exercise it transitively, but those tests can't
 * isolate the format-agnostic mechanics — delimiter detection, the quoted-field
 * tokenizer, blank-row skipping + 1-based data-row numbering, header aliasing,
 * and the missingColumns / headerOnly contract. This file pins that contract.
 */
import { describe, expect, it } from 'vitest';
import { parseDelimitedTable, type TableSpec } from '../delimitedTable';

const SPEC: TableSpec = {
  aliases: {
    name: ['name', 'part'],
    width: ['width', 'w'],
    qty: ['qty', 'quantity'],
  },
  required: ['name', 'width'],
};

/** Collect a data row's cells into a plain object for assertions. */
function rowCells(
  row: { cell: (k: string) => string },
  keys: string[],
): Record<string, string> {
  return Object.fromEntries(keys.map((k) => [k, row.cell(k)]));
}

describe('parseDelimitedTable', () => {
  it('detects a tab delimiter when the header contains a tab, else comma', () => {
    const tsv = parseDelimitedTable('name\twidth\nSide\t300', SPEC);
    expect(tsv.dataRows).toHaveLength(1);
    expect(rowCells(tsv.dataRows[0]!, ['name', 'width'])).toEqual({
      name: 'Side',
      width: '300',
    });

    const csv = parseDelimitedTable('name,width\nSide,300', SPEC);
    expect(rowCells(csv.dataRows[0]!, ['name', 'width'])).toEqual({
      name: 'Side',
      width: '300',
    });
  });

  it('tokenizes quoted fields with embedded delimiters, newlines, and escaped quotes', () => {
    const text =
      'name,width\n"Shelf, top",300\n"a ""b"" c",100\n"multi\nline",50';
    const table = parseDelimitedTable(text, SPEC);
    expect(table.dataRows.map((r) => r.cell('name'))).toEqual([
      'Shelf, top',
      'a "b" c',
      'multi\nline',
    ]);
    // The quoted comma did not split into an extra column.
    expect(table.dataRows[0]!.cell('width')).toBe('300');
  });

  it('handles CRLF line endings', () => {
    const table = parseDelimitedTable('name,width\r\nSide,300\r\n', SPEC);
    expect(table.dataRows).toHaveLength(1);
    expect(table.dataRows[0]!.cell('width')).toBe('300');
  });

  it('skips blank records and numbers data rows 1-based excluding blanks', () => {
    const table = parseDelimitedTable(
      'name,width\nA,1\n\n  \nB,2\n,,\nC,3', // blank, whitespace, and all-empty-delimiter lines dropped
      SPEC,
    );
    expect(table.dataRows.map((r) => r.dataRow)).toEqual([1, 2, 3]);
    expect(table.dataRows.map((r) => r.cell('name'))).toEqual(['A', 'B', 'C']);
  });

  it('strips a leading BOM from the first header cell so it still maps', () => {
    const table = parseDelimitedTable('﻿name,width\nSide,300', SPEC);
    expect(table.missingColumns).toEqual([]);
    expect(table.dataRows[0]!.cell('name')).toBe('Side');
  });

  it('maps header aliases case-insensitively, free order, duplicate last-wins', () => {
    // "W" aliases width at col 0; a later "Width" header overrides it (last-wins).
    const table = parseDelimitedTable('W,NAME,Width\n1,Side,2', SPEC);
    expect(table.columns).toMatchObject({ width: 2, name: 1 });
    expect(table.dataRows[0]!.cell('width')).toBe('2');
  });

  it('reports required columns missing from the header', () => {
    const table = parseDelimitedTable('name,qty\nSide,3', SPEC);
    expect(table.missingColumns).toEqual(['width']);
  });

  it('returns headerOnly with no data rows for a header-only input', () => {
    const table = parseDelimitedTable('name,width', SPEC);
    expect(table.headerOnly).toBe(true);
    expect(table.dataRows).toEqual([]);
    expect(table.missingColumns).toEqual([]);
  });

  it('returns headerOnly for empty / whitespace-only input with no header', () => {
    const table = parseDelimitedTable('   \n\n', SPEC);
    expect(table.headerOnly).toBe(true);
    expect(table.headerRaw).toBe('');
    expect(table.dataRows).toEqual([]);
  });

  it('cell() returns empty string for an absent column or short row', () => {
    const table = parseDelimitedTable('name,width\nSide', SPEC);
    expect(table.dataRows[0]!.cell('qty')).toBe(''); // column not in header
    expect(table.dataRows[0]!.cell('width')).toBe(''); // row shorter than header
    expect(table.dataRows[0]!.cell('name')).toBe('Side');
  });
});
