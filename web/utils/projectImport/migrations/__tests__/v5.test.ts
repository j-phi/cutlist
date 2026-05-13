import { describe, expect, it } from 'vitest';
import { migrateProjectScalarsToUm, migrateModelPartsToUm } from '../v5';

describe('migrateProjectScalarsToUm', () => {
  it('converts finite mm scalars to integer µm', () => {
    expect(
      migrateProjectScalarsToUm({ bladeWidth: 3.175, margin: 0 }),
    ).toMatchObject({ bladeWidth: 3175, margin: 0 });
  });

  it('coerces missing, non-finite, or negative values to 0', () => {
    for (const bad of [undefined, null, NaN, -1, '3' as unknown]) {
      const out = migrateProjectScalarsToUm({ bladeWidth: bad, margin: bad });
      expect(out.bladeWidth).toBe(0);
      expect(out.margin).toBe(0);
    }
  });
});

describe('migrateModelPartsToUm', () => {
  it('converts each Part.size from float meters to integer µm', () => {
    const out = migrateModelPartsToUm({
      parts: [
        { partNumber: 1, size: { width: 0.5, length: 0.8, thickness: 0.018 } },
      ],
    });
    const parts = out.parts as Array<{
      size: { width: number; length: number; thickness: number };
    }>;
    expect(parts[0].size).toEqual({
      width: 500_000,
      length: 800_000,
      thickness: 18_000,
    });
  });

  it('passes through records with no parts array', () => {
    expect(migrateModelPartsToUm({ foo: 'bar' })).toEqual({ foo: 'bar' });
    expect(migrateModelPartsToUm({ parts: 'not-an-array' })).toEqual({
      parts: 'not-an-array',
    });
  });

  it('zeroes malformed dimensions rather than throwing', () => {
    const out = migrateModelPartsToUm({
      parts: [
        { partNumber: 1, size: { width: -1, length: NaN, thickness: '0.018' } },
        { partNumber: 2 },
        null,
      ],
    });
    const parts = out.parts as unknown[];
    expect((parts[0] as { size: object }).size).toEqual({
      width: 0,
      length: 0,
      thickness: 0,
    });
    expect(parts[1]).toEqual({ partNumber: 2 });
    expect(parts[2]).toBeNull();
  });
});
