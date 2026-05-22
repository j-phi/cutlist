import { describe, expect, it } from 'vitest';
import { migrateProjectStockNames } from '../v8';

describe('migrateProjectStockNames', () => {
  it('moves the old material into name and resets material to Uncategorized', () => {
    const result = migrateProjectStockNames({
      id: 'p1',
      stocks: [
        { kind: 'sheet', material: 'Birch Ply', sizes: [] },
        {
          kind: 'linear',
          material: 'Pine 2x4',
          size: {
            crossSectionWidth: 1,
            crossSectionThickness: 2,
            lengths: [3],
          },
        },
      ],
    });
    expect(
      (result.stocks as { name?: string; material?: string }[]).map((s) => [
        s.name,
        s.material,
      ]),
    ).toEqual([
      ['Birch Ply', 'Uncategorized'],
      ['Pine 2x4', 'Uncategorized'],
    ]);
  });

  it('leaves entries that already carry a name untouched', () => {
    const result = migrateProjectStockNames({
      id: 'p1',
      stocks: [
        { kind: 'sheet', name: 'Door offcut', material: 'Plywood', sizes: [] },
      ],
    });
    const s = (result.stocks as { name?: string; material?: string }[])[0];
    expect(s.name).toBe('Door offcut');
    expect(s.material).toBe('Plywood');
  });

  it('handles an entry missing material by naming it empty', () => {
    const result = migrateProjectStockNames({
      id: 'p1',
      stocks: [{ kind: 'sheet', sizes: [] }],
    });
    const s = (result.stocks as { name?: string; material?: string }[])[0];
    expect(s.name).toBe('');
    expect(s.material).toBe('Uncategorized');
  });

  it('never throws on missing or malformed stocks', () => {
    expect(() => migrateProjectStockNames({ id: 'p1' })).not.toThrow();
    expect(migrateProjectStockNames({ id: 'p1' })).not.toHaveProperty('stocks');

    const withNonArray = migrateProjectStockNames({ id: 'p1', stocks: 'oops' });
    expect(withNonArray.stocks).toBe('oops');

    const withJunkEntry = migrateProjectStockNames({
      id: 'p1',
      stocks: [null, 'x', { kind: 'sheet', material: 'Ply', sizes: [] }],
    });
    const out = withJunkEntry.stocks as unknown[];
    expect(out[0]).toBeNull();
    expect(out[1]).toBe('x');
    expect((out[2] as { name?: string; material?: string }).name).toBe('Ply');
    expect((out[2] as { material?: string }).material).toBe('Uncategorized');
  });
});
