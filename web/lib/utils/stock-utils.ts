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

/** Two stocks are interchangeable for packing — same material + shape. */
export function areStocksEquivalent(a: Stock, b: Stock): boolean {
  if (isLinearStock(a)) {
    return isLinearStock(b) && isCompatibleLinearStock(a, b);
  }
  if (isLinearStock(b)) return false;
  return a.material === b.material && a.thickness === b.thickness;
}
