import { describe, expect, it } from 'vitest';
import YAML from 'js-yaml';
import { migrateStockToV4 } from '../v4';

describe('migrateStockToV4', () => {
  it("adds kind: 'sheet' to legacy rows that lack it", () => {
    const stockYaml = YAML.dump([
      {
        material: 'Plywood',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
    ]);
    const v4 = migrateStockToV4({ id: 'p', stock: stockYaml });
    const parsed = YAML.load(v4.stock as string) as Array<{
      kind: string;
      material: string;
    }>;
    expect(parsed[0].kind).toBe('sheet');
    expect(parsed[0].material).toBe('Plywood');
  });

  it("leaves rows that already declare kind: 'sheet' unchanged", () => {
    const original = [
      {
        kind: 'sheet',
        material: 'MDF',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
    ];
    const v4 = migrateStockToV4({ id: 'p', stock: YAML.dump(original) });
    expect(YAML.load(v4.stock as string)).toEqual(original);
  });

  it("leaves rows with kind: 'linear' untouched (forward-compatible)", () => {
    const original = [
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: 89,
          crossSectionThickness: 38,
          lengths: [2400, 3000],
        },
      },
    ];
    const v4 = migrateStockToV4({ id: 'p', stock: YAML.dump(original) });
    expect(YAML.load(v4.stock as string)).toEqual(original);
  });

  it('drops rows that fail validation (e.g. missing material)', () => {
    const stockYaml = YAML.dump([
      {
        material: 'Plywood',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
      {
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
      {
        material: 'MDF',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
    ]);
    const v4 = migrateStockToV4({ id: 'p', stock: stockYaml });
    const parsed = YAML.load(v4.stock as string) as Array<{
      material: string;
    }>;
    expect(parsed.map((r) => r.material)).toEqual(['Plywood', 'MDF']);
  });

  it('returns the empty-array YAML when input YAML is malformed', () => {
    const v4 = migrateStockToV4({
      id: 'p',
      stock: '- material: [unterminated',
    });
    expect(YAML.load(v4.stock as string)).toEqual([]);
  });

  it('returns the empty-array YAML when input is not a YAML array', () => {
    const v4 = migrateStockToV4({
      id: 'p',
      stock: 'material: Plywood\nsizes: []\n',
    });
    expect(YAML.load(v4.stock as string)).toEqual([]);
  });

  it('returns the input record unchanged when stock is empty', () => {
    const record = { id: 'p', stock: '' };
    expect(migrateStockToV4(record)).toBe(record);
  });

  it('returns the input record unchanged when stock is undefined', () => {
    const record = { id: 'p' };
    expect(migrateStockToV4(record)).toBe(record);
  });

  it('is idempotent on already-v4 data', () => {
    const stockYaml = YAML.dump([
      {
        kind: 'sheet',
        material: 'Plywood',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
      {
        kind: 'linear',
        material: 'Pine 2x4',
        size: {
          crossSectionWidth: 89,
          crossSectionThickness: 38,
          lengths: [2400],
        },
      },
    ]);
    const once = migrateStockToV4({ id: 'p', stock: stockYaml });
    const twice = migrateStockToV4(once);
    expect(YAML.load(twice.stock as string)).toEqual(
      YAML.load(once.stock as string),
    );
  });

  it('drops null rows in a mixed array', () => {
    const stockYaml = `- material: Plywood
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
- ~
- material: MDF
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
`;
    const v4 = migrateStockToV4({ id: 'p', stock: stockYaml });
    const parsed = YAML.load(v4.stock as string) as Array<{
      kind: string;
      material: string;
    }>;
    expect(parsed.map((r) => r.material)).toEqual(['Plywood', 'MDF']);
    expect(parsed.every((r) => r.kind === 'sheet')).toBe(true);
  });
});
