import { StockMatrix } from 'cutlist';
import { z } from 'zod';
import YAML from 'js-yaml';

/**
 * Parse YAML stock into a `StockMatrix[]`. Used only by the v6 migration to
 * lift legacy `IdbProject.stock` strings into the structured `stocks` field.
 * Malformed rows drop cleanly so the rest of the list still hydrates.
 */
export function parseStock(stock: string): StockMatrix[] {
  const raw = YAML.load(stock);
  if (!Array.isArray(raw)) {
    return z.array(StockMatrix).parse(raw);
  }
  const out: StockMatrix[] = [];
  for (const row of raw) {
    const res = StockMatrix.safeParse(row);
    if (res.success) out.push(res.data);
  }
  return out;
}
