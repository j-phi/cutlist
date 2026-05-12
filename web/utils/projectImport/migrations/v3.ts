/**
 * v3 schema migration: canonical millimetre storage + `kind` discriminator.
 *
 * Pre-v3 stored distances in the project's `distanceUnit` and per-row
 * `unit:` fields on stock; v3 stores mm everywhere and treats
 * `distanceUnit` as display-only. v3 also introduces the `kind:
 * 'sheet' | 'linear'` discriminator on `StockMatrix` — every pre-v3 row is
 * implicitly sheet, so the migration stamps that field as it normalises.
 *
 * Defensive contract: runs inside a Dexie transaction — a throw rolls
 * back the upgrade and locks the user out. Drop unparseable rows /
 * sizes / thicknesses; never throw. Output is always Zod-valid.
 */

import {
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  parseDimension,
  StockMatrix,
  toCanonicalMm,
} from 'cutlist';
import YAML from 'js-yaml';
import { z } from 'zod';
import type { IdbRecord, RecordMigration } from './types';

/**
 * Apply the v3 transform: convert bladeWidth/margin to mm, normalise stock
 * YAML, seed `precision` if missing. Idempotent on already-v3 data.
 */
export function migrateProjectToMmStorage(record: IdbRecord): IdbRecord {
  const oldUnit: 'mm' | 'in' = record.distanceUnit === 'in' ? 'in' : 'mm';
  const next: IdbRecord = { ...record };
  if (typeof next.bladeWidth === 'number') {
    next.bladeWidth = toCanonicalMm(next.bladeWidth, oldUnit);
  }
  if (typeof next.margin === 'number') {
    next.margin = toCanonicalMm(next.margin, oldUnit);
  }
  if (typeof next.stock === 'string' && next.stock.trim() !== '') {
    next.stock = migrateStockYamlToMm(next.stock, oldUnit);
  }
  if (next.precision == null) {
    next.precision =
      oldUnit === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION;
  }
  return next;
}

export const v3Migration: RecordMigration = {
  version: 3,
  store: 'projects',
  migrate: migrateProjectToMmStorage,
};

// ─── Stock-YAML transform ───────────────────────────────────────────────────

interface OldStockSize {
  width?: number | string;
  length?: number | string;
  thickness?: Array<number | string>;
}
interface OldStockMatrix {
  material?: string;
  unit?: 'mm' | 'in';
  sizes?: OldStockSize[];
  color?: string;
  thicknessAlgorithms?: Record<string, string>;
}

/**
 * Convert each row's numerics from its declared `unit:` (or the project's
 * `distanceUnit` as fallback) to mm, drop the `unit:` field, and validate
 * the result. Rows that fail validation are silently dropped — the
 * migration must not throw.
 */
function migrateStockYamlToMm(yaml: string, projectUnit: 'mm' | 'in'): string {
  let parsed: unknown;
  try {
    parsed = YAML.load(yaml);
  } catch {
    // Malformed YAML — surface an empty matrix so the user can re-add stock
    // from the UI rather than being locked out of the project.
    return YAML.dump([], { indent: 2, flowLevel: 2 });
  }
  if (!Array.isArray(parsed)) return YAML.dump([], { indent: 2, flowLevel: 2 });

  const Schema = z.array(StockMatrix);
  const cleaned: unknown[] = [];
  for (const raw of parsed as OldStockMatrix[]) {
    const next = convertRow(raw, projectUnit);
    if (next == null) continue;
    if (Schema.safeParse([next]).success) cleaned.push(next);
  }
  return YAML.dump(cleaned, { indent: 2, flowLevel: 2 });
}

function convertRow(
  row: (OldStockMatrix & { kind?: string }) | null | undefined,
  projectUnit: 'mm' | 'in',
): IdbRecord | null {
  if (row == null || typeof row !== 'object') return null;
  if (typeof row.material !== 'string' || row.material.trim() === '') {
    return null;
  }

  // A row already declaring `kind` is v3-shaped — pass through. Pre-v3
  // rows have no `kind` and follow the sheet-conversion path below.
  if (row.kind != null) {
    const next: IdbRecord = { ...row };
    delete next.unit;
    return next;
  }

  const rowUnit: 'mm' | 'in' = row.unit ?? projectUnit;

  const sizes: IdbRecord[] = [];
  for (const s of row.sizes ?? []) {
    if (s == null || typeof s !== 'object') continue;
    const width = dimToMm(s.width, rowUnit);
    const length = dimToMm(s.length, rowUnit);
    if (width == null || length == null) continue;
    const thickness: number[] = [];
    for (const t of s.thickness ?? []) {
      const v = dimToMm(t, rowUnit);
      if (v != null) thickness.push(v);
    }
    sizes.push({ width, length, thickness });
  }

  // Stamp the `kind: 'sheet'` discriminator that every pre-v3 row implicitly had.
  const next: IdbRecord = { kind: 'sheet', ...row, sizes };
  delete next.unit;
  return next;
}

/**
 * Parse one stock dimension into mm. Strings with a trailing unit
 * (`"18mm"`, `"3/4in"`) self-tag; otherwise the row's unit applies.
 * Returns null on bad input — never NaN.
 */
function dimToMm(
  dim: number | string | null | undefined,
  rowUnit: 'mm' | 'in',
): number | null {
  if (typeof dim === 'number') {
    return Number.isFinite(dim) ? toCanonicalMm(dim, rowUnit) : null;
  }
  if (typeof dim !== 'string') return null;
  const s = dim.trim();
  if (s === '') return null;
  // A trailing-suffix string self-tags its unit. Otherwise fall back to
  // the row's unit.
  const unit: 'mm' | 'in' = stringUnit(s) ?? rowUnit;
  const v = parseDimension(s, unit);
  return v == null ? null : toCanonicalMm(v, unit);
}

function stringUnit(s: string): 'mm' | 'in' | null {
  if (/mm$/i.test(s)) return 'mm';
  if (/(?:in|"|″|ft)$/i.test(s) || /'/.test(s)) return 'in';
  return null;
}
