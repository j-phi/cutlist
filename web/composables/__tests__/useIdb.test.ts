import { describe, expect, it } from 'vitest';
import { useIdb, applyModelDefaults } from '../useIdb';
import { resetDatabase } from '../useIdb/db';
import { DEFAULT_SETTINGS } from '../../utils/settings';
import type { IdbModel, IdbBuildDoc } from '../useIdb';

const idb = useIdb();

// ─── Projects ───────────────────────────────────────────────────────────────

describe('project CRUD', () => {
  it('creates a project and returns it with defaults', async () => {
    const project = await idb.createProject('Test Project');
    expect(project.id).toBeDefined();
    expect(project.name).toBe('Test Project');
    expect(project.colorMap).toEqual({});
    expect(project.excludedColors).toEqual([]);
    expect(project.stock).toBe('');
    expect(project.distanceUnit).toBe(DEFAULT_SETTINGS.distanceUnit);
    expect(project.bladeWidth).toBe(DEFAULT_SETTINGS.bladeWidth);
    expect(project.margin).toBe(DEFAULT_SETTINGS.margin);
    expect(project.optimize).toBe(DEFAULT_SETTINGS.optimize);
    expect(project.showPartNumbers).toBe(DEFAULT_SETTINGS.showPartNumbers);
    expect(project.createdAt).toBeDefined();
    expect(project.updatedAt).toBeDefined();
    expect(project.archivedAt).toBeUndefined();
  });

  it('creates a project with custom options', async () => {
    const project = await idb.createProject('Imperial', {
      stock: 'custom yaml',
      distanceUnit: 'in',
      bladeWidth: 7,
      margin: 1,
      optimize: 'CNC',
      showPartNumbers: false,
    });
    expect(project.stock).toBe('custom yaml');
    expect(project.distanceUnit).toBe('in');
    expect(project.bladeWidth).toBe(7);
    expect(project.margin).toBe(1);
    expect(project.optimize).toBe('CNC');
    expect(project.showPartNumbers).toBe(false);
  });

  it('updateProject accepts packing settings fields', async () => {
    const project = await idb.createProject('Packing patch');
    const updated = await idb.updateProject(project.id, {
      bladeWidth: 4,
      margin: 2,
      optimize: 'CNC',
      showPartNumbers: false,
    });
    expect(updated.bladeWidth).toBe(4);
    expect(updated.margin).toBe(2);
    expect(updated.optimize).toBe('CNC');
    expect(updated.showPartNumbers).toBe(false);
  });

  it('getProjectList includes created projects', async () => {
    const a = await idb.createProject('First');
    const b = await idb.createProject('Second');
    const list = await idb.getProjectList();
    expect(list).toHaveLength(2);
    const ids = list.map((p) => p.id);
    expect(ids).toContain(a.id);
    expect(ids).toContain(b.id);
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
    await idb.updateBuildDoc(project.id, { html: '<p>Do something</p>' });

    await idb.deleteProject(project.id);

    const result = await idb.getProjectWithModels(project.id);
    expect(result).toBeUndefined();
    const doc = await idb.getBuildDoc(project.id);
    expect(doc).toBeUndefined();
  });
});

// ─── Archive / Unarchive ────────────────────────────────────────────────────

describe('archive and unarchive', () => {
  it('archiveProject removes from active list, appears in archived list', async () => {
    const project = await idb.createProject('Archivable');
    await idb.archiveProject(project.id);

    const active = await idb.getProjectList();
    expect(active.find((p) => p.id === project.id)).toBeUndefined();

    const archived = await idb.getArchivedList();
    const found = archived.find((p) => p.id === project.id);
    expect(found).toBeDefined();
    expect(found!.archivedAt).toBeDefined();
  });

  it('unarchiveProject restores to active list', async () => {
    const project = await idb.createProject('Restorable');
    await idb.archiveProject(project.id);
    await idb.unarchiveProject(project.id);

    const active = await idb.getProjectList();
    expect(active.find((p) => p.id === project.id)).toBeDefined();

    const archived = await idb.getArchivedList();
    expect(archived.find((p) => p.id === project.id)).toBeUndefined();
  });

  it('archiveProject throws for nonexistent id', async () => {
    expect(idb.archiveProject('nonexistent')).rejects.toThrow('not found');
  });

  it('unarchiveProject throws for nonexistent id', async () => {
    expect(idb.unarchiveProject('nonexistent')).rejects.toThrow('not found');
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
  it('returns undefined for a project without a doc', async () => {
    const project = await idb.createProject('NoDoc');
    const doc = await idb.getBuildDoc(project.id);
    expect(doc).toBeUndefined();
  });

  it('persists and reads back the doc html', async () => {
    const project = await idb.createProject('DocProj');
    const html =
      '<p>Hi</p><image-block data-asset-id="asset-x" data-caption="pic"></image-block>' +
      '<scene-block data-model-id="m1" data-scene-id="s1"></scene-block>';
    await idb.updateBuildDoc(project.id, { html });

    const doc = await idb.getBuildDoc(project.id);
    expect(doc).toBeDefined();
    expect(doc!.html).toBe(html);
  });

  it('updateBuildDoc replaces fields atomically', async () => {
    const project = await idb.createProject('DocReplace');
    await idb.updateBuildDoc(project.id, { html: '<p>old</p>' });
    await idb.updateBuildDoc(project.id, { html: '<p>new</p>' });
    const doc = await idb.getBuildDoc(project.id);
    expect(doc!.html).toBe('<p>new</p>');
  });

  it('putBuildDoc round-trips an explicit record', async () => {
    const project = await idb.createProject('DocPut');
    const written: IdbBuildDoc = {
      projectId: project.id,
      html: '<p>x</p>',
      updatedAt: new Date('2026-01-01').toISOString(),
    };
    await idb.putBuildDoc(written);
    const fetched = await idb.getBuildDoc(project.id);
    expect(fetched).toMatchObject({ projectId: project.id, html: '<p>x</p>' });
  });

  it('deleteBuildDoc removes the record', async () => {
    const project = await idb.createProject('DocDelete');
    await idb.updateBuildDoc(project.id, { html: '<p>x</p>' });
    await idb.deleteBuildDoc(project.id);
    expect(await idb.getBuildDoc(project.id)).toBeUndefined();
  });

  it('hydrates a partial record (missing html field) with empty string', async () => {
    const project = await idb.createProject('PartialDoc');
    // Bypass the typed updateBuildDoc to simulate a record written
    // before the html field existed — the defaults helper must fill in.
    const partial = { projectId: project.id } as unknown as IdbBuildDoc;
    await idb.putBuildDoc(partial);
    const doc = await idb.getBuildDoc(project.id);
    expect(doc!.html).toBe('');
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
    await idb.updateBuildDoc(project.id, { html: '<p></p>' });

    await resetDatabase();

    // After reset, the DB is deleted. A fresh useIdb() call should see
    // empty tables once the DB is re-created on first access.
    const freshIdb = useIdb();
    const projects = await freshIdb.getProjectList();
    expect(projects).toHaveLength(0);
    const archived = await freshIdb.getArchivedList();
    expect(archived).toHaveLength(0);
    const doc = await freshIdb.getBuildDoc(project.id);
    expect(doc).toBeUndefined();
  });
});
