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
  grain: ['grain', 'grain direction', 'grain lock', 'grain dir'],
} as const;

const REQUIRED = ['name', 'qty', 'length', 'width', 'material'];

/**
 * Tab-separated starter template for the BOM import. Tabs (not commas) so a
 * paste into Google Sheets / Excel lands each field in its own column; the
 * importer auto-detects the delimiter either way. Header row + one example
 * row. Thickness and Grain are optional (omit either column or leave blank).
 */
export const BOM_CSV_TEMPLATE = [
  [
    'Part Name',
    'Quantity',
    'Length',
    'Width',
    'Thickness',
    'Material',
    'Grain',
  ].join('\t'),
  ['Side Panel', '2', '600', '300', '18', 'Plywood', ''].join('\t'),
].join('\n');

/**
 * Parse a grain cell. Returns undefined for blank (free rotation), the lock
 * direction for recognized values, or null for unrecognized non-blank input
 * (caller should fail the row).
 */
export function parseGrainCell(
  cell: string,
): 'length' | 'width' | null | undefined {
  const s = cell.trim().toLowerCase();
  if (s === '') return undefined;
  if (s === 'l' || s === 'len' || s === 'length') return 'length';
  if (s === 'w' || s === 'wid' || s === 'width') return 'width';
  return null;
}

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
  const hasGrain = table.columns.grain !== undefined;

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

    let grainLock: 'length' | 'width' | undefined;
    if (hasGrain) {
      const g = parseGrainCell(cell('grain'));
      if (g === null) {
        fail("invalid grain value — use 'length', 'width', or leave blank");
        continue;
      }
      grainLock = g;
    }

    rows.push({
      name,
      widthUm,
      lengthUm,
      thicknessUm,
      qty,
      material,
      ...(grainLock !== undefined ? { grainLock } : {}),
    });
  }

  return { rows, errors };
}
