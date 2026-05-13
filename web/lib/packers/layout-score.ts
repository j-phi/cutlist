import { type PotentialBoardLayout, isLinearStock } from '../types';

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

export function scoreLayouts(layouts: PotentialBoardLayout[]): LayoutScore {
  const boardsUsed = layouts.length;
  let wasteArea = 0;
  let wasteConcentration = 0;
  let cutComplexity = 0;

  for (const layout of layouts) {
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

  return { boardsUsed, wasteArea, wasteConcentration, cutComplexity };
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
