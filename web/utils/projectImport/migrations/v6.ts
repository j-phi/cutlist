/**
 * v6: convert project stock from a YAML string to a structured
 * `StockMatrix[]` array.
 *
 * Defensive contract: runs inside a Dexie transaction — a throw rolls back
 * the upgrade and locks the user out. Malformed YAML resolves to an empty
 * array.
 */

import { parseStock } from '~/utils/parseStock';
import type { IdbRecord, RecordMigration } from './types';

function safeParseStock(raw: unknown): unknown[] {
  if (typeof raw !== 'string' || raw.trim() === '') return [];
  try {
    return parseStock(raw);
  } catch {
    return [];
  }
}

export function migrateProjectStockToArray(record: IdbRecord): IdbRecord {
  const next: IdbRecord = { ...record, stocks: safeParseStock(record.stock) };
  delete next.stock;
  return next;
}

export const v6Migration: RecordMigration = {
  version: 6,
  store: 'projects',
  migrate: migrateProjectStockToArray,
};
