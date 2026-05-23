import { describe, expect, it } from 'vitest';
import { migrateProjectStockCost } from '../v9';

describe('migrateProjectStockCost', () => {
  it('leaves a v8 stock record without cost unchanged (cost stays absent)', () => {
    const input = {
      id: 'p1',
      stocks: [
        {
          kind: 'sheet',
          name: 'Birch Ply',
          material: 'Plywood',
          sizes: [{ width: 1220, length: 2440, thickness: [18] }],
        },
      ],
    };
    const result = migrateProjectStockCost(input);
    expect(result).toEqual(input);
    const size = (result.stocks as { sizes: { cost?: number }[] }[])[0]
      .sizes[0];
    expect(size).not.toHaveProperty('cost');
  });

  it('preserves an existing cost value if one is already present', () => {
    const result = migrateProjectStockCost({
      id: 'p1',
      stocks: [
        {
          kind: 'sheet',
          material: 'Plywood',
          sizes: [{ width: 1220, length: 2440, thickness: [18], cost: 60 }],
        },
      ],
    });
    const size = (result.stocks as { sizes: { cost?: number }[] }[])[0]
      .sizes[0];
    expect(size.cost).toBe(60);
  });

  it('never throws on missing or malformed stocks', () => {
    expect(() => migrateProjectStockCost({ id: 'p1' })).not.toThrow();
    expect(migrateProjectStockCost({ id: 'p1' })).not.toHaveProperty('stocks');
    expect(migrateProjectStockCost({ id: 'p1', stocks: 'oops' }).stocks).toBe(
      'oops',
    );
    const junk = migrateProjectStockCost({
      id: 'p1',
      stocks: [null, 'x', { kind: 'linear', material: 'Pine' }],
    });
    expect((junk.stocks as unknown[])[0]).toBeNull();
  });
});
