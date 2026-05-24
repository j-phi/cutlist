import {
  type OptimizationObjective,
  type PotentialBoardLayout,
  isLinearStock,
} from '../types';

export interface LayoutScore {
  boardsUsed: number;
  wasteArea: number;
  /**
   * Sum of squared per-board waste areas. Penalises lopsided distributions
   * (one barely-used board) over uniform ones at equal total waste.
   */
  wasteConcentration: number;
  /**
   * Stage-aware cut complexity: for each board, the axis with fewer unique
   * edges (the rip axis) is weighted `RIP_WEIGHT`× more than the cross
   * axis. Tidy column-aligned layouts score lower than compact zigzag
   * layouts at equal fill.
   */
  cutComplexity: number;
  /**
   * Total material cost of the boards the user must *buy* for this candidate:
   * Σ over `role === 'general'` boards of that board's stock `cost`. Offcuts
   * contribute 0 — they're already owned. `undefined` when NO general board
   * in the candidate carries a finite cost (i.e. the candidate is unpriced);
   * never `0` for a priced-but-free arrangement vs. an unknown one (FR-COPT-1/3).
   */
  materialCost: number | undefined;
}

const RIP_WEIGHT = 10;

/**
 * Lexicographic comparison: board count, then waste area, then waste
 * concentration, then cut complexity. `wasteConcentration` is `µm⁴` and
 * can exceed `Number.MAX_SAFE_INTEGER` past a few large boards — it's
 * compared as a float, which is fine because both sides come from the
 * same deterministic arithmetic on the same inputs.
 */
export function compareLayoutScores(a: LayoutScore, b: LayoutScore): number {
  if (a.boardsUsed !== b.boardsUsed) return a.boardsUsed - b.boardsUsed;
  if (a.wasteArea !== b.wasteArea) return a.wasteArea - b.wasteArea;
  if (a.wasteConcentration !== b.wasteConcentration)
    return a.wasteConcentration - b.wasteConcentration;
  if (a.cutComplexity !== b.cutComplexity)
    return a.cutComplexity - b.cutComplexity;
  return 0;
}

/**
 * Objective-aware comparator (FR-COPT-1). When `objective === 'cost'` AND both
 * candidates carry a defined `materialCost`, cost is the primary key; ties fall
 * through to the lexicographic chain. `boards` and `waste` (and any group where
 * cost isn't usable on both sides) defer entirely to {@link compareLayoutScores}.
 *
 * The "both defined" guard is the per-group fallback: the caller only passes
 * `objective === 'cost'` when every usable stock size in the group is priced,
 * but we additionally never let an `undefined` materialCost masquerade as a
 * comparable value here — a missing cost is never treated as 0.
 */
export function compareLayoutScoresForObjective(
  a: LayoutScore,
  b: LayoutScore,
  objective: OptimizationObjective,
): number {
  if (
    objective === 'cost' &&
    a.materialCost !== undefined &&
    b.materialCost !== undefined &&
    a.materialCost !== b.materialCost
  ) {
    return a.materialCost - b.materialCost;
  }
  return compareLayoutScores(a, b);
}

export function scoreLayouts(layouts: PotentialBoardLayout[]): LayoutScore {
  const boardsUsed = layouts.length;
  let wasteArea = 0;
  let wasteConcentration = 0;
  let cutComplexity = 0;
  // Accumulate the cost of *bought* (general) boards. Stays `undefined`
  // until the first finite-cost general board lands, so a candidate with no
  // priced general board reports `undefined` rather than a misleading `0`.
  let materialCost: number | undefined;

  for (const layout of layouts) {
    if (layout.stock.role === 'general') {
      const cost = layout.stock.cost;
      if (cost !== undefined && Number.isFinite(cost)) {
        materialCost = (materialCost ?? 0) + cost;
      }
    }

    const boardArea = isLinearStock(layout.stock)
      ? layout.stock.crossSectionWidth * layout.stock.length
      : layout.stock.width * layout.stock.length;
    const usedArea = layout.placements.reduce(
      (total, placement) => total + placement.width * placement.height,
      0,
    );
    const boardWaste = Math.max(0, boardArea - usedArea);
    wasteArea += boardWaste;
    wasteConcentration += boardWaste * boardWaste;

    const xLevels: number[] = [];
    const yLevels: number[] = [];
    for (const placement of layout.placements) {
      xLevels.push(placement.left, placement.right);
      yLevels.push(placement.bottom, placement.top);
    }
    const xCount = countUniqueLevels(xLevels);
    const yCount = countUniqueLevels(yLevels);
    const ripCount = Math.min(xCount, yCount);
    const crossCount = Math.max(xCount, yCount);
    cutComplexity += ripCount * RIP_WEIGHT + crossCount;
  }

  return {
    boardsUsed,
    wasteArea,
    wasteConcentration,
    cutComplexity,
    materialCost,
  };
}

function countUniqueLevels(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let count = 1;
  let last = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const value = sorted[i];
    if (value !== last) {
      count++;
      last = value;
    }
  }
  return count;
}
