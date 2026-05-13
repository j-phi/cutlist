import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { SCHEMA_VERSION } from '../../versions';
import {
  importProjectData,
  importProjectFromFile,
  parseProjectExport,
} from '..';
import {
  makePayload,
  makeIdbMock,
  FIXTURE_MODEL_ID,
  FIXTURE_NEW_PROJECT_ID,
} from './_helpers';

// ─── Validation ─────────────────────────────────────────────────────────────

describe('parseProjectExport validation', () => {
  it('validates expected shape', () => {
    const parsed = parseProjectExport(makePayload());
    expect(parsed.project.name).toBe('Test Project');
    expect(parsed.models).toHaveLength(1);
  });

  it('rejects non-object input', () => {
    expect(() => parseProjectExport('not an object')).toThrow(
      'expected a JSON object',
    );
    expect(() => parseProjectExport(null)).toThrow('expected a JSON object');
    expect(() => parseProjectExport(42)).toThrow('expected a JSON object');
  });

  it('rejects missing project field', () => {
    expect(() =>
      parseProjectExport({ version: SCHEMA_VERSION, models: [] }),
    ).toThrow('Invalid project file');
  });

  it('Should reject an empty project name with a human-readable message', () => {
    const payload = makePayload();
    payload.project.name = '';
    expect(() => parseProjectExport(payload)).toThrow(
      'Project name cannot be empty',
    );
  });

  it('rejects payloads missing the version field as legacy', () => {
    const payload = makePayload();
    delete (payload as { version?: number }).version;
    expect(() => parseProjectExport(payload)).toThrow(
      'older version of Cutlist',
    );
  });

  it('rejects models with invalid source enum', () => {
    const payload = makePayload();
    (payload.models[0] as Record<string, unknown>).source = 'invalid';
    expect(() => parseProjectExport(payload)).toThrow('Invalid project file');
  });

  it('rejects parts with invalid size (non-finite number)', () => {
    const payload = makePayload();
    payload.models[0].parts = [
      {
        partNumber: 1,
        instanceNumber: 1,
        name: 'Bad Part',
        colorKey: '#fff',
        size: { width: Infinity, length: 0.1, thickness: 0.018 },
      },
    ] as never;
    expect(() => parseProjectExport(payload)).toThrow('Invalid project file');
  });

  it('rejects build doc with structurally bad fields', () => {
    const payload = makePayload();
    (payload as Record<string, unknown>).buildDoc = {
      projectId: 'proj-1',
      title: 'x',
      doc: { type: 'doc', content: [{ type: 'paragraph' }] },
      updatedAt: 42, // should be a string
    };
    expect(() => parseProjectExport(payload)).toThrow('Invalid project file');
  });

  it('rejects rawSource that is not object, string, or null', () => {
    const payload = makePayload();
    (payload.models[0] as Record<string, unknown>).rawSource = 42;
    expect(() => parseProjectExport(payload)).toThrow('Invalid project file');
  });

  it('accepts rawSource that is a string (COLLADA XML)', () => {
    const payload = makePayload();
    (payload.models[0] as Record<string, unknown>).rawSource =
      '<COLLADA>...</COLLADA>';
    (payload.models[0] as Record<string, unknown>).source = 'assimp';
    const parsed = parseProjectExport(payload);
    expect(parsed.models[0].rawSource).toBe('<COLLADA>...</COLLADA>');
  });

  it('accepts model with rawSource: null (manual model)', () => {
    const payload = makePayload();
    (payload.models[0] as Record<string, unknown>).rawSource = null;
    (payload.models[0] as Record<string, unknown>).source = 'manual';
    const parsed = parseProjectExport(payload);
    expect(parsed.models[0].rawSource).toBeNull();
  });

  it('provides human-readable error messages with paths', () => {
    const payload = makePayload();
    (payload.project as Record<string, unknown>).name = 123;
    try {
      parseProjectExport(payload);
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as Error;
      expect(err.message).toContain('Invalid project file');
      expect(err.message).toContain('project');
    }
  });
});

// ─── Import data ────────────────────────────────────────────────────────────

describe('importProjectData', () => {
  it('remaps project/model ids and preserves mapping data', async () => {
    const payload = makePayload();
    const { db, calls } = makeIdbMock();

    const newProjectId = await importProjectData(payload as never, db as never);
    expect(newProjectId).toBe(FIXTURE_NEW_PROJECT_ID);

    expect(calls.createProject).toHaveLength(1);
    expect(calls.createProject[0].name).toBe('Test Project');

    expect(calls.updateProject).toHaveLength(1);
    expect(calls.updateProject[0].id).toBe(FIXTURE_NEW_PROJECT_ID);
    expect(calls.updateProject[0].patch.colorMap).toEqual({
      '#abc123': 'Plywood',
    });

    expect(calls.createModel).toHaveLength(1);
    expect(calls.createModel[0].projectId).toBe(FIXTURE_NEW_PROJECT_ID);
    expect(calls.createModel[0].id).not.toBe(FIXTURE_MODEL_ID);

    expect(calls.putBuildDoc).toHaveLength(1);
    expect(calls.putBuildDoc[0].projectId).toBe(FIXTURE_NEW_PROJECT_ID);
    expect(calls.putBuildDoc[0].title).toBe('Test Project');
    expect(calls.putBuildDoc[0].doc).toMatchObject({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Desc' }] },
      ],
    });
  });
});

// ─── File import (gzip + fallback) ─────────────────────────────────────────

describe('importProjectFromFile', () => {
  it('supports gzipped input', async () => {
    const payload = makePayload();
    const gz = gzipSync(JSON.stringify(payload));
    const file = new File([new Uint8Array(gz)], 'demo.cutlist', {
      type: 'application/gzip',
    });
    const { db, calls } = makeIdbMock();
    await importProjectFromFile(file, db as never);
    expect(calls.createProject).toHaveLength(1);
  });

  it('falls back to plain JSON when gzip decode fails', async () => {
    const payload = makePayload();
    const file = new File([JSON.stringify(payload)], 'demo.cutlist', {
      type: 'application/json',
    });
    const { db, calls } = makeIdbMock();
    await importProjectFromFile(file, db as never);
    expect(calls.createProject).toHaveLength(1);
  });

  it('rejects non-JSON content with readable error', async () => {
    const file = new File(['this is not json'], 'bad.cutlist', {
      type: 'text/plain',
    });
    const { db } = makeIdbMock();
    await expect(importProjectFromFile(file, db as never)).rejects.toThrow(
      /Could not parse.*\.cutlist/,
    );
  });

  it('rejects unversioned JSON as legacy with readable error', async () => {
    const file = new File(
      [JSON.stringify({ random: 'garbage' })],
      'bad.cutlist',
    );
    const { db } = makeIdbMock();
    await expect(importProjectFromFile(file, db as never)).rejects.toThrow(
      'older version of Cutlist',
    );
  });

  it('rejects current-version payload missing required fields with a Zod error', async () => {
    const file = new File(
      [JSON.stringify({ version: SCHEMA_VERSION, random: 'garbage' })],
      'bad.cutlist',
    );
    const { db } = makeIdbMock();
    await expect(importProjectFromFile(file, db as never)).rejects.toThrow(
      'Invalid project file',
    );
  });
});
