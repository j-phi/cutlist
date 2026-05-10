import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  FutureSchemaError,
  LegacyExportError,
  MIN_SUPPORTED_EXPORT_VERSION,
} from '../../versions';
import {
  migrations,
  migrateRecord,
  migrateExport,
  migrateProjectToMmStorage,
} from '../migrations';
import YAML from 'js-yaml';
import { DEFAULT_SETTINGS } from '../../settings';
import {
  applyProjectDefaults,
  applyModelDefaults,
} from '../../../composables/useIdb';

// ─── migrateRecord ─────────────────────────────────────────────────────────

describe('migrateRecord', () => {
  it('returns record unchanged when no migrations apply', () => {
    const record = { id: 'x', name: 'test' };
    const result = migrateRecord('projects', record, SCHEMA_VERSION);
    expect(result).toEqual(record);
  });

  it('v1 → v2: maps optimize: "Auto" to defaultAlgorithm: "auto"', () => {
    const v1Record = {
      id: 'p',
      name: 'Old Project',
      optimize: 'Auto',
      bladeWidth: 3,
    };
    const result = migrateRecord('projects', v1Record, 1);
    expect(result.defaultAlgorithm).toBe('auto');
    expect(result.optimize).toBeUndefined();
    expect(result.bladeWidth).toBe(3); // unrelated fields preserved
  });

  it('v1 → v2: maps optimize: "CNC" to defaultAlgorithm: "cnc"', () => {
    const v1Record = { id: 'p', name: 'Old', optimize: 'CNC' };
    const result = migrateRecord('projects', v1Record, 1);
    expect(result.defaultAlgorithm).toBe('cnc');
    expect(result.optimize).toBeUndefined();
  });

  it('v1 → v2: missing optimize defaults to "auto"', () => {
    const v1Record = { id: 'p', name: 'Old' };
    const result = migrateRecord('projects', v1Record, 1);
    expect(result.defaultAlgorithm).toBe('auto');
  });
});

// ─── v3: canonical mm storage ─────────────────────────────────────────────

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

// ─── Migration registry invariants ──────────────────────────────────────────

describe('migration registry invariants', () => {
  it('all migrations have version <= SCHEMA_VERSION', () => {
    for (const m of migrations) {
      expect(m.version).toBeLessThanOrEqual(SCHEMA_VERSION);
    }
  });

  it('migration versions are non-decreasing', () => {
    for (let i = 1; i < migrations.length; i++) {
      expect(migrations[i].version).toBeGreaterThanOrEqual(
        migrations[i - 1].version,
      );
    }
  });

  it('every migration has a valid store name', () => {
    const validStores = [
      'projects',
      'models',
      'buildDoc',
      'scenes',
      'annotations',
    ];
    for (const m of migrations) {
      expect(validStores).toContain(m.store);
    }
  });

  it('every migration.migrate is a function', () => {
    for (const m of migrations) {
      expect(typeof m.migrate).toBe('function');
    }
  });
});

// ─── Version constants ──────────────────────────────────────────────────────

describe('version constants', () => {
  it('SCHEMA_VERSION is a positive integer', () => {
    expect(SCHEMA_VERSION).toBeGreaterThan(0);
    expect(Number.isInteger(SCHEMA_VERSION)).toBe(true);
  });
});

// ─── migrateExport ──────────────────────────────────────────────────────────

describe('migrateExport', () => {
  it('rejects future version with descriptive error', () => {
    const raw = { version: SCHEMA_VERSION + 1, project: {}, models: [] };
    expect(() => migrateExport(raw)).toThrow('newer version');
    expect(() => migrateExport(raw)).toThrow('Please update the app');
  });

  it('returns current-version export by reference (no copy)', () => {
    const raw = {
      version: SCHEMA_VERSION,
      project: { id: 'p' },
      models: [],
    };
    const result = migrateExport(raw);
    expect(result).toBe(raw);
  });

  it('rejects legacy versions below MIN_SUPPORTED_EXPORT_VERSION', () => {
    const raw = {
      version: MIN_SUPPORTED_EXPORT_VERSION - 1,
      project: {},
      models: [],
    };
    expect(() => migrateExport(raw)).toThrow(LegacyExportError);
    expect(() => migrateExport(raw)).toThrow('older version of Cutlist');
  });

  it('treats missing version as legacy (defaults to v0)', () => {
    const raw = { project: { id: 'p', name: 'Test' }, models: [] };
    expect(() => migrateExport(raw)).toThrow(LegacyExportError);
  });

  it('preserves unknown top-level fields on a current-version export', () => {
    const raw = {
      version: SCHEMA_VERSION,
      project: { id: 'p' },
      models: [],
      customField: 'preserved',
    };
    const result = migrateExport(raw);
    expect((result as any).customField).toBe('preserved');
  });
});

// ─── FutureSchemaError ──────────────────────────────────────────────────────

describe('FutureSchemaError', () => {
  it('has descriptive message including both versions', () => {
    const err = new FutureSchemaError(99);
    expect(err.message).toContain('99');
    expect(err.message).toContain(String(SCHEMA_VERSION));
    expect(err.name).toBe('FutureSchemaError');
  });
});

describe('LegacyExportError', () => {
  it('names the format version that produced the file', () => {
    const err = new LegacyExportError(1);
    expect(err.message).toContain('format v1');
    expect(err.message).toContain(`format v${SCHEMA_VERSION}`);
    expect(err.name).toBe('LegacyExportError');
  });
});

// ─── applyDefaults (safety net layer) ───────────────────────────────────────

describe('applyProjectDefaults', () => {
  it('fills missing stock, colorMap, excludedColors, distanceUnit, and packing settings', () => {
    const bare = { id: 'x', name: 'X', createdAt: '', updatedAt: '' };
    const result = applyProjectDefaults(bare);
    expect(result.stock).toBe('');
    expect(result.colorMap).toEqual({});
    expect(result.excludedColors).toEqual([]);
    expect(result.distanceUnit).toBe(DEFAULT_SETTINGS.distanceUnit);
    expect(result.bladeWidth).toBe(DEFAULT_SETTINGS.bladeWidth);
    expect(result.margin).toBe(DEFAULT_SETTINGS.margin);
    expect(result.defaultAlgorithm).toBe(DEFAULT_SETTINGS.defaultAlgorithm);
    expect(result.showPartNumbers).toBe(DEFAULT_SETTINGS.showPartNumbers);
  });

  it('preserves existing values', () => {
    const full = {
      id: 'x',
      name: 'X',
      stock: 'custom',
      colorMap: { a: 'b' },
      excludedColors: ['c'],
      distanceUnit: 'in' as const,
      bladeWidth: 4.2,
      margin: 1.5,
      defaultAlgorithm: 'cnc' as const,
      showPartNumbers: false,
      createdAt: '',
      updatedAt: '',
    };
    const result = applyProjectDefaults(full);
    expect(result.stock).toBe('custom');
    expect(result.colorMap).toEqual({ a: 'b' });
    expect(result.excludedColors).toEqual(['c']);
    expect(result.distanceUnit).toBe('in');
    expect(result.bladeWidth).toBe(4.2);
    expect(result.margin).toBe(1.5);
    expect(result.defaultAlgorithm).toBe('cnc');
    expect(result.showPartNumbers).toBe(false);
  });
});

describe('applyModelDefaults', () => {
  it('fills missing source, enabled, and partOverrides', () => {
    const bare = { id: 'x', projectId: 'p', filename: 'f.glb', createdAt: '' };
    const result = applyModelDefaults(bare);
    expect(result.source).toBe('gltf');
    expect(result.enabled).toBe(true);
    expect(result.partOverrides).toEqual({});
  });

  it('preserves existing values', () => {
    const full = {
      id: 'x',
      projectId: 'p',
      filename: 'f.glb',
      source: 'manual' as const,
      enabled: false,
      partOverrides: { 1: { grainLock: 'length' as const } },
      colors: [
        { key: '#fff', rgb: [1, 1, 1] as [number, number, number], count: 1 },
      ],
      nodePartMap: [{ nodeIndex: 0, partNumber: 1, colorHex: '#fff' }],
      createdAt: '',
    };
    const result = applyModelDefaults(full);
    expect(result.source).toBe('manual');
    expect(result.enabled).toBe(false);
    expect(result.partOverrides).toEqual({ 1: { grainLock: 'length' } });
    expect(result.colors).toHaveLength(1);
    expect(result.nodePartMap).toHaveLength(1);
  });
});
