import { describe, expect, it } from 'vitest';
import { parseStock } from '../parseStock';

describe('parseStock', () => {
  it('parses a valid YAML string with per-size thicknesses', () => {
    const yaml = `
- material: MDF
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
`;
    const result = parseStock(yaml);
    expect(result).toHaveLength(1);
    expect(result[0]).toEqual({
      kind: 'sheet',
      material: 'MDF',
      sizes: [{ width: 1220, length: 2440, thickness: [18] }],
    });
  });

  it('parses multiple stock entries', () => {
    const yaml = `
- material: MDF
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
- material: Ply
  sizes:
    - width: 600
      length: 1800
      thickness: [12]
`;
    const result = parseStock(yaml);
    expect(result).toHaveLength(2);
    expect(result[0].material).toBe('MDF');
    expect(result[1].material).toBe('Ply');
  });

  it('parses colors and multiple thicknesses', () => {
    const yaml = `
- material: Baltic Birch
  color: '#d2b996'
  sizes:
    - width: 1220
      length: 2440
      thickness: [12, 18]
`;

    expect(parseStock(yaml)).toEqual([
      {
        kind: 'sheet',
        material: 'Baltic Birch',
        color: '#d2b996',
        sizes: [{ width: 1220, length: 2440, thickness: [12, 18] }],
      },
    ]);
  });

  it('rejects string dimensions (mm-only schema)', () => {
    const yaml = `
- material: Mix
  sizes:
    - width: 1220mm
      length: 2440mm
      thickness: [18mm]
`;
    expect(() => parseStock(yaml)).toThrow();
  });

  it('throws a ZodError for invalid YAML missing required fields', () => {
    const yaml = `
- material: MDF
`;
    expect(() => parseStock(yaml)).toThrow();
  });

  it('Should throw when YAML is malformed', () => {
    expect(() => parseStock('- material: [unterminated')).toThrow();
  });

  it('returns [] for an empty array YAML', () => {
    expect(parseStock('[]')).toEqual([]);
  });
});
