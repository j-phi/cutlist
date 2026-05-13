import {
  STOCK_MATCH_TOLERANCE_UM,
  type Micrometres,
  type SheetStock,
} from 'cutlist';
import type { GrainLock } from '~/utils/grain';

/**
 * Check whether a part with the given dimensions and proposed grain lock
 * can fit on at least one matching stock board (same material + thickness),
 * accounting for margin on each side of the board.
 */
export function canFitOnAnyBoard(
  part: {
    material: string;
    thicknessUm: Micrometres;
    widthUm: Micrometres;
    lengthUm: Micrometres;
  },
  grainLock: GrainLock,
  boards: SheetStock[],
  marginUm: Micrometres,
): boolean {
  const matching = boards.filter(
    (b) =>
      b.material === part.material &&
      Math.abs(b.thickness - part.thicknessUm) <= STOCK_MATCH_TOLERANCE_UM,
  );
  if (matching.length === 0) return false;

  const inset = marginUm * 2;

  for (const board of matching) {
    const usableW = board.width - inset;
    const usableL = board.length - inset;
    if (usableW <= 0 || usableL <= 0) continue;

    if (grainLock) {
      const partW = grainLock === 'width' ? part.lengthUm : part.widthUm;
      const partL = grainLock === 'width' ? part.widthUm : part.lengthUm;
      if (partW <= usableW && partL <= usableL) return true;
    } else {
      if (
        (part.widthUm <= usableW && part.lengthUm <= usableL) ||
        (part.lengthUm <= usableW && part.widthUm <= usableL)
      )
        return true;
    }
  }
  return false;
}
