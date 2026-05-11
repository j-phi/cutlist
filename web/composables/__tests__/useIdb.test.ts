import { describe, expect, it } from 'vitest';
import { useIdb, applyModelDefaults } from '../useIdb';
import { resetDatabase } from '../useIdb/db';
import { DEFAULT_SETTINGS } from '../../utils/settings';
import type { IdbModel, IdbBuildDoc } from '../useIdb';

const idb = useIdb();

// ─── Projects ───────────────────────────────────────────────────────────────

describe('project CRUD', () => {
  it('creates a project with the supplied name and seeded defaults', async () => {
    const project = await idb.createProject('Test Project');
    expect(project).toMatchObject({
      name: 'Test Project',
      colorMap: {},
      excludedColors: [],
      stock: '',
      distanceUnit: DEFAULT_SETTINGS.distanceUnit,
      bladeWidth: DEFAULT_SETTINGS.bladeWidth,
      margin: DEFAULT_SETTINGS.margin,
      defaultAlgorithm: DEFAULT_SETTINGS.defaultAlgorithm,
      showPartNumbers: DEFAULT_SETTINGS.showPartNumbers,
    });
    expect(project.id).toBeDefined();
  });

  it('creates a project with custom options', async () => {
    const project = await idb.createProject('Imperial', {
      stock: 'custom yaml',
      distanceUnit: 'in',
      bladeWidth: 7,
      margin: 1,
      defaultAlgorithm: 'cnc',
      showPartNumbers: false,
    });
    expect(project.stock).toBe('custom yaml');
    expect(project.distanceUnit).toBe('in');
    expect(project.bladeWidth).toBe(7);
    expect(project.margin).toBe(1);
    expect(project.defaultAlgorithm).toBe('cnc');
    expect(project.showPartNumbers).toBe(false);
  });

  it('updateProject accepts packing settings fields', async () => {
    const project = await idb.createProject('Packing patch');
    const updated = await idb.updateProject(project.id, {
      bladeWidth: 4,
      margin: 2,
      defaultAlgorithm: 'cnc',
      showPartNumbers: false,
    });
    expect(updated.bladeWidth).toBe(4);
    expect(updated.margin).toBe(2);
    expect(updated.defaultAlgorithm).toBe('cnc');
    expect(updated.showPartNumbers).toBe(false);
  });

  it('getAllProjectsByRecency includes created projects, newest first', async () => {
    const a = await idb.createProject('First');
    // Force a measurable updatedAt gap — ISO-second resolution on some clocks.
    await new Promise((r) => setTimeout(r, 5));
    const b = await idb.createProject('Second');
    const list = await idb.getAllProjectsByRecency();
    expect(list).toHaveLength(2);
    // Newest first.
    expect(list[0].id).toBe(b.id);
    expect(list[1].id).toBe(a.id);
  });

  it('getProjectWithModels returns project with empty models array', async () => {
    const project = await idb.createProject('WithModels');
    const result = await idb.getProjectWithModels(project.id);
    expect(result).toBeDefined();
    expect(result!.name).toBe('WithModels');
    expect(result!.models).toEqual([]);
  });

  it('getProjectWithModels returns undefined for nonexistent id', async () => {
    const result = await idb.getProjectWithModels('nonexistent');
    expect(result).toBeUndefined();
  });

  it('updates a project and bumps updatedAt', async () => {
    const project = await idb.createProject('Original');
    const updated = await idb.updateProject(project.id, {
      name: 'Renamed',
      distanceUnit: 'in',
    });
    expect(updated.name).toBe('Renamed');
    expect(updated.distanceUnit).toBe('in');
    expect(updated.updatedAt >= project.updatedAt).toBe(true);
  });

  it('updateProject throws for nonexistent id', async () => {
    expect(idb.updateProject('nonexistent', { name: 'X' })).rejects.toThrow(
      'not found',
    );
  });

  it('deleteProject removes project and cascades to models and buildDoc', async () => {
    const project = await idb.createProject('ToDelete');
    const model: IdbModel = {
      id: crypto.randomUUID(),
      projectId: project.id,
      filename: 'test.glb',
      source: 'gltf',
      parts: [],
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: { mock: true },
      partOverrides: {},
      createdAt: new Date().toISOString(),
    };
    await idb.createModel(model);
    await idb.putBuildDoc({
      projectId: project.id,
      title: 'ToDelete',
      doc: { type: 'doc', content: [{ type: 'paragraph' }] },
      updatedAt: new Date().toISOString(),
    });

    await idb.deleteProject(project.id);

    const result = await idb.getProjectWithModels(project.id);
    expect(result).toBeUndefined();
    const doc = await idb.getBuildDoc(project.id);
    expect(doc).toBeUndefined();
  });
});

// ─── Models ─────────────────────────────────────────────────────────────────

describe('model CRUD', () => {
  it('creates a model and retrieves it via getProjectWithModels', async () => {
    const project = await idb.createProject('ModelProject');
    const model: IdbModel = {
      id: crypto.randomUUID(),
      projectId: project.id,
      filename: 'cabinet.glb',
      source: 'gltf',
      parts: [
        {
          name: 'Side Panel',
          partNumber: 1,
          instanceNumber: 1,
          colorKey: '#aaa',
          size: {
            width: 0.5,
            length: 0.8,
            thickness: 0.018,
          },
        },
      ],
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: { scenes: [] },
      partOverrides: { 1: { grainLock: 'length' } },
      createdAt: new Date().toISOString(),
    };
    await idb.createModel(model);

    const result = await idb.getProjectWithModels(project.id);
    expect(result!.models).toHaveLength(1);
    expect(result!.models[0].filename).toBe('cabinet.glb');
    expect(result!.models[0].partOverrides).toEqual({
      1: { grainLock: 'length' },
    });
    // rawSource should be stripped from meta
    expect((result!.models[0] as any).rawSource).toBeUndefined();
  });

  it('getModelRawSource returns the raw source', async () => {
    const project = await idb.createProject('GltfProject');
    const gltf = { asset: { version: '2.0' }, scenes: [{}] };
    const model: IdbModel = {
      id: crypto.randomUUID(),
      projectId: project.id,
      filename: 'box.glb',
      source: 'gltf',
      parts: [],
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: gltf,
      partOverrides: {},
      createdAt: new Date().toISOString(),
    };
    await idb.createModel(model);

    const result = await idb.getModelRawSource(model.id);
    expect(result).toEqual(gltf);
  });

  it('getModelRawSource returns null for nonexistent model', async () => {
    const result = await idb.getModelRawSource('nonexistent');
    expect(result).toBeNull();
  });

  it('updates model fields', async () => {
    const project = await idb.createProject('UpdateModel');
    const model: IdbModel = {
      id: crypto.randomUUID(),
      projectId: project.id,
      filename: 'shelf.glb',
      source: 'gltf',
      parts: [],
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: null,
      partOverrides: {},
      createdAt: new Date().toISOString(),
    };
    await idb.createModel(model);

    await idb.updateModel(model.id, {
      enabled: false,
      partOverrides: { 1: { grainLock: 'width' } },
    });
    await idb.flushPendingModelWrites();

    const result = await idb.getProjectWithModels(project.id);
    expect(result!.models[0].enabled).toBe(false);
    expect(result!.models[0].partOverrides).toEqual({
      1: { grainLock: 'width' },
    });
  });

  it('updateModel throws for nonexistent id', async () => {
    await idb.updateModel('nonexistent', { enabled: false });
    expect(idb.flushPendingModelWrites()).rejects.toThrow('not found');
  });

  it('deleteModel removes model, project still exists', async () => {
    const project = await idb.createProject('DeleteModel');
    const model: IdbModel = {
      id: crypto.randomUUID(),
      projectId: project.id,
      filename: 'gone.glb',
      source: 'gltf',
      parts: [],
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: null,
      partOverrides: {},
      createdAt: new Date().toISOString(),
    };
    await idb.createModel(model);
    await idb.deleteModel(model.id);

    const result = await idb.getProjectWithModels(project.id);
    expect(result).toBeDefined();
    expect(result!.models).toHaveLength(0);
  });

  it('applyModelDefaults fills missing fields on partial record', () => {
    const bare = {
      id: 'x',
      projectId: 'p',
      filename: 'f.glb',
      parts: [],
      createdAt: '',
    };
    const result = applyModelDefaults(bare);
    expect(result.source).toBe('gltf');
    expect(result.enabled).toBe(true);
    expect(result.partOverrides).toEqual({});
  });
});

// ─── Build Steps ────────────────────────────────────────────────────────────

describe('build doc', () => {
  function emptyDoc() {
    return { type: 'doc', content: [{ type: 'paragraph' }] };
  }

  function makeDoc(
    projectId: string,
    overrides: Partial<IdbBuildDoc> = {},
  ): IdbBuildDoc {
    return {
      projectId,
      title: '',
      doc: emptyDoc(),
      updatedAt: new Date().toISOString(),
      ...overrides,
    };
  }

  it('returns undefined for a project without a doc', async () => {
    const project = await idb.createProject('NoDoc');
    const doc = await idb.getBuildDoc(project.id);
    expect(doc).toBeUndefined();
  });

  it('persists and reads back the doc body with embed nodes', async () => {
    const project = await idb.createProject('DocProj');
    const docJson = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] },
        { type: 'imageBlock', attrs: { assetId: 'asset-x', caption: 'pic' } },
        {
          type: 'sceneBlock',
          attrs: { modelId: 'm1', sceneId: 's1', caption: '' },
        },
      ],
    };
    await idb.putBuildDoc(
      makeDoc(project.id, { doc: docJson, title: 'Build' }),
    );

    const stored = await idb.getBuildDoc(project.id);
    expect(stored).toBeDefined();
    expect(stored!.title).toBe('Build');
    expect(stored!.doc).toEqual(docJson);
  });

  it('putBuildDoc replaces records on the same projectId', async () => {
    const project = await idb.createProject('DocReplace');
    await idb.putBuildDoc(makeDoc(project.id, { title: 'old' }));
    await idb.putBuildDoc(makeDoc(project.id, { title: 'new' }));
    const stored = await idb.getBuildDoc(project.id);
    expect(stored!.title).toBe('new');
  });

  it('deleteBuildDoc removes the record', async () => {
    const project = await idb.createProject('DocDelete');
    await idb.putBuildDoc(makeDoc(project.id));
    await idb.deleteBuildDoc(project.id);
    expect(await idb.getBuildDoc(project.id)).toBeUndefined();
  });

  it('hydrates a partial record (missing title / doc) with defaults', async () => {
    const project = await idb.createProject('PartialDoc');
    // Simulate a record written before today's fields were required.
    const partial = { projectId: project.id } as unknown as IdbBuildDoc;
    await idb.putBuildDoc(partial);
    const stored = await idb.getBuildDoc(project.id);
    expect(stored!.title).toBe('');
    expect(stored!.doc).toEqual(emptyDoc());
  });
});

// ─── Assets ────────────────────────────────────────────────────────────────

describe('assets', () => {
  function makeBlob(text: string): Blob {
    return new Blob([new TextEncoder().encode(text)], { type: 'image/png' });
  }

  it('persists asset record fields and returns the blob handle', async () => {
    const project = await idb.createProject('AssetProj');
    const asset = await idb.createAsset({
      projectId: project.id,
      mimeType: 'image/png',
      blob: makeBlob('hello'),
    });
    const fetched = await idb.getAsset(asset.id);
    expect(fetched).toBeDefined();
    expect(fetched!.mimeType).toBe('image/png');
    expect(fetched!.projectId).toBe(project.id);
    expect(fetched!.blob).toBeDefined();
  });

  it('deleteProject cascades into the assets table', async () => {
    const project = await idb.createProject('CascadeAsset');
    const asset = await idb.createAsset({
      projectId: project.id,
      mimeType: 'image/png',
      blob: makeBlob('bytes'),
    });
    await idb.deleteProject(project.id);
    expect(await idb.getAsset(asset.id)).toBeUndefined();
  });

  it('getAssetsForProject returns all assets for a project, none for others', async () => {
    const p1 = await idb.createProject('Q1');
    const p2 = await idb.createProject('Q2');
    await idb.createAsset({
      projectId: p1.id,
      mimeType: 'image/png',
      blob: makeBlob('a'),
    });
    await idb.createAsset({
      projectId: p1.id,
      mimeType: 'image/png',
      blob: makeBlob('b'),
    });
    await idb.createAsset({
      projectId: p2.id,
      mimeType: 'image/png',
      blob: makeBlob('c'),
    });
    expect(await idb.getAssetsForProject(p1.id)).toHaveLength(2);
    expect(await idb.getAssetsForProject(p2.id)).toHaveLength(1);
  });

  it('deleteAssets removes the listed ids and leaves the rest alone', async () => {
    const project = await idb.createProject('Sweep');
    const keep = await idb.createAsset({
      projectId: project.id,
      mimeType: 'image/png',
      blob: makeBlob('keep'),
    });
    const drop1 = await idb.createAsset({
      projectId: project.id,
      mimeType: 'image/png',
      blob: makeBlob('drop1'),
    });
    const drop2 = await idb.createAsset({
      projectId: project.id,
      mimeType: 'image/png',
      blob: makeBlob('drop2'),
    });

    await idb.deleteAssets([drop1.id, drop2.id]);

    expect(await idb.getAsset(keep.id)).toBeDefined();
    expect(await idb.getAsset(drop1.id)).toBeUndefined();
    expect(await idb.getAsset(drop2.id)).toBeUndefined();
  });

  it('deleteAssets is a no-op for an empty list', async () => {
    const project = await idb.createProject('Noop');
    const asset = await idb.createAsset({
      projectId: project.id,
      mimeType: 'image/png',
      blob: makeBlob('still here'),
    });
    await idb.deleteAssets([]);
    expect(await idb.getAsset(asset.id)).toBeDefined();
  });
});

// ─── Reset database ────────────────────────────────────────────────────────

describe('resetDatabase', () => {
  it('wipes all projects, models, and the build doc', async () => {
    const project = await idb.createProject('WipeMe');
    const model: IdbModel = {
      id: crypto.randomUUID(),
      projectId: project.id,
      filename: 'test.glb',
      source: 'gltf',
      parts: [],
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: null,
      partOverrides: {},
      createdAt: new Date().toISOString(),
    };
    await idb.createModel(model);
    await idb.putBuildDoc({
      projectId: project.id,
      title: 'WipeMe',
      doc: { type: 'doc', content: [{ type: 'paragraph' }] },
      updatedAt: new Date().toISOString(),
    });

    await resetDatabase();

    // After reset, the DB is deleted. A fresh useIdb() call should see
    // empty tables once the DB is re-created on first access.
    const freshIdb = useIdb();
    const projects = await freshIdb.getAllProjectsByRecency();
    expect(projects).toHaveLength(0);
    const doc = await freshIdb.getBuildDoc(project.id);
    expect(doc).toBeUndefined();
  });
});
