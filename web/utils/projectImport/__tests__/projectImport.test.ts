import { describe, expect, it } from 'vitest';
import { gzipSync } from 'node:zlib';
import { SCHEMA_VERSION } from '../../versions';
import {
  importProjectData,
  importProjectFromFile,
  parseProjectExport,
} from '..';

function makePayload() {
  const now = new Date().toISOString();
  return {
    version: SCHEMA_VERSION,
    exportedAt: now,
    project: {
      id: 'old-project-id',
      name: 'Demo',
      colorMap: { '#abc123': 'Plywood' },
      excludedColors: [],
      stock:
        '- material: Plywood\n  unit: mm\n  thickness: [18]\n  sizes: [{ width: 1220, length: 2440 }]\n',
      distanceUnit: 'mm' as const,
      bladeWidth: 3,
      margin: 0,
      optimize: 'Auto' as const,
      showPartNumbers: true,
      createdAt: now,
      updatedAt: now,
    },
    models: [
      {
        id: 'old-model-id',
        projectId: 'old-project-id',
        filename: 'demo.gltf',
        source: 'gltf' as const,
        parts: [],
        enabled: true,
        rawSource: { asset: { version: '2.0' } },
        partOverrides: {},
        createdAt: now,
      },
    ],
    buildDoc: {
      projectId: 'old-project-id',
      title: 'Demo',
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Desc' }] },
        ],
      },
      updatedAt: now,
    },
  };
}

function makeIdbMock() {
  const calls = {
    createProject: [] as any[],
    updateProject: [] as any[],
    createModel: [] as any[],
    putBuildDoc: [] as any[],
    createScene: [] as any[],
    createAnnotation: [] as any[],
    putAsset: [] as any[],
  };
  return {
    calls,
    db: {
      async createProject(name: string, opts?: any) {
        calls.createProject.push({ name, opts });
        return { id: 'new-project-id' };
      },
      async updateProject(id: string, patch: any) {
        calls.updateProject.push({ id, patch });
      },
      async createModel(model: any) {
        calls.createModel.push(model);
      },
      async putBuildDoc(doc: any) {
        calls.putBuildDoc.push(doc);
      },
      async createScene(scene: any) {
        calls.createScene.push(scene);
      },
      async createAnnotation(annotation: any) {
        calls.createAnnotation.push(annotation);
      },
      async putAsset(asset: any) {
        calls.putAsset.push(asset);
      },
    },
  };
}

// ─── Validation ─────────────────────────────────────────────────────────────

describe('parseProjectExport validation', () => {
  it('validates expected shape', () => {
    const parsed = parseProjectExport(makePayload());
    expect(parsed.project.name).toBe('Demo');
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
    delete (payload as any).version;
    expect(() => parseProjectExport(payload)).toThrow(
      'older version of Cutlist',
    );
  });

  it('rejects models with invalid source enum', () => {
    const payload = makePayload();
    (payload.models[0] as any).source = 'invalid';
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
    ] as any;
    expect(() => parseProjectExport(payload)).toThrow('Invalid project file');
  });

  it('rejects build doc with structurally bad fields', () => {
    const payload = makePayload();
    (payload as any).buildDoc = {
      projectId: 'old-project-id',
      title: 'x',
      doc: { type: 'doc', content: [{ type: 'paragraph' }] },
      updatedAt: 42, // should be a string
    };
    expect(() => parseProjectExport(payload)).toThrow('Invalid project file');
  });

  it('rejects rawSource that is not object, string, or null', () => {
    const payload = makePayload();
    (payload.models[0] as any).rawSource = 42;
    expect(() => parseProjectExport(payload)).toThrow('Invalid project file');
  });

  it('accepts rawSource that is a string (COLLADA XML)', () => {
    const payload = makePayload();
    (payload.models[0] as any).rawSource = '<COLLADA>...</COLLADA>';
    (payload.models[0] as any).source = 'collada';
    const parsed = parseProjectExport(payload);
    expect(parsed.models[0].rawSource).toBe('<COLLADA>...</COLLADA>');
  });

  it('accepts model with rawSource: null (manual model)', () => {
    const payload = makePayload();
    (payload.models[0] as any).rawSource = null;
    (payload.models[0] as any).source = 'manual';
    const parsed = parseProjectExport(payload);
    expect(parsed.models[0].rawSource).toBeNull();
  });

  it('provides human-readable error messages with paths', () => {
    const payload = makePayload();
    (payload.project as any).name = 123; // Should be string
    try {
      parseProjectExport(payload);
      expect(true).toBe(false); // Should not reach here
    } catch (e: any) {
      expect(e.message).toContain('Invalid project file');
      // Should mention the path where the error occurred
      expect(e.message).toContain('project');
    }
  });
});

// ─── Import data ────────────────────────────────────────────────────────────

describe('importProjectData', () => {
  it('remaps project/model ids and preserves mapping data', async () => {
    const payload = makePayload();
    const { db, calls } = makeIdbMock();

    const newProjectId = await importProjectData(payload as any, db as any);
    expect(newProjectId).toBe('new-project-id');

    expect(calls.createProject).toHaveLength(1);
    expect(calls.createProject[0].name).toBe('Demo');

    expect(calls.updateProject).toHaveLength(1);
    expect(calls.updateProject[0].id).toBe('new-project-id');
    expect(calls.updateProject[0].patch.colorMap).toEqual({
      '#abc123': 'Plywood',
    });

    expect(calls.createModel).toHaveLength(1);
    expect(calls.createModel[0].projectId).toBe('new-project-id');
    expect(calls.createModel[0].id).not.toBe('old-model-id');

    expect(calls.putBuildDoc).toHaveLength(1);
    expect(calls.putBuildDoc[0].projectId).toBe('new-project-id');
    expect(calls.putBuildDoc[0].title).toBe('Demo');
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

    await importProjectFromFile(file, db as any);
    expect(calls.createProject).toHaveLength(1);
  });

  it('falls back to plain JSON when gzip decode fails', async () => {
    const payload = makePayload();
    const file = new File([JSON.stringify(payload)], 'demo.cutlist', {
      type: 'application/json',
    });
    const { db, calls } = makeIdbMock();

    await importProjectFromFile(file, db as any);
    expect(calls.createProject).toHaveLength(1);
  });

  it('rejects non-JSON content with readable error', async () => {
    const file = new File(['this is not json'], 'bad.cutlist', {
      type: 'text/plain',
    });
    const { db } = makeIdbMock();

    let caught: Error | null = null;
    try {
      await importProjectFromFile(file, db as any);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('Could not parse');
    expect(caught!.message).toContain('.cutlist');
  });

  it('rejects unversioned JSON as legacy with readable error', async () => {
    const file = new File(
      [JSON.stringify({ random: 'garbage' })],
      'bad.cutlist',
    );
    const { db } = makeIdbMock();

    let caught: Error | null = null;
    try {
      await importProjectFromFile(file, db as any);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('older version of Cutlist');
  });

  it('rejects current-version payload missing required fields with a Zod error', async () => {
    const file = new File(
      [JSON.stringify({ version: SCHEMA_VERSION, random: 'garbage' })],
      'bad.cutlist',
    );
    const { db } = makeIdbMock();

    let caught: Error | null = null;
    try {
      await importProjectFromFile(file, db as any);
    } catch (e) {
      caught = e as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught!.message).toContain('Invalid project file');
  });
});

// ─── Round-trip ─────────────────────────────────────────────────────────────

describe('export -> import round-trip', () => {
  it('a valid payload round-trips through parse without error', () => {
    const payload = makePayload();
    const json = JSON.stringify(payload);
    const parsed = JSON.parse(json);
    const validated = parseProjectExport(parsed);

    expect(validated.project.name).toBe('Demo');
    expect(validated.models).toHaveLength(1);
    expect(validated.buildDoc?.title).toBe('Demo');
    expect(validated.buildDoc?.doc.content?.[0]).toMatchObject({
      type: 'paragraph',
      content: [{ type: 'text', text: 'Desc' }],
    });
  });

  it('payload with parts round-trips correctly', () => {
    const payload = makePayload();
    payload.models[0].parts = [
      {
        partNumber: 1,
        instanceNumber: 1,
        name: 'Side Panel',
        colorKey: '#abc123',
        size: { width: 0.5, length: 1.2, thickness: 0.018 },
      },
      {
        partNumber: 1,
        instanceNumber: 2,
        name: 'Side Panel',
        colorKey: '#abc123',
        size: { width: 0.5, length: 1.2, thickness: 0.018 },
      },
    ] as any;

    const json = JSON.stringify(payload);
    const validated = parseProjectExport(JSON.parse(json));
    expect(validated.models[0].parts).toHaveLength(2);
  });
});
