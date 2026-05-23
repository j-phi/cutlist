/**
 * Edge-case tests for project import: corrupt data, boundary cases,
 * and round-trip fidelity with overrides and build steps.
 */
import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { SCHEMA_VERSION } from '../../versions';
import {
  importProjectData,
  importProjectFromFile,
  parseProjectExport,
} from '..';
import { getDb } from '~/composables/useIdb/db';
import { makePayload, makeIdbMock, FIXTURE_NEW_PROJECT_ID } from './_helpers';

describe('parseProjectExport edge cases', () => {
  it('rejects a boolean', () => {
    expect(() => parseProjectExport(true)).toThrow('expected a JSON object');
  });

  it('rejects an unversioned array as legacy', () => {
    expect(() => parseProjectExport([1, 2, 3])).toThrow(
      'older version of Cutlist',
    );
  });

  it('handles model with partOverrides preserved', () => {
    const payload = makePayload();
    payload.models[0].partOverrides = { '1': { grainLock: 'length' } };
    const parsed = parseProjectExport(payload);
    expect(parsed.models[0].partOverrides).toMatchObject({
      '1': { grainLock: 'length' },
    });
  });

  it('handles payload with no buildDoc field', () => {
    const payload = makePayload();
    delete (payload as { buildDoc?: unknown }).buildDoc;
    const parsed = parseProjectExport(payload);
    expect(parsed.buildDoc).toBeUndefined();
  });

  it('handles payload with empty models array', () => {
    const payload = makePayload();
    payload.models = [];
    const parsed = parseProjectExport(payload);
    expect(parsed.models).toHaveLength(0);
  });

  it('rejects payload with future schema version', () => {
    const payload = makePayload({ version: SCHEMA_VERSION + 100 });
    expect(() => parseProjectExport(payload)).toThrow('newer version');
  });

  it('rejects payload with negative partNumber', () => {
    const payload = makePayload();
    payload.models[0].parts = [
      {
        partNumber: -1,
        instanceNumber: 1,
        name: 'Bad',
        colorKey: '#aaa',
        size: { width: 0.3, length: 0.5, thickness: 0.018 },
      },
    ] as never;
    expect(() => parseProjectExport(payload)).toThrow('Invalid project file');
  });

  it('rejects payload with NaN size', () => {
    const payload = makePayload();
    payload.models[0].parts = [
      {
        partNumber: 1,
        instanceNumber: 1,
        name: 'Bad',
        colorKey: '#aaa',
        size: { width: NaN, length: 0.5, thickness: 0.018 },
      },
    ] as never;
    expect(() => parseProjectExport(payload)).toThrow('Invalid project file');
  });

  it('silently strips a legacy settings field if present', () => {
    const payload = makePayload({ settings: { bladeWidth: '2' } });
    const parsed = parseProjectExport(payload);
    expect(
      (parsed as unknown as { settings?: unknown }).settings,
    ).toBeUndefined();
  });
});

describe('importProjectData remapping', () => {
  it('preserves excludedColors on import', async () => {
    const payload = makePayload();
    payload.project.excludedColors = ['#bbb'];
    const { db, calls } = makeIdbMock();
    await importProjectData(payload as never, db as never);
    expect(calls.updateProject[0].patch.excludedColors).toEqual(['#bbb']);
  });

  it('generates unique model IDs for each model', async () => {
    const payload = makePayload();
    payload.models.push({
      ...payload.models[0],
      id: 'model-2',
    });
    const { db, calls } = makeIdbMock();
    await importProjectData(payload as never, db as never);

    const modelIds = calls.createModel.map((m) => m.id);
    expect(modelIds).toHaveLength(2);
    expect(modelIds[0]).not.toBe(modelIds[1]);
    expect(modelIds[0]).not.toBe('model-1');
    expect(modelIds[1]).not.toBe('model-2');
  });

  it('imports the build doc with the new project ID', async () => {
    const payload = makePayload();
    const { db, calls } = makeIdbMock();
    await importProjectData(payload as never, db as never);

    expect(calls.putBuildDoc).toHaveLength(1);
    expect(calls.putBuildDoc[0].projectId).toBe(FIXTURE_NEW_PROJECT_ID);
    expect(calls.putBuildDoc[0].title).toBe('Test Project');
  });
});

describe('importProjectFromFile corrupt data', () => {
  it('rejects unversioned gzipped JSON as legacy', async () => {
    const gz = gzipSync(JSON.stringify({ random: 'garbage' }));
    const file = new File([new Uint8Array(gz)], 'bad.cutlist');
    const { db } = makeIdbMock();
    await expect(importProjectFromFile(file, db as never)).rejects.toThrow(
      'older version of Cutlist',
    );
  });

  it('accepts valid gzipped export', async () => {
    const payload = makePayload();
    const gz = gzipSync(JSON.stringify(payload));
    const file = new File([new Uint8Array(gz)], 'valid.cutlist');
    // Atomic import writes to the singleton DB (FR-DUR-4/-5), not the mock.
    await importProjectFromFile(file);
    const db = await getDb();
    expect(await db.projects.count()).toBe(1);
    expect(await db.models.count()).toBe(1);
  });
});

describe('round-trip fidelity', () => {
  it('preserves part overrides through parse -> import', async () => {
    const payload = makePayload();
    payload.models[0].partOverrides = { '1': { grainLock: 'length' } };
    const parsed = parseProjectExport(payload);
    const { db, calls } = makeIdbMock();
    await importProjectData(parsed, db as never);

    expect(calls.createModel[0].partOverrides).toMatchObject({
      '1': { grainLock: 'length' },
    });
  });

  it('preserves stocks and distanceUnit through import', async () => {
    const payload = makePayload();
    payload.project.stocks = [
      {
        kind: 'sheet',
        material: 'Plywood',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
    ];
    payload.project.distanceUnit = 'in';
    const { db, calls } = makeIdbMock();
    await importProjectData(payload as never, db as never);

    const opts = calls.createProject[0].opts as Record<string, unknown>;
    expect(opts.stocks).toEqual(payload.project.stocks);
    expect(opts.distanceUnit).toBe('in');
  });

  it('passes packing settings through to createProject', async () => {
    const payload = makePayload();
    payload.project.bladeWidth = 5;
    payload.project.margin = 2;
    payload.project.defaultAlgorithm = 'cnc';
    payload.project.showPartNumbers = false;
    const { db, calls } = makeIdbMock();
    await importProjectData(payload as never, db as never);

    const opts = calls.createProject[0].opts as Record<string, unknown>;
    expect(opts.bladeWidth).toBe(5);
    expect(opts.margin).toBe(2);
    expect(opts.defaultAlgorithm).toBe('cnc');
    expect(opts.showPartNumbers).toBe(false);
  });

  it('fills defaults when legacy export omits packing settings', () => {
    const payload = makePayload();
    delete (payload.project as Record<string, unknown>).bladeWidth;
    delete (payload.project as Record<string, unknown>).margin;
    delete (payload.project as Record<string, unknown>).defaultAlgorithm;
    delete (payload.project as Record<string, unknown>).showPartNumbers;
    const parsed = parseProjectExport(payload);
    expect(parsed.project.bladeWidth).toBeDefined();
    expect(parsed.project.margin).toBeDefined();
    expect(parsed.project.defaultAlgorithm).toBeDefined();
    expect(parsed.project.showPartNumbers).toBeDefined();
  });

  it('preserves colors and nodePartMap on models', () => {
    const payload = makePayload();
    payload.models[0].colors = [
      { key: '#aaa', rgb: [0.5, 0.5, 0.5], count: 1 },
    ] as never;
    payload.models[0].nodePartMap = [
      { nodeIndex: 0, partNumber: 1, colorHex: '#aaa' },
    ] as never;
    const parsed = parseProjectExport(payload);
    expect(parsed.models[0].colors).toHaveLength(1);
    expect(parsed.models[0].nodePartMap).toHaveLength(1);
  });
});
