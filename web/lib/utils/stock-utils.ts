import { isNearlyEqual } from './floating-point-utils';
import {
  type LinearStock,
  type PartToCut,
  type SheetStock,
  type Stock,
  isLinearStock,
} from '../types';

/**
 * Sheet-stock validity: material + thickness match between two in-flight
 * sheet stocks, or between a sheet stock and a part.
 */
export function isValidSheetStock(
  test: SheetStock,
  target: PartToCut | SheetStock,
  epsilon: number,
) {
  if (test.material !== target.material) return false;
  const targetThickness =
    'size' in target ? target.size.thickness : target.thickness;
  return isNearlyEqual(targetThickness, test.thickness, epsilon);
}

/**
 * Linear stock fits a part when the part's cross-section matches the stick's
 * cross-section in either orientation (W×T or T×W) and the part length fits.
 */
export function isValidLinearStockForPart(
  stock: LinearStock,
  part: PartToCut,
  epsilon: number,
): boolean {
  if (stock.material !== part.material) return false;
  const w = part.size.width;
  const t = part.size.thickness;
  const sw = stock.crossSectionWidth;
  const st = stock.crossSectionThickness;
  const crossSectionMatches =
    (isNearlyEqual(w, sw, epsilon) && isNearlyEqual(t, st, epsilon)) ||
    (isNearlyEqual(w, st, epsilon) && isNearlyEqual(t, sw, epsilon));
  if (!crossSectionMatches) return false;
  return part.size.length <= stock.length + epsilon;
}

/**
 * Linear stock-to-stock comparison (used by `minimizeLayoutStock` for the
 * linear branch): same material + same cross-section in either orientation.
 */
export function isCompatibleLinearStock(
  a: LinearStock,
  b: LinearStock,
  epsilon: number,
): boolean {
  if (a.material !== b.material) return false;
  return (
    (isNearlyEqual(a.crossSectionWidth, b.crossSectionWidth, epsilon) &&
      isNearlyEqual(
        a.crossSectionThickness,
        b.crossSectionThickness,
        epsilon,
      )) ||
    (isNearlyEqual(a.crossSectionWidth, b.crossSectionThickness, epsilon) &&
      isNearlyEqual(a.crossSectionThickness, b.crossSectionWidth, epsilon))
  );
}

/**
 * Whether `part` fits on `stock`. Linear stocks accept the part in either
 * cross-section orientation; sheet stocks just check material+thickness.
 */
export function canPartFitStock(
  stock: Stock,
  part: PartToCut,
  epsilon: number,
): boolean {
  if (isLinearStock(stock))
    return isValidLinearStockForPart(stock, part, epsilon);
  return isValidSheetStock(stock, part, epsilon);
}

/**
 * Whether two stocks are interchangeable for packing — same material and
 * same shape (sheet thickness, or linear cross-section in either
 * orientation). Used by `minimizeLayoutStock` and stock-type grouping to
 * find equivalent boards/sticks of different lengths.
 */
export function areStocksEquivalent(
  a: Stock,
  b: Stock,
  epsilon: number,
): boolean {
  if (isLinearStock(a)) {
    return isLinearStock(b) && isCompatibleLinearStock(a, b, epsilon);
  }
  return !isLinearStock(b) && isValidSheetStock(a, b, epsilon);
}
