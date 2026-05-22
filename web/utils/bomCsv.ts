import {
  parseDimension,
  mmToUm,
  toCanonicalMm,
  type Micrometres,
} from 'cutlist';
import type { ManualPartInput } from '~/composables/useProjects';
import { parseDelimitedTable, type TableRowError } from './delimitedTable';

export interface BomParseOptions {
  /** Project's active distanceUnit; used for bare numbers. */
  defaultUnit: 'mm' | 'in';
  /** Used when the Thickness column is absent or the cell is blank. */
  defaultThicknessUm: Micrometres;
}

/** BOM row errors share the generic table-row error shape. */
export type BomRowError = TableRowError;

export interface BomParseResult {
  /** Valid rows; quantity is NOT pre-expanded (qty stays as the field). */
  rows: ManualPartInput[];
  errors: BomRowError[];
}

/**
 * Parse a single dimension cell. Detects the unit per cell (so a sheet can
 * mix `750mm` and `30in`), then defers to `parseDimension` with the matching
 * unit. Returns null on unparseable input or a non-positive result — the
 * manual-part form requires a strictly positive dimension.
 */
export function parseDimCell(
  cell: string,
  defaultUnit: 'mm' | 'in',
): Micrometres | null {
  const s = cell.trim();
  if (s === '') return null;

  const unit = detectCellUnit(s, defaultUnit);
  const value = parseDimension(s, unit);
  if (value == null) return null;

  const um = mmToUm(toCanonicalMm(value, unit));
  return um > 0 ? um : null;
}

function detectCellUnit(
  trimmed: string,
  defaultUnit: 'mm' | 'in',
): 'mm' | 'in' {
  if (/mm$/i.test(trimmed)) return 'mm';
  // Inch signals: glyphs, an `in`/`ft` suffix (matches `30in`, `6 ft`), a
  // feet apostrophe, or a fraction slash.
  if (/["″]|in\b|ft\b|'|\//i.test(trimmed)) return 'in';
  return defaultUnit;
}

// Header alias sets, all normalized (trim + lowercase).
const ALIASES = {
  name: ['name', 'part', 'part name', 'label'],
  qty: ['qty', 'quantity', 'count'],
  length: ['length', 'len', 'l'],
  width: ['width', 'w'],
  material: ['material', 'mat', 'stock'],
  thickness: ['thickness', 'thick', 't'],
} as const;

const REQUIRED = ['name', 'qty', 'length', 'width', 'material'];

function parseQty(cell: string): number | null {
  const s = cell.trim();
  if (s === '') return null;
  const n = Number(s);
  if (!Number.isInteger(n) || n < 1) return null;
  return n;
}

export function parseBomTable(
  text: string,
  options: BomParseOptions,
): BomParseResult {
  const table = parseDelimitedTable(text, {
    aliases: ALIASES as unknown as Record<string, string[]>,
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

  const rows: ManualPartInput[] = [];
  const errors: BomRowError[] = [];
  const hasThickness = table.columns.thickness !== undefined;

  for (const { dataRow, raw, cell } of table.dataRows) {
    const fail = (message: string) =>
      errors.push({ row: dataRow, raw, message });

    const name = cell('name').trim();
    if (name === '') {
      fail('missing name');
      continue;
    }

    const qty = parseQty(cell('qty'));
    if (qty === null) {
      fail('qty must be a positive integer');
      continue;
    }

    const lengthUm = parseDimCell(cell('length'), options.defaultUnit);
    if (lengthUm === null) {
      fail('could not parse length');
      continue;
    }

    const widthUm = parseDimCell(cell('width'), options.defaultUnit);
    if (widthUm === null) {
      fail('missing or invalid width');
      continue;
    }

    let thicknessUm: Micrometres = options.defaultThicknessUm;
    if (hasThickness) {
      const rawThickness = cell('thickness').trim();
      if (rawThickness !== '') {
        const parsed = parseDimCell(rawThickness, options.defaultUnit);
        if (parsed === null) {
          fail('could not parse thickness');
          continue;
        }
        thicknessUm = parsed;
      }
    }

    const material = cell('material').trim();
    if (material === '') {
      fail('missing material');
      continue;
    }

    rows.push({ name, widthUm, lengthUm, thicknessUm, qty, material });
  }

  return { rows, errors };
}
