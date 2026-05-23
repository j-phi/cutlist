/**
 * v9: stock sizes gain an optional, currency-agnostic `cost?: number` for
 * material-cost reporting (F2). The field is purely additive — a v8 stock
 * record without `cost` is already valid at v9 (cost stays absent/undefined),
 * so this transform is a structural no-op. It exists to satisfy the
 * version-registry mirroring contract and to give the read path a documented
 * landing point for any future cost normalisation.
 *
 * Defensive — never throws. Returns the record unchanged.
 */
import type { IdbRecord, RecordMigration } from './types';

export function migrateProjectStockCost(record: IdbRecord): IdbRecord {
  // Cost is optional and additive: no field needs adding, renaming, or
  // dropping. v8 records are already shape-valid at v9.
  return record;
}

export const v9Migration: RecordMigration = {
  version: 9,
  store: 'projects',
  migrate: migrateProjectStockCost,
};
