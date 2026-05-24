/**
 * v12: sheet stock sizes move per-board cost from the size-level `cost` field
 * to a per-thickness `thicknessCosts` record (keyed by thickness value
 * stringified). Linear stock moves the size-level `cost` to a per-length
 * `lengthCosts` record (keyed by length value stringified).
 *
 * Old shape (v9–v11):
 *   SheetStockMatrix.sizes[].cost?: number          — one cost, all thicknesses
 *   LinearStockSize.cost?: number                   — one cost, all lengths
 *
 * New shape (v12):
 *   SheetStockMatrix.sizes[].thicknessCosts?: Record<string, number>
 *   LinearStockSize.lengthCosts?: Record<string, number>
 *
 * Migration: distribute the old scalar cost to every thickness / length entry,
 * then drop the old field. Records without a cost pass through unchanged.
 *
 * Defensive — never throws. Non-object elements and missing fields are
 * preserved as-is.
 */
import type { IdbRecord, RecordMigration } from './types';

export function migrateProjectStockPerItemCost(record: IdbRecord): IdbRecord {
  const stocks = record.stocks;
  if (!Array.isArray(stocks)) return record;

  const migratedStocks = stocks.map((item: unknown) => {
    if (!item || typeof item !== 'object') return item;
    const s = item as Record<string, unknown>;

    if (s.kind === 'sheet' && Array.isArray(s.sizes)) {
      const sizes = s.sizes.map((size: unknown) => {
        if (!size || typeof size !== 'object') return size;
        const sz = size as Record<string, unknown>;
        const oldCost = sz.cost;
        if (typeof oldCost !== 'number') return sz;
        const thicknesses = Array.isArray(sz.thickness) ? sz.thickness : [];
        const thicknessCosts: Record<string, number> = {};
        for (const t of thicknesses) {
          if (typeof t === 'number') thicknessCosts[String(t)] = oldCost;
        }
        const { cost: _drop, ...rest } = sz;
        return Object.keys(thicknessCosts).length > 0
          ? { ...rest, thicknessCosts }
          : rest;
      });
      return { ...s, sizes };
    }

    if (s.kind === 'linear') {
      const sz = s.size as Record<string, unknown> | undefined;
      if (!sz || typeof sz !== 'object') return s;
      const oldCost = sz.cost;
      if (typeof oldCost !== 'number') return s;
      const lengths = Array.isArray(sz.lengths) ? sz.lengths : [];
      const lengthCosts: Record<string, number> = {};
      for (const l of lengths) {
        if (typeof l === 'number') lengthCosts[String(l)] = oldCost;
      }
      const { cost: _drop, ...sizeRest } = sz;
      const newSize =
        Object.keys(lengthCosts).length > 0
          ? { ...sizeRest, lengthCosts }
          : sizeRest;
      return { ...s, size: newSize };
    }

    return s;
  });

  return { ...record, stocks: migratedStocks };
}

export const v12Migration: RecordMigration = {
  version: 12,
  store: 'projects',
  migrate: migrateProjectStockPerItemCost,
};
