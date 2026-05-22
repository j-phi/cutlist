/**
 * v7: stock entries gain a `role` tier (`'offcut' | 'general'`), and offcut
 * sizes carry an optional `quantity`. All pre-v7 stock is infinite, buyable
 * stock, so this stamps `role: 'general'` on every entry that lacks one.
 *
 * Defensive — never throws. Leaves a non-array `stocks` untouched (the read
 * path's `applyProjectDefaults` fills it); skips malformed entries.
 */
import type { IdbRecord, RecordMigration } from './types';

export function migrateProjectStockRoles(record: IdbRecord): IdbRecord {
  const stocks = record.stocks;
  if (!Array.isArray(stocks)) return record;
  return {
    ...record,
    stocks: stocks.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const s = entry as IdbRecord;
      if (s.role === 'offcut' || s.role === 'general') return s;
      return { ...s, role: 'general' };
    }),
  };
}

export const v7Migration: RecordMigration = {
  version: 7,
  store: 'projects',
  migrate: migrateProjectStockRoles,
};
