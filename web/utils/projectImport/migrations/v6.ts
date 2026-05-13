/**
 * v6: project stock moves from `stock: string` (YAML) to
 * `stocks: StockMatrix[]`.
 */

import { StockMatrix } from 'cutlist';
import YAML from 'js-yaml';
import type { IdbRecord, RecordMigration } from './types';

function parseLegacyStockYaml(raw: unknown): StockMatrix[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  let parsed: unknown;
  try {
    parsed = YAML.load(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];
  const out: StockMatrix[] = [];
  for (const row of parsed) {
    const res = StockMatrix.safeParse(row);
    if (res.success) out.push(res.data);
  }
  return out;
}

export function migrateProjectStockToArray(record: IdbRecord): IdbRecord {
  const next: IdbRecord = {
    ...record,
    stocks: parseLegacyStockYaml(record.stock),
  };
  delete next.stock;
  return next;
}

export const v6Migration: RecordMigration = {
  version: 6,
  store: 'projects',
  migrate: migrateProjectStockToArray,
};
