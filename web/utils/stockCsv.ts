import { umToMm, type Micrometres } from 'cutlist';
import { parseDimCell } from './bomCsv';
import { parseDelimitedTable, type TableRowError } from './delimitedTable';

export interface StockImportRow {
  name: string;
  /** Stored as a plain mm number (NOT µm). */
  widthMm: number;
  lengthMm: number;
  thicknessMm: number;
}

export interface StockParseOptions {
  /** Project's active distanceUnit; used for bare numbers. */
  defaultUnit: 'mm' | 'in';
}

export interface StockParseResult {
  rows: StockImportRow[];
  errors: TableRowError[];
}

// Header alias sets, all normalized (trim + lowercase). The user's column is
// "Height" but it maps to the sheet's LENGTH dimension, so both aliases land
// on the same `length` key.
const ALIASES: Record<string, string[]> = {
  name: ['name', 'material', 'stock', 'label'],
  width: ['width', 'w'],
  length: ['height', 'length', 'len', 'h', 'l'],
  thickness: ['thickness', 'thick', 't'],
};

const REQUIRED = ['name', 'width', 'length', 'thickness'];

export function parseStockTable(
  text: string,
  options: StockParseOptions,
): StockParseResult {
  const table = parseDelimitedTable(text, {
    aliases: ALIASES,
    required: REQUIRED,
  });

  if (table.headerOnly && table.missingColumns.length === 0) {
    return { rows: [], errors: [] };
  }

  if (table.missingColumns.length > 0) {
    return {
      rows: [],
      errors: [
        {
          row: 0,
          raw: table.headerRaw,
          message: `Missing required column(s): ${table.missingColumns.join(
            ', ',
          )}`,
        },
      ],
    };
  }

  const rows: StockImportRow[] = [];
  const errors: TableRowError[] = [];

  for (const { dataRow, raw, cell } of table.dataRows) {
    const fail = (message: string) =>
      errors.push({ row: dataRow, raw, message });

    const name = cell('name').trim();
    if (name === '') {
      fail('missing name');
      continue;
    }

    const dim = (key: string, label: string): Micrometres | undefined => {
      const um = parseDimCell(cell(key), options.defaultUnit);
      if (um === null) {
        fail(`could not parse ${label}`);
        return undefined;
      }
      return um;
    };

    const widthUm = dim('width', 'width');
    if (widthUm === undefined) continue;

    const lengthUm = dim('length', 'length');
    if (lengthUm === undefined) continue;

    const thicknessUm = dim('thickness', 'thickness');
    if (thicknessUm === undefined) continue;

    rows.push({
      name,
      widthMm: umToMm(widthUm),
      lengthMm: umToMm(lengthUm),
      thicknessMm: umToMm(thicknessUm),
    });
  }

  return { rows, errors };
}
