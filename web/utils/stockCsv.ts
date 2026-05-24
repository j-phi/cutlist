import { umToMm, type Micrometres } from 'cutlist';
import { parseDimCell } from './bomCsv';
import { parseDelimitedTable, type TableRowError } from './delimitedTable';

export interface StockImportRow {
  /** Per-item label (Layout page). Optional — blank when no Name column/cell. */
  name: string;
  /**
   * Material category. Blank when no Material column/cell; the import groups
   * blank-material rows under a single fallback category.
   */
  material: string;
  /** Stored as a plain mm number (NOT µm). */
  widthMm: number;
  lengthMm: number;
  thicknessMm: number;
  /** How many physical sheets of this size the user owns. Positive integer. */
  quantity: number;
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
  name: ['name', 'label', 'stock'],
  material: ['material', 'category', 'type'],
  width: ['width', 'w'],
  length: ['height', 'length', 'len', 'h', 'l'],
  thickness: ['thickness', 'thick', 't'],
  quantity: ['quantity', 'qty', 'count'],
};

// Name and Material are optional: the import groups by material (blank → a
// single fallback category) and uses the material as the panel label when no
// name is given. Only the dimensions are mandatory.
const REQUIRED = ['width', 'length', 'thickness'];

/**
 * Tab-separated starter template for the offcut-stock import. Tabs (not commas)
 * so a paste into Google Sheets / Excel lands each field in its own column; the
 * importer auto-detects the delimiter either way. Header row + one example row.
 * Name, Material, and Quantity are optional (Quantity defaults to 1).
 */
export const STOCK_CSV_TEMPLATE = [
  ['Name', 'Width', 'Height', 'Thickness', 'Material', 'Quantity'].join('\t'),
  ['Offcut A', '1200', '600', '18', 'Plywood', '1'].join('\t'),
].join('\n');

/** Parse an optional quantity cell to a positive integer; default 1. */
function parseQuantity(raw: string): number {
  const trimmed = raw.trim();
  if (trimmed === '') return 1;
  const n = Number(trimmed);
  if (!Number.isInteger(n) || n <= 0) return 1;
  return n;
}

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
    const material = cell('material').trim();

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

    // Quantity is optional. Absent, blank, or invalid (non-integer / ≤ 0)
    // falls back to 1 rather than failing the row — a leftover sheet with an
    // unparseable count is still one sheet.
    const quantity = parseQuantity(cell('quantity'));

    rows.push({
      name,
      material,
      widthMm: umToMm(widthUm),
      lengthMm: umToMm(lengthUm),
      thicknessMm: umToMm(thicknessUm),
      quantity,
    });
  }

  return { rows, errors };
}
