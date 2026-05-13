import { describe, expect, it } from 'vitest';
import {
  SCHEMA_VERSION,
  FutureSchemaError,
  LegacyExportError,
  MIN_SUPPORTED_EXPORT_VERSION,
} from '../../versions';
import { migrations, migrateRecord, migrateExport } from '../migrations';
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
    // v5 converts the preserved-from-v1 bladeWidth (mm) into µm at the end.
    expect(result.bladeWidth).toBe(3_000);
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

// applyDefaults fills fields that were added later than v1 without their own
// migration (showPartNumbers on projects; source/enabled/partOverrides on
// models). The "preserves existing values" cases were dropped — pure object
// spread, no bug class.
describe('applyProjectDefaults', () => {
  it('fills missing fields with the project-settings defaults', () => {
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
});

describe('applyModelDefaults', () => {
  it('fills missing source, enabled, and partOverrides', () => {
    const bare = { id: 'x', projectId: 'p', filename: 'f.glb', createdAt: '' };
    const result = applyModelDefaults(bare);
    expect(result.source).toBe('gltf');
    expect(result.enabled).toBe(true);
    expect(result.partOverrides).toEqual({});
  });
});
