import { StockMatrix } from 'cutlist';
import { z } from 'zod';
import YAML from 'js-yaml';

/**
 * Parse the user's stock YAML.
 *
 * Unknown keys are silently dropped (default Zod object behaviour). That
 * matters for retired fields — e.g. an `algorithm:` key at the material
 * level (used pre-`thicknessAlgorithms`) parses cleanly and disappears.
 * Acceptable while the project is pre-stable; revisit if/when we need
 * forward-compatibility.
 */
export function parseStock(stock: string): StockMatrix[] {
  return z.array(StockMatrix).parse(YAML.load(stock));
}
