/**
 * v8: stock gains a per-item `name` (the label shown on the Layout page),
 * and `material` becomes a category that the BOM matches against. Pre-v8
 * stock used `material` as both the name and the matching key, so we move
 * the old `material` string into `name` and reset `material` to
 * 'Uncategorized'. Existing color→material mappings then no longer resolve
 * until the user re-categorizes stock — an accepted one-time reset.
 *
 * Defensive — never throws. Leaves a non-array `stocks` untouched (the read
 * path's `applyProjectDefaults` fills it); skips malformed entries and ones
 * already carrying a `name`.
 */
import type { IdbRecord, RecordMigration } from './types';

export function migrateProjectStockNames(record: IdbRecord): IdbRecord {
  const stocks = record.stocks;
  if (!Array.isArray(stocks)) return record;
  return {
    ...record,
    stocks: stocks.map((entry) => {
      if (!entry || typeof entry !== 'object') return entry;
      const s = entry as IdbRecord;
      if (typeof s.name === 'string') return s;
      const material = typeof s.material === 'string' ? s.material : '';
      return { ...s, name: material, material: 'Uncategorized' };
    }),
  };
}

export const v8Migration: RecordMigration = {
  version: 8,
  store: 'projects',
  migrate: migrateProjectStockNames,
};
