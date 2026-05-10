/**
 * v4 schema migration: explicit `kind` discriminator on stock-YAML rows.
 *
 * v4 introduces linear timber stock as a sibling of sheet stock; the schema
 * is now a discriminated union by `kind: 'sheet' | 'linear'`. Every row
 * written before v4 is implicitly sheet, so this migration stamps
 * `kind: 'sheet'` onto any row that lacks one. Rows that already declare a
 * kind (e.g. a forward-imported v4 export) are passed through untouched.
 *
 * Defensive contract: same as v3 — runs inside a Dexie transaction, must
 * never throw, drops rows that fail validation, returns valid v4 YAML.
 */

import { StockMatrix } from 'cutlist';
import YAML from 'js-yaml';
import { z } from 'zod';
import type { IdbRecord, RecordMigration } from './types';

export function migrateStockToV4(record: IdbRecord): IdbRecord {
  if (typeof record.stock !== 'string' || record.stock.trim() === '') {
    return record;
  }
  const next: IdbRecord = { ...record };
  next.stock = rewriteStockYaml(record.stock);
  return next;
}

export const v4Migration: RecordMigration = {
  version: 4,
  store: 'projects',
  migrate: migrateStockToV4,
};

function rewriteStockYaml(yaml: string): string {
  let parsed: unknown;
  try {
    parsed = YAML.load(yaml);
  } catch {
    return YAML.dump([], { indent: 2, flowLevel: 2 });
  }
  if (!Array.isArray(parsed)) return YAML.dump([], { indent: 2, flowLevel: 2 });

  const Schema = z.array(StockMatrix);
  const cleaned: unknown[] = [];
  for (const raw of parsed) {
    if (raw == null || typeof raw !== 'object') continue;
    const next: Record<string, unknown> = {
      ...(raw as Record<string, unknown>),
    };
    if (next.kind == null) next.kind = 'sheet';
    if (Schema.safeParse([next]).success) cleaned.push(next);
  }
  return YAML.dump(cleaned, { indent: 2, flowLevel: 2 });
}
