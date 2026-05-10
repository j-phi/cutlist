import { describe, expect, it } from 'vitest';
import YAML from 'js-yaml';
import { migrateProjectToMmStorage } from '../v3';

describe('migrateProjectToMmStorage (v3)', () => {
  it('converts an inch-mode project to mm', () => {
    const stockYaml = YAML.dump([
      {
        material: 'Plywood',
        unit: 'in',
        sizes: [{ width: 48, length: 96, thickness: [0.75] }],
      },
    ]);
    const v2 = {
      id: 'p',
      distanceUnit: 'in',
      bladeWidth: 0.125,
      margin: 0.25,
      stock: stockYaml,
    };
    const v3 = migrateProjectToMmStorage(v2);

    expect(v3.bladeWidth).toBeCloseTo(3.175, 5);
    expect(v3.margin).toBeCloseTo(6.35, 5);

    const parsed = YAML.load(v3.stock as string) as Array<{
      unit?: string;
      sizes: Array<{ width: number; length: number; thickness: number[] }>;
    }>;
    expect(parsed[0].unit).toBeUndefined();
    expect(parsed[0].sizes[0].width).toBeCloseTo(1219.2, 3);
    expect(parsed[0].sizes[0].length).toBeCloseTo(2438.4, 3);
    expect(parsed[0].sizes[0].thickness[0]).toBeCloseTo(19.05, 3);
  });

  it('leaves an mm-mode project unchanged', () => {
    const stockYaml = YAML.dump([
      {
        material: 'MDF',
        unit: 'mm',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
    ]);
    const v2 = {
      id: 'p',
      distanceUnit: 'mm',
      bladeWidth: 3,
      margin: 0,
      stock: stockYaml,
    };
    const v3 = migrateProjectToMmStorage(v2);

    expect(v3.bladeWidth).toBe(3);
    expect(v3.margin).toBe(0);
    const parsed = YAML.load(v3.stock as string) as Array<{
      unit?: string;
      sizes: Array<{ width: number; thickness: number[] }>;
    }>;
    expect(parsed[0].unit).toBeUndefined();
    expect(parsed[0].sizes[0].width).toBe(1220);
    expect(parsed[0].sizes[0].thickness[0]).toBe(18);
  });

  it('honours per-row unit when it disagrees with project unit', () => {
    const stockYaml = YAML.dump([
      {
        material: 'Plywood',
        unit: 'in',
        sizes: [{ width: 48, length: 96, thickness: [0.75] }],
      },
      {
        material: 'MDF',
        unit: 'mm',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
    ]);
    const v3 = migrateProjectToMmStorage({
      id: 'p',
      distanceUnit: 'in',
      bladeWidth: 0.125,
      margin: 0,
      stock: stockYaml,
    });

    const parsed = YAML.load(v3.stock as string) as Array<{
      sizes: Array<{ width: number; thickness: number[] }>;
    }>;
    expect(parsed[0].sizes[0].width).toBeCloseTo(1219.2, 3);
    expect(parsed[1].sizes[0].width).toBe(1220);
  });

  it('migrates legacy string-distance dimensions in the YAML', () => {
    const stockYaml = `- material: Mix
  unit: mm
  sizes:
    - width: '48in'
      length: '96in'
      thickness: ['3/4in', '12mm']
`;
    const v3 = migrateProjectToMmStorage({
      id: 'p',
      distanceUnit: 'mm',
      bladeWidth: 3,
      margin: 0,
      stock: stockYaml,
    });
    const parsed = YAML.load(v3.stock as string) as Array<{
      sizes: Array<{ width: number; length: number; thickness: number[] }>;
    }>;
    expect(parsed[0].sizes[0].width).toBeCloseTo(1219.2, 3);
    expect(parsed[0].sizes[0].length).toBeCloseTo(2438.4, 3);
    expect(parsed[0].sizes[0].thickness[0]).toBeCloseTo(19.05, 3);
    expect(parsed[0].sizes[0].thickness[1]).toBe(12);
  });

  it('leaves an empty stock string alone', () => {
    const v3 = migrateProjectToMmStorage({
      id: 'p',
      distanceUnit: 'in',
      bladeWidth: 0.125,
      margin: 0,
      stock: '',
    });
    expect(v3.stock).toBe('');
    expect(v3.bladeWidth).toBeCloseTo(3.175, 5);
  });

  // ── Defensive contract ─────────────────────────────────────────────
  // The migration runs inside a Dexie transaction; any thrown error rolls
  // back the upgrade and locks the user out of the app. These tests pin
  // that malformed input never throws and always yields valid v3 YAML.

  it('repairs a row with missing sizes to sizes: [] rather than throwing', () => {
    const stockYaml = `- material: Plywood
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
- material: Broken
  unit: mm
  # sizes intentionally absent
- material: MDF
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
`;
    const run = () =>
      migrateProjectToMmStorage({
        id: 'p',
        distanceUnit: 'mm',
        bladeWidth: 3,
        margin: 0,
        stock: stockYaml,
      });
    expect(run).not.toThrow();
    // Material name + color survive; sizes is normalized to an empty array
    // so parseStock won't choke and the user can re-add sizes via the UI.
    const parsed = YAML.load(run().stock as string) as Array<{
      material: string;
      sizes: unknown[];
    }>;
    expect(parsed.map((r) => r.material)).toEqual(['Plywood', 'Broken', 'MDF']);
    expect(parsed[1].sizes).toEqual([]);
  });

  it('drops a row that is null', () => {
    const stockYaml = `- material: Plywood
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
- ~
- material: MDF
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18]
`;
    const run = () =>
      migrateProjectToMmStorage({
        id: 'p',
        distanceUnit: 'mm',
        bladeWidth: 3,
        margin: 0,
        stock: stockYaml,
      });
    expect(run).not.toThrow();
    const parsed = YAML.load(run().stock as string) as Array<{
      material: string;
    }>;
    expect(parsed.map((r) => r.material)).toEqual(['Plywood', 'MDF']);
  });

  it('drops sizes with unparseable dimensions but keeps the rest of the row', () => {
    const stockYaml = `- material: Plywood
  unit: mm
  sizes:
    - width: 1220
      length: 2440
      thickness: [18, 'not-a-number', 12]
    - width: 'garbage'
      length: 2440
      thickness: [18]
`;
    const v3 = migrateProjectToMmStorage({
      id: 'p',
      distanceUnit: 'mm',
      bladeWidth: 3,
      margin: 0,
      stock: stockYaml,
    });
    const parsed = YAML.load(v3.stock as string) as Array<{
      sizes: Array<{ thickness: number[] }>;
    }>;
    expect(parsed).toHaveLength(1);
    // Bad-width size dropped; bad thickness entry filtered.
    expect(parsed[0].sizes).toHaveLength(1);
    expect(parsed[0].sizes[0].thickness).toEqual([18, 12]);
  });

  it('returns an empty matrix when YAML is malformed', () => {
    const v3 = migrateProjectToMmStorage({
      id: 'p',
      distanceUnit: 'mm',
      bladeWidth: 3,
      margin: 0,
      stock: '- material: [unterminated',
    });
    const parsed = YAML.load(v3.stock as string);
    expect(parsed).toEqual([]);
  });

  it('returns an empty matrix when YAML is not an array', () => {
    const v3 = migrateProjectToMmStorage({
      id: 'p',
      distanceUnit: 'mm',
      bladeWidth: 3,
      margin: 0,
      stock: 'material: Plywood\nsizes: []\n',
    });
    const parsed = YAML.load(v3.stock as string);
    expect(parsed).toEqual([]);
  });

  it('seeds the unit-appropriate default precision when missing', () => {
    const inchProject = migrateProjectToMmStorage({
      id: 'p',
      distanceUnit: 'in',
      bladeWidth: 0.125,
      margin: 0,
      stock: '',
    });
    expect(inchProject.precision).toEqual({
      kind: 'fraction',
      denominator: 32,
    });

    const mmProject = migrateProjectToMmStorage({
      id: 'p',
      distanceUnit: 'mm',
      bladeWidth: 3,
      margin: 0,
      stock: '',
    });
    expect(mmProject.precision).toEqual({ kind: 'decimal', step: 0.1 });
  });

  it('preserves an existing precision setting (idempotent)', () => {
    const custom = { kind: 'fraction', denominator: 16 };
    const v3 = migrateProjectToMmStorage({
      id: 'p',
      distanceUnit: 'in',
      bladeWidth: 3.175,
      margin: 0,
      stock: '',
      precision: custom,
    });
    expect(v3.precision).toEqual(custom);
  });

  it('is idempotent on already-v3 data', () => {
    // Already v3-shaped: no `unit` field, mm numerics. Running the
    // migration a second time should be a no-op.
    const stockYaml = YAML.dump([
      {
        material: 'Plywood',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
    ]);
    const once = migrateProjectToMmStorage({
      id: 'p',
      distanceUnit: 'mm',
      bladeWidth: 3.175,
      margin: 0,
      stock: stockYaml,
    });
    const twice = migrateProjectToMmStorage(once);
    expect(twice.bladeWidth).toBe(3.175);
    expect(twice.margin).toBe(0);
    expect(YAML.load(twice.stock as string)).toEqual(
      YAML.load(once.stock as string),
    );
  });
});
