import { describe, expect, it } from 'vitest';
import { migrateProjectStockToArray } from '../v6';

describe('migrateProjectStockToArray', () => {
  it('parses YAML into stocks[] and drops the legacy stock field', () => {
    const yaml = `- material: Plywood
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
`;
    const result = migrateProjectStockToArray({ id: 'p1', stock: yaml });
    expect(result).not.toHaveProperty('stock');
    expect(result.stocks).toEqual([
      {
        kind: 'sheet',
        material: 'Plywood',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
    ]);
  });

  it('never throws on missing, empty, or malformed input', () => {
    for (const bad of [undefined, '', '   \n', 'foo: [unterminated']) {
      const result = migrateProjectStockToArray({ id: 'p1', stock: bad });
      expect(result.stocks).toEqual([]);
      expect(result).not.toHaveProperty('stock');
    }
  });
});
