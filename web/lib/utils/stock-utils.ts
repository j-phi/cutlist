import { isNearlyEqual } from './floating-point-utils';
import {
  type AnyStock,
  type BoardLayoutStock,
  type LinearStock,
  type PartToCut,
  type Stock,
  isLinearStock,
} from '../types';

/**
 * Sheet-stock validity: material + thickness match.
 * Used by sheet-stock paths only; linear paths go through `isValidLinearStockForPart`.
 */
export function isValidStock(
  test: Stock | BoardLayoutStock,
  target: PartToCut | Stock,
  epsilon: number,
) {
  return (
    isNearlyEqual(
      'size' in target ? target.size.thickness : target.thickness,
      'thicknessM' in test ? test.thicknessM : test.thickness,
      epsilon,
    ) && test.material === target.material
  );
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

/** Dispatching wrapper used by the routing pipeline. */
export function isValidAnyStock(
  test: AnyStock,
  target: PartToCut | AnyStock,
  epsilon: number,
): boolean {
  const targetIsPart = 'size' in target;
  if (isLinearStock(test)) {
    if (targetIsPart) return isValidLinearStockForPart(test, target, epsilon);
    return (
      isLinearStock(target) && isCompatibleLinearStock(test, target, epsilon)
    );
  }
  if (targetIsPart) return isValidStock(test, target, epsilon);
  return !isLinearStock(target) && isValidStock(test, target, epsilon);
}
