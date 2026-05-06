/**
 * Tests for useExportProject — the data-building half of the export flow.
 *
 * `exportProject` itself touches `document.createElement`/`URL.createObjectURL`
 * to trigger a download, which is hard to assert on usefully. Instead we
 * exercise `buildExportData`, the testable helper that gathers the project,
 * its models (with rawSource), and build steps into a `ProjectExport` payload,
 * and verify it round-trips cleanly through `parseProjectExport`.
 */
import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import {
  buildExportData,
  exportFilename,
  type ProjectExportDb,
} from '../useExportProject';
import { useIdb, type IdbBuildDoc, type IdbModel } from '../useIdb';
import { parseProjectExport } from '~/utils/projectImport';
import { SCHEMA_VERSION } from '~/utils/versions';
import type { Part } from '~/utils/modelTypes';

function docWithText(text: string): JSONContent {
  return {
    type: 'doc',
    content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
  };
}

async function writeBuildDoc(
  idb: ReturnType<typeof useIdb>,
  projectId: string,
  doc: JSONContent,
  title = '',
): Promise<void> {
  const record: IdbBuildDoc = {
    projectId,
    title,
    doc,
    updatedAt: new Date().toISOString(),
  };
  await idb.putBuildDoc(record);
}

const idb = useIdb();

function makePart(partNumber: number, overrides?: Partial<Part>): Part {
  return {
    partNumber,
    instanceNumber: 1,
    name: `Part ${partNumber}`,
    colorKey: '#aaa',
    size: { width: 0.3, length: 0.5, thickness: 0.018 },
    ...overrides,
  };
}

// ─── buildExportData ────────────────────────────────────────────────────────

describe('buildExportData', () => {
  it('returns null when the project does not exist', async () => {
    const data = await buildExportData(idb, 'nonexistent');
    expect(data).toBeNull();
  });

  it('builds a payload with SCHEMA_VERSION and project fields', async () => {
    const project = await idb.createProject('Cabinet', {
      stock: 'plywood',
      distanceUnit: 'in',
      bladeWidth: 4,
      margin: 1,
      optimize: 'CNC',
      showPartNumbers: false,
    });
    await idb.updateProject(project.id, {
      colorMap: { red: 'PLY18' },
      excludedColors: ['blue'],
    });

    const data = await buildExportData(idb, project.id);
    expect(data).not.toBeNull();
    expect(data!.version).toBe(SCHEMA_VERSION);
    expect(data!.exportedAt).toBeTruthy();
    expect(data!.project.id).toBe(project.id);
    expect(data!.project.name).toBe('Cabinet');
    expect(data!.project.stock).toBe('plywood');
    expect(data!.project.distanceUnit).toBe('in');
    expect(data!.project.bladeWidth).toBe(4);
    expect(data!.project.margin).toBe(1);
    expect(data!.project.optimize).toBe('CNC');
    expect(data!.project.showPartNumbers).toBe(false);
    expect(data!.project.colorMap).toEqual({ red: 'PLY18' });
    expect(data!.project.excludedColors).toEqual(['blue']);
    expect(data!.models).toEqual([]);
    expect(data!.buildDoc).toBeUndefined();
  });

  it('rehydrates rawSource onto each exported model', async () => {
    const project = await idb.createProject('WithModels');

    const gltfRaw = { asset: { version: '2.0' }, scenes: [{}] };
    const gltfModel: IdbModel = {
      id: crypto.randomUUID(),
      projectId: project.id,
      filename: 'cabinet.glb',
      source: 'gltf',
      parts: [makePart(1)],
      colors: [{ key: '#fff', rgb: [1, 1, 1], count: 1 }],
      nodePartMap: [{ nodeIndex: 0, partNumber: 1, colorHex: '#fff' }],
      enabled: true,
      rawSource: gltfRaw,
      partOverrides: { 1: { grainLock: 'length' } },
      createdAt: new Date().toISOString(),
    };
    const manualModel: IdbModel = {
      id: crypto.randomUUID(),
      projectId: project.id,
      filename: 'Manual Parts',
      source: 'manual',
      parts: [makePart(2)],
      colors: [],
      nodePartMap: [],
      enabled: true,
      rawSource: null,
      partOverrides: {},
      createdAt: new Date().toISOString(),
    };
    await idb.createModel(gltfModel);
    await idb.createModel(manualModel);

    const data = await buildExportData(idb, project.id);
    expect(data!.models).toHaveLength(2);

    const exportedGltf = data!.models.find((m) => m.id === gltfModel.id)!;
    expect(exportedGltf.rawSource).toEqual(gltfRaw);
    expect(exportedGltf.parts).toHaveLength(1);
    expect(exportedGltf.partOverrides).toEqual({ 1: { grainLock: 'length' } });

    const exportedManual = data!.models.find((m) => m.id === manualModel.id)!;
    expect(exportedManual.rawSource).toBeNull();
  });

  it('includes the build doc with its body intact', async () => {
    const project = await idb.createProject('WithDoc');
    const doc = docWithText('Cut all parts');
    await writeBuildDoc(idb, project.id, doc, 'My build');

    const data = await buildExportData(idb, project.id);
    expect(data!.buildDoc).toBeDefined();
    expect(data!.buildDoc!.title).toBe('My build');
    expect(data!.buildDoc!.doc).toEqual(doc);
  });

  it('round-trips through parseProjectExport (schema-valid)', async () => {
    const project = await idb.createProject('RoundTrip');
    const model: IdbModel = {
      id: crypto.randomUUID(),
      projectId: project.id,
      filename: 'cabinet.glb',
      source: 'gltf',
      parts: [makePart(1, { grainLock: 'length' })],
      colors: [{ key: '#fff', rgb: [1, 1, 1], count: 1 }],
      nodePartMap: [{ nodeIndex: 0, partNumber: 1, colorHex: '#fff' }],
      enabled: true,
      rawSource: { scenes: [], nodes: [] },
      partOverrides: { 1: { name: 'Renamed' } },
      createdAt: new Date().toISOString(),
    };
    await idb.createModel(model);
    const doc = docWithText('Do thing');
    await writeBuildDoc(idb, project.id, doc, 'Round Trip');

    const data = await buildExportData(idb, project.id);
    // Going through JSON drops `undefined` fields and proves serialisability.
    const json = JSON.parse(JSON.stringify(data));
    const parsed = parseProjectExport(json);

    expect(parsed.version).toBe(SCHEMA_VERSION);
    expect(parsed.project.name).toBe('RoundTrip');
    expect(parsed.models).toHaveLength(1);
    expect(parsed.models[0].rawSource).toEqual({ scenes: [], nodes: [] });
    expect(parsed.models[0].partOverrides).toEqual({ 1: { name: 'Renamed' } });
    expect(parsed.buildDoc).toBeDefined();
    expect(parsed.buildDoc!.title).toBe('Round Trip');
    expect(parsed.buildDoc!.doc).toEqual(doc);
  });

  // The orphan-asset filter sits inside `buildExportData`, but happy-dom
  // can't round-trip a real Blob through fake-indexeddb (structuredClone
  // drops the bytes), so we feed a hand-rolled `ProjectExportDb` with
  // synthetic blobs that survive the base64 encode path.
  function makeExportFakeDb(opts: {
    projectId: string;
    doc: JSONContent | null;
    assets: { id: string; bytes: string }[];
  }): ProjectExportDb {
    const now = new Date().toISOString();
    return {
      getProjectWithModels: async () => ({
        id: opts.projectId,
        name: 'Fake',
        colorMap: {},
        excludedColors: [],
        stock: '',
        distanceUnit: 'in' as const,
        bladeWidth: 3,
        margin: 0,
        optimize: 'Auto' as const,
        showPartNumbers: true,
        createdAt: now,
        updatedAt: now,
        models: [],
      }),
      getModelRawSource: async () => null,
      getBuildDoc: async () =>
        opts.doc
          ? {
              projectId: opts.projectId,
              title: 'Fake',
              doc: opts.doc,
              updatedAt: now,
            }
          : undefined,
      getScenesForModel: async () => [],
      getAnnotationsForProject: async () => [],
      getAssetsForProject: async () =>
        opts.assets.map((a) => ({
          id: a.id,
          projectId: opts.projectId,
          mimeType: 'image/png',
          blob: new Blob([new TextEncoder().encode(a.bytes)], {
            type: 'image/png',
          }),
          createdAt: now,
        })),
    };
  }

  it('omits assets the build doc no longer references', async () => {
    const fakeDb = makeExportFakeDb({
      projectId: 'p1',
      doc: {
        type: 'doc',
        content: [
          { type: 'imageBlock', attrs: { assetId: 'live', caption: '' } },
        ],
      },
      assets: [
        { id: 'live', bytes: 'live-bytes' },
        { id: 'orphan', bytes: 'orphan-bytes' },
      ],
    });

    const data = await buildExportData(fakeDb, 'p1');
    expect(data!.assets).toHaveLength(1);
    expect(data!.assets![0].id).toBe('live');
  });

  it('emits an empty asset list when the project has no build doc', async () => {
    const fakeDb = makeExportFakeDb({
      projectId: 'p2',
      doc: null,
      assets: [{ id: 'a1', bytes: 'x' }],
    });

    const data = await buildExportData(fakeDb, 'p2');
    expect(data!.buildDoc).toBeUndefined();
    expect(data!.assets).toEqual([]);
  });

  it('exports image-block references and asset records together', async () => {
    const project = await idb.createProject('AssetRoundTrip');
    const asset = await idb.createAsset({
      projectId: project.id,
      mimeType: 'image/png',
      blob: new Blob([new TextEncoder().encode('PNG-BYTES')], {
        type: 'image/png',
      }),
    });
    const docJson: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'imageBlock',
          attrs: { assetId: asset.id, caption: 'fig 1' },
        },
      ],
    };
    await writeBuildDoc(idb, project.id, docJson);

    // happy-dom + fake-indexeddb don't preserve `Blob` cleanly through
    // structuredClone, so `buildExportData` (which calls blob.arrayBuffer)
    // can't run end-to-end here. We exercise the data assembly in two
    // pieces: the build doc keeps its image-block reference, and the
    // exported asset record metadata is structurally what we promised.
    const stored = await idb.getBuildDoc(project.id);
    const image = stored!.doc.content?.[0];
    expect(image?.attrs?.assetId).toBe(asset.id);
    expect(image?.attrs?.caption).toBe('fig 1');
    const assets = await idb.getAssetsForProject(project.id);
    expect(assets).toHaveLength(1);
    expect(assets[0].mimeType).toBe('image/png');
    expect(assets[0].projectId).toBe(project.id);
  });
});

// ─── exportFilename ─────────────────────────────────────────────────────────

describe('exportFilename', () => {
  it('replaces whitespace with hyphens', () => {
    expect(exportFilename('My Cool Cabinet')).toBe('My-Cool-Cabinet.cutlist');
  });

  it('collapses runs of whitespace', () => {
    expect(exportFilename('Lots   of  spaces')).toBe('Lots-of-spaces.cutlist');
  });

  it('passes through names without whitespace', () => {
    expect(exportFilename('NoSpaces')).toBe('NoSpaces.cutlist');
  });
});
