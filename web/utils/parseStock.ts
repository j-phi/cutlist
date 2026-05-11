import { StockMatrix } from 'cutlist';
import { z } from 'zod';
import YAML from 'js-yaml';

/**
 * Parse the user's stock YAML. Unknown keys are silently dropped (retired
 * fields like `algorithm:` disappear). A malformed row drops cleanly so
 * the rest of the list still hydrates — matches the v3 migration shape.
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
