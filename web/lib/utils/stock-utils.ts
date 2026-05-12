import { STOCK_MATCH_TOLERANCE_M } from './units';
import {
  effectiveOversize,
  type LinearStock,
  type PartToCut,
  type SheetStock,
  type Stock,
  isLinearStock,
} from '../types';

const matches = (a: number, b: number) =>
  Math.abs(a - b) <= STOCK_MATCH_TOLERANCE_M;

/** Same cross-section in either orientation. */
function crossSectionsMatch(
  w1: number,
  t1: number,
  w2: number,
  t2: number,
): boolean {
  return (
    (matches(w1, w2) && matches(t1, t2)) || (matches(w1, t2) && matches(t1, w2))
  );
}

export function isValidSheetStock(
  test: SheetStock,
  target: PartToCut | SheetStock,
): boolean {
  if (test.material !== target.material) return false;
  const targetThickness =
    'size' in target ? target.size.thickness : target.thickness;
  return matches(targetThickness, test.thickness);
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
  return part.size.length + o.length <= stock.length + STOCK_MATCH_TOLERANCE_M;
}

export function isCompatibleLinearStock(
  a: LinearStock,
  b: LinearStock,
): boolean {
  if (a.material !== b.material) return false;
  return crossSectionsMatch(
    a.crossSectionWidth,
    a.crossSectionThickness,
    b.crossSectionWidth,
    b.crossSectionThickness,
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
  return !isLinearStock(b) && isValidSheetStock(a, b);
}
