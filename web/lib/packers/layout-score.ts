import type { PotentialBoardLayout } from '../types';

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

/**
 * Per-rip-edge weight relative to per-crosscut-edge weight in
 * `cutComplexity`. Calibrated against the benchmark fixtures so tidy
 * passes win the `auto` tournament when board count and waste tie.
 */
const RIP_WEIGHT = 10;

export function compareLayoutScores(
  a: LayoutScore,
  b: LayoutScore,
  precision: number,
): number {
  if (Math.abs(a.boardsUsed - b.boardsUsed) > precision)
    return a.boardsUsed - b.boardsUsed;
  if (Math.abs(a.wasteArea - b.wasteArea) > precision)
    return a.wasteArea - b.wasteArea;
  if (Math.abs(a.wasteConcentration - b.wasteConcentration) > precision)
    return a.wasteConcentration - b.wasteConcentration;
  if (Math.abs(a.cutComplexity - b.cutComplexity) > precision)
    return a.cutComplexity - b.cutComplexity;
  return 0;
}

export function scoreLayouts(
  layouts: PotentialBoardLayout[],
  precision: number,
): LayoutScore {
  const boardsUsed = layouts.length;
  let wasteArea = 0;
  let wasteConcentration = 0;
  let cutComplexity = 0;

  for (const layout of layouts) {
    const boardArea = layout.stock.width * layout.stock.length;
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
    // Rip axis = whichever dimension has fewer unique edges (a few rip
    // cuts partition the board into strips of many crosscuts). Ties go
    // to x — table-saw rip-first convention.
    const xCount = countUniqueLevels(xLevels, precision);
    const yCount = countUniqueLevels(yLevels, precision);
    const ripCount = Math.min(xCount, yCount);
    const crossCount = Math.max(xCount, yCount);
    cutComplexity += ripCount * RIP_WEIGHT + crossCount;
  }

  return {
    boardsUsed,
    wasteArea,
    wasteConcentration,
    cutComplexity,
  };
}

function countUniqueLevels(values: number[], precision: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  let count = 1;
  let last = sorted[0];
  for (let i = 1; i < sorted.length; i++) {
    const value = sorted[i];
    if (Math.abs(value - last) > precision) {
      count++;
      last = value;
    }
  }
  return count;
}
