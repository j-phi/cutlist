import {
  effectiveOversize,
  type LinearStock,
  type PartToCut,
  type SheetStock,
  type Stock,
  isLinearStock,
} from '../types';
import { STOCK_MATCH_TOLERANCE_UM } from './units';

/** Within OBB drift tolerance — used for part↔stock identity only. */
const matchesStock = (a: number, b: number) =>
  Math.abs(a - b) <= STOCK_MATCH_TOLERANCE_UM;

/** Same cross-section in either orientation, within stock-match tolerance. */
function crossSectionsMatch(
  w1: number,
  t1: number,
  w2: number,
  t2: number,
): boolean {
  return (
    (matchesStock(w1, w2) && matchesStock(t1, t2)) ||
    (matchesStock(w1, t2) && matchesStock(t1, w2))
  );
}

export function isValidSheetStock(
  test: SheetStock,
  target: PartToCut | SheetStock,
): boolean {
  if (test.material !== target.material) return false;
  const targetThickness =
    'size' in target ? target.size.thickness : target.thickness;
  return matchesStock(targetThickness, test.thickness);
}

export function isValidLinearStockForPart(
  stock: LinearStock,
  part: PartToCut,
): boolean {
  if (stock.material !== part.material) return false;
  const o = effectiveOversize(stock);
  if (
    !crossSectionsMatch(
      part.size.width + o.crossSection,
      part.size.thickness + o.crossSection,
      stock.crossSectionWidth,
      stock.crossSectionThickness,
    )
  ) {
    return false;
  }
  return part.size.length + o.length <= stock.length;
}

export function isCompatibleLinearStock(
  a: LinearStock,
  b: LinearStock,
): boolean {
  if (a.material !== b.material) return false;
  // Stock↔stock comparison: both come from YAML mm × 1000, exact integer match.
  return (
    (a.crossSectionWidth === b.crossSectionWidth &&
      a.crossSectionThickness === b.crossSectionThickness) ||
    (a.crossSectionWidth === b.crossSectionThickness &&
      a.crossSectionThickness === b.crossSectionWidth)
  );
}

export function canPartFitStock(stock: Stock, part: PartToCut): boolean {
  return isLinearStock(stock)
    ? isValidLinearStockForPart(stock, part)
    : isValidSheetStock(stock, part);
}

/**
 * Maximum Levenshtein distance for a near-miss material-name suggestion.
 *
 * Tuned to catch realistic typos ("Wlanut" → "Walnut", "Birtch" → "Birch")
 * while staying silent on genuinely different names. The cap is also bounded
 * by the candidate length below so short words ("Oak" → "MDF", distance 3)
 * never produce a noisy suggestion.
 */
const MAX_SUGGESTION_DISTANCE = 2;

/** Standard iterative Levenshtein edit distance (insert/delete/substitute). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const curr = [i];
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        curr[j - 1] + 1, // insertion
        prev[j] + 1, // deletion
        prev[j - 1] + cost, // substitution
      );
    }
    prev = curr;
  }
  return prev[b.length];
}

/**
 * Suggest a close stock name for an unmatched part material.
 *
 * Resolution order (FR-MAT-1):
 *   1. Exact match → returns `null` (the caller already matched; nothing to fix).
 *   2. Trimmed / case-insensitive equality → that stock name (whitespace/case slip).
 *   3. Nearest by Levenshtein distance within `MAX_SUGGESTION_DISTANCE`, also
 *      capped at `floor(min(len)/2)` so short words don't attract noisy
 *      suggestions ("Oak" vs "MDF" stays silent).
 *   4. Otherwise `null`.
 *
 * Pure and deterministic; matching itself stays case-sensitive (FR-MAT-3) —
 * this only proposes a recovery the user must explicitly accept.
 */
export function suggestStockMatch(
  material: string,
  stockNames: readonly string[],
): string | null {
  if (stockNames.includes(material)) return null;

  const target = material.trim().toLowerCase();

  // 2. Whitespace / case-only difference — highest-confidence suggestion.
  for (const name of stockNames) {
    if (name.trim().toLowerCase() === target) return name;
  }

  // 3. Nearest by edit distance, within a length-aware threshold.
  let best: string | null = null;
  let bestDistance = Infinity;
  for (const name of stockNames) {
    const distance = levenshtein(target, name.trim().toLowerCase());
    const cap = Math.min(
      MAX_SUGGESTION_DISTANCE,
      Math.floor(Math.min(target.length, name.trim().length) / 2),
    );
    if (distance <= cap && distance < bestDistance) {
      best = name;
      bestDistance = distance;
    }
  }
  return best;
}

/** Two stocks are interchangeable for packing — same material + shape. */
export function areStocksEquivalent(a: Stock, b: Stock): boolean {
  if (isLinearStock(a)) {
    return isLinearStock(b) && isCompatibleLinearStock(a, b);
  }
  if (isLinearStock(b)) return false;
  return a.material === b.material && a.thickness === b.thickness;
}
