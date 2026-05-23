import { describe, it, expect } from 'vitest';
import {
  generateBoardLayouts,
  isLinearBoardLayout,
  reduceStockMatrix,
  isSheetStock,
  mToUm,
  type BoardLayout,
  type Config,
  type PartToCut,
  type SheetBoardLayout,
  type StockMatrix,
} from '..';

const baseConfig: Config = {
  bladeWidth: 0 as Config['bladeWidth'],
  margin: 0 as Config['margin'],
  defaultAlgorithm: 'auto',
  optimizationObjective: 'boards',
};

function makePart(
  partNumber: number,
  widthM: number,
  lengthM: number,
  material = 'Ply',
  thicknessM = 0.018,
): PartToCut {
  return {
    partNumber,
    instanceNumber: 1,
    name: `Part ${partNumber}`,
    material,
    size: {
      thickness: mToUm(thicknessM),
      width: mToUm(widthM),
      length: mToUm(lengthM),
    },
  };
}

const offcut = (
  width: number,
  length: number,
  quantity?: number,
  material = 'Ply',
): StockMatrix => ({
  kind: 'sheet',
  material,
  role: 'offcut',
  sizes: [{ width, length, thickness: [18], quantity }],
});

const general = (
  width: number,
  length: number,
  material = 'Ply',
): StockMatrix => ({
  kind: 'sheet',
  material,
  sizes: [{ width, length, thickness: [18] }],
});

function sheets(layouts: BoardLayout[]): SheetBoardLayout[] {
  return layouts.map((l) => {
    if (isLinearBoardLayout(l)) throw new Error('expected sheet layout');
    return l;
  });
}

describe('reduceStockMatrix — offcut role + quantity', () => {
  it('stamps offcut role with its size quantity and leaves general infinite', () => {
    const boards = reduceStockMatrix([
      offcut(500, 500, 2),
      general(1000, 2000),
    ]);
    expect(boards).toHaveLength(2);
    const off = boards.find((b) => b.role === 'offcut');
    const gen = boards.find((b) => b.role === 'general');
    expect(off?.quantity).toBe(2);
    // General is infinite supply — no finite count.
    expect(gen?.quantity).toBeUndefined();
  });

  it('defaults a missing offcut quantity to one physical sheet', () => {
    const boards = reduceStockMatrix([offcut(500, 500)]);
    expect(boards[0].quantity).toBe(1);
  });

  it('defaults role to general when the matrix entry omits it', () => {
    const boards = reduceStockMatrix([general(1000, 2000)]);
    expect(boards[0].role).toBe('general');
    expect(boards[0].quantity).toBeUndefined();
  });
});

describe('generateBoardLayouts — offcut-first consumption', () => {
  it('fills offcuts before opening a general sheet', () => {
    // Each 0.4×0.4 part needs its own 500×500 offcut (two won't fit together).
    const stock = [offcut(500, 500, 2), general(1000, 2000)];
    const parts = [
      makePart(1, 0.4, 0.4),
      makePart(2, 0.4, 0.4),
      makePart(3, 0.4, 0.4),
    ];

    const result = sheets(
      generateBoardLayouts(parts, stock, baseConfig).layouts,
    );

    const offcutBoards = result.filter((l) => l.stock.role === 'offcut');
    const generalBoards = result.filter((l) => l.stock.role === 'general');
    // Both offcuts consumed first; the third part overflows to general.
    expect(offcutBoards).toHaveLength(2);
    expect(generalBoards).toHaveLength(1);
  });

  it('respects the finite offcut count — never opens more than quantity', () => {
    const stock = [offcut(500, 500, 2), general(1000, 2000)];
    // Five parts, only two offcuts available.
    const parts = [1, 2, 3, 4, 5].map((n) => makePart(n, 0.4, 0.4));

    const result = sheets(
      generateBoardLayouts(parts, stock, baseConfig).layouts,
    );
    const offcutBoards = result.filter((l) => l.stock.role === 'offcut');

    expect(offcutBoards).toHaveLength(2);
    // No part is dropped — the rest overflow onto general stock.
    expect(result.flatMap((l) => l.placements)).toHaveLength(5);
  });

  it('overflows a part too large for any offcut onto general stock (not leftovers)', () => {
    // The part matches material+thickness of the offcut but cannot physically
    // fit it — it must fall through to the general sheet.
    const stock = [offcut(500, 500, 5), general(1000, 2000)];
    const big = makePart(1, 0.9, 0.9);

    const { layouts, leftovers } = generateBoardLayouts(
      [big],
      stock,
      baseConfig,
    );
    const result = sheets(layouts);

    expect(leftovers).toHaveLength(0);
    expect(result).toHaveLength(1);
    expect(result[0].stock.role).toBe('general');
  });

  it('keeps an offcut board at its physical size instead of shrinking it', () => {
    // A smaller general size exists, but an offcut layout must never be
    // swapped onto a different board — it is a fixed physical sheet.
    const stock = [offcut(500, 500, 1), general(300, 300), general(1000, 2000)];
    const part = makePart(1, 0.25, 0.25);

    const result = sheets(
      generateBoardLayouts([part], stock, baseConfig).layouts,
    );

    expect(result).toHaveLength(1);
    expect(result[0].stock.role).toBe('offcut');
    expect(result[0].stock.widthUm).toBe(mToUm(0.5));
    expect(result[0].stock.lengthUm).toBe(mToUm(0.5));
  });
});

describe('reduceStockMatrix output shape', () => {
  it('produces sheet stock for offcut entries', () => {
    const boards = reduceStockMatrix([offcut(500, 500, 2)]);
    expect(boards.every(isSheetStock)).toBe(true);
  });
});
