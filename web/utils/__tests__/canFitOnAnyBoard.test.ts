import { describe, expect, it } from 'vitest';
import { canFitOnAnyBoard } from '../canFitOnAnyBoard';
import { mmToUm, mToUm, type Micrometres, type SheetStock } from 'cutlist';

const board = (
  material: string,
  thicknessMm: number,
  widthMm: number,
  lengthMm: number,
): SheetStock => ({
  kind: 'sheet',
  material,
  thickness: mmToUm(thicknessMm),
  width: mmToUm(widthMm),
  length: mmToUm(lengthMm),
  role: 'general',
});

const part = (
  material: string,
  thicknessMm: number,
  widthM: number,
  lengthM: number,
) => ({
  material,
  thicknessUm: mmToUm(thicknessMm),
  widthUm: mToUm(widthM),
  lengthUm: mToUm(lengthM),
});

const PLYWOOD = 'Plywood';
const MDF = 'MDF';

// 4×8 ft sheet (1.22 × 2.44 m); 2×4 ft sheet (0.61 × 1.22 m)
const SHEET_4x8 = board(PLYWOOD, 19, 1220, 2440);
const SHEET_2x4 = board(PLYWOOD, 19, 610, 1220);

const ZERO_UM = 0 as Micrometres;

describe('canFitOnAnyBoard', () => {
  describe('no grain lock (free rotation)', () => {
    it('returns true when part fits in normal orientation', () => {
      const p = part(PLYWOOD, 19, 0.5, 1.0);
      expect(canFitOnAnyBoard(p, undefined, [SHEET_4x8], ZERO_UM)).toBe(true);
    });

    it('returns true when part fits only if rotated', () => {
      const p = part(PLYWOOD, 19, 1.5, 0.5);
      expect(canFitOnAnyBoard(p, undefined, [SHEET_4x8], ZERO_UM)).toBe(true);
    });

    it('returns false when part is too large in both orientations', () => {
      const p = part(PLYWOOD, 19, 1.5, 2.5);
      expect(canFitOnAnyBoard(p, undefined, [SHEET_4x8], ZERO_UM)).toBe(false);
    });
  });

  describe('grain lock = length', () => {
    it('returns true when locked orientation fits', () => {
      const p = part(PLYWOOD, 19, 0.5, 1.0);
      expect(canFitOnAnyBoard(p, 'length', [SHEET_4x8], ZERO_UM)).toBe(true);
    });

    it('returns false when only the rotated orientation would fit', () => {
      const p = part(PLYWOOD, 19, 1.5, 0.5);
      expect(canFitOnAnyBoard(p, 'length', [SHEET_4x8], ZERO_UM)).toBe(false);
    });
  });

  describe('grain lock = width', () => {
    it('returns true when locked orientation fits', () => {
      const p = part(PLYWOOD, 19, 0.5, 1.0);
      expect(canFitOnAnyBoard(p, 'width', [SHEET_4x8], ZERO_UM)).toBe(true);
    });

    it('returns false when locked orientation is too wide', () => {
      const p = part(PLYWOOD, 19, 0.5, 1.5);
      expect(canFitOnAnyBoard(p, 'width', [SHEET_4x8], ZERO_UM)).toBe(false);
    });
  });

  describe('material and thickness matching', () => {
    it('returns false when no boards match material', () => {
      const p = part(MDF, 19, 0.5, 0.5);
      expect(canFitOnAnyBoard(p, undefined, [SHEET_4x8], ZERO_UM)).toBe(false);
    });

    it('returns false when no boards match thickness', () => {
      const p = part(PLYWOOD, 12, 0.5, 0.5);
      expect(canFitOnAnyBoard(p, undefined, [SHEET_4x8], ZERO_UM)).toBe(false);
    });

    it('returns false with empty board list', () => {
      const p = part(PLYWOOD, 19, 0.5, 0.5);
      expect(canFitOnAnyBoard(p, undefined, [], ZERO_UM)).toBe(false);
    });
  });

  describe('margin handling', () => {
    it('subtracts margin from usable board area', () => {
      const p = part(PLYWOOD, 19, 0.61, 1.22);
      expect(canFitOnAnyBoard(p, 'length', [SHEET_2x4], ZERO_UM)).toBe(true);
      // With 10mm margin → usable = 590 × 1200 mm, part no longer fits.
      expect(canFitOnAnyBoard(p, 'length', [SHEET_2x4], mmToUm(10))).toBe(
        false,
      );
    });

    it('part that fits within margins passes', () => {
      const p = part(PLYWOOD, 19, 0.5, 1.0);
      expect(canFitOnAnyBoard(p, 'length', [SHEET_2x4], mmToUm(10))).toBe(true);
    });

    it('returns false when margin consumes entire board', () => {
      const p = part(PLYWOOD, 19, 0.1, 0.1);
      expect(canFitOnAnyBoard(p, undefined, [SHEET_2x4], mmToUm(350))).toBe(
        false,
      );
    });
  });

  describe('multiple boards', () => {
    it('returns true if part fits on any one board', () => {
      const p = part(PLYWOOD, 19, 1.0, 2.0);
      expect(
        canFitOnAnyBoard(p, undefined, [SHEET_2x4, SHEET_4x8], ZERO_UM),
      ).toBe(true);
    });

    it('skips non-matching materials and finds a match', () => {
      const mdfBoard = board(MDF, 19, 2000, 3000);
      const p = part(MDF, 19, 0.5, 0.5);
      expect(
        canFitOnAnyBoard(p, undefined, [SHEET_4x8, mdfBoard], ZERO_UM),
      ).toBe(true);
    });
  });
});
