import { describe, expect, it } from 'vitest';
import { migrateProjectStockRoles } from '../v7';

describe('migrateProjectStockRoles', () => {
  it("stamps role 'general' on stock entries that lack one", () => {
    const result = migrateProjectStockRoles({
      id: 'p1',
      stocks: [
        {
          kind: 'sheet',
          material: 'Ply',
          sizes: [{ width: 1, length: 2, thickness: [18] }],
        },
        {
          kind: 'linear',
          material: 'Pine',
          size: {
            crossSectionWidth: 1,
            crossSectionThickness: 2,
            lengths: [3],
          },
        },
      ],
    });
    expect((result.stocks as { role?: string }[]).map((s) => s.role)).toEqual([
      'general',
      'general',
    ]);
  });

  it('leaves an explicit role untouched', () => {
    const result = migrateProjectStockRoles({
      id: 'p1',
      stocks: [
        { kind: 'sheet', material: 'Ply', role: 'offcut', sizes: [] },
        { kind: 'sheet', material: 'MDF', role: 'general', sizes: [] },
      ],
    });
    expect((result.stocks as { role?: string }[]).map((s) => s.role)).toEqual([
      'offcut',
      'general',
    ]);
  });

  it('never throws on missing or malformed stocks', () => {
    expect(() => migrateProjectStockRoles({ id: 'p1' })).not.toThrow();
    expect(migrateProjectStockRoles({ id: 'p1' })).not.toHaveProperty('stocks');

    const withNonArray = migrateProjectStockRoles({ id: 'p1', stocks: 'oops' });
    expect(withNonArray.stocks).toBe('oops');

    const withJunkEntry = migrateProjectStockRoles({
      id: 'p1',
      stocks: [null, 'x', { kind: 'sheet', material: 'Ply', sizes: [] }],
    });
    const out = withJunkEntry.stocks as unknown[];
    expect(out[0]).toBeNull();
    expect(out[1]).toBe('x');
    expect((out[2] as { role?: string }).role).toBe('general');
  });
});
