import { describe, expect, it } from 'vitest';
import type { Micrometres, SheetShoppingListGroup } from 'cutlist';
import { mmToUm } from 'cutlist';
import {
  bandingSummaryLine,
  projectTotalLine,
  sheetShoppingGroupLines,
} from '../sheets';

const fmt = (um: Micrometres) => `${um}`;

function group(
  over: Partial<SheetShoppingListGroup> = {},
): SheetShoppingListGroup {
  return {
    material: 'Plywood',
    thicknessUm: 18000 as Micrometres,
    offcutsUsed: 0,
    offcutsAvailable: 0,
    generalSizes: [],
    generalTotal: 0,
    totalBoards: 1,
    yieldRatio: 0.5,
    materialCost: undefined,
    layouts: [],
    ...over,
  };
}

describe('sheetShoppingGroupLines (PDF shopping summary)', () => {
  it('includes a yield line and a cost line when priced', () => {
    const lines = sheetShoppingGroupLines(
      group({ yieldRatio: 0.5, materialCost: 180 }),
      fmt,
    );
    expect(lines).toContain('Yield: 50%');
    expect(lines).toContain('Cost: 180');
  });

  it('omits the cost line (never $0) for an unpriced group but keeps yield', () => {
    const lines = sheetShoppingGroupLines(
      group({ yieldRatio: 1, materialCost: undefined }),
      fmt,
    );
    expect(lines).toContain('Yield: 100%');
    expect(lines.some((l) => l.startsWith('Cost:'))).toBe(false);
  });
});

describe('bandingSummaryLine (F7 FR-BND-2/-3)', () => {
  it('renders length + cost when both present', () => {
    const line = bandingSummaryLine(mmToUm(1800), 18, fmt);
    expect(line).toBe(`Edge banding: ${mmToUm(1800)} · Cost: 18`);
  });

  it('omits cost when unpriced', () => {
    const line = bandingSummaryLine(mmToUm(1800), undefined, fmt);
    expect(line).toBe(`Edge banding: ${mmToUm(1800)}`);
  });

  it('is null when nothing is banded', () => {
    expect(bandingSummaryLine(0 as Micrometres, 5, fmt)).toBeNull();
    expect(bandingSummaryLine(undefined, 5, fmt)).toBeNull();
  });
});

describe('projectTotalLine (FR-BND-3 folds banding into total)', () => {
  it('adds banding cost to the sheet total', () => {
    expect(projectTotalLine(180, 18)).toBe('Total material cost: 198');
  });

  it('shows the banding cost alone when no sheets are priced', () => {
    expect(projectTotalLine(undefined, 18)).toBe('Total material cost: 18');
  });

  it('shows the sheet total alone when banding is unpriced', () => {
    expect(projectTotalLine(180, undefined)).toBe('Total material cost: 180');
  });

  it('is null when nothing is priced', () => {
    expect(projectTotalLine(undefined, undefined)).toBeNull();
  });
});
