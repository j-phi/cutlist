/**
 * Shared fixtures for projectImport / round-trip / edge tests. Keeps payload
 * and IDB-mock shapes in sync across the suite — when the export schema gains
 * a field, only this file needs to change.
 */
import type { StockMatrix } from 'cutlist';
import { SCHEMA_VERSION } from '../../versions';

export const FIXTURE_PROJECT_ID = 'proj-1';
export const FIXTURE_MODEL_ID = 'model-1';
export const FIXTURE_NEW_PROJECT_ID = 'new-proj';

interface FixturePayload {
  version: number;
  exportedAt: string;
  project: {
    id: string;
    name: string;
    colorMap: Record<string, string>;
    excludedColors: string[];
    stocks: StockMatrix[];
    distanceUnit: 'mm' | 'in';
    bladeWidth: number;
    margin: number;
    defaultAlgorithm: 'auto' | 'tidy' | 'compact' | 'cnc';
    showPartNumbers: boolean;
    createdAt: string;
    updatedAt: string;
  };
  models: Array<{
    id: string;
    projectId: string;
    filename: string;
    source: 'gltf' | 'assimp' | 'manual';
    parts: unknown[];
    enabled: boolean;
    rawSource: unknown;
    partOverrides: Record<string, unknown>;
    createdAt: string;
    colors?: unknown[];
    nodePartMap?: unknown[];
  }>;
  buildDoc?: unknown;
  scenes?: unknown[];
  annotations?: unknown[];
  [k: string]: unknown;
}

/**
 * A minimal valid v{SCHEMA_VERSION} export payload. Top-level overrides spread
 * over the result; for deep customisations (parts, scenes, annotations),
 * mutate the returned object directly or spread inside `models[0]`.
 */
export function makePayload(
  overrides: Record<string, unknown> = {},
): FixturePayload {
  const now = new Date().toISOString();
  return {
    version: SCHEMA_VERSION,
    exportedAt: now,
    project: {
      id: FIXTURE_PROJECT_ID,
      name: 'Test Project',
      colorMap: { '#abc123': 'Plywood' },
      excludedColors: [],
      stocks: [
        {
          kind: 'sheet',
          material: 'Plywood',
          sizes: [{ width: 1220, length: 2440, thickness: [18] }],
        },
      ],
      distanceUnit: 'mm',
      bladeWidth: 3,
      margin: 0,
      defaultAlgorithm: 'auto',
      showPartNumbers: true,
      createdAt: now,
      updatedAt: now,
    },
    models: [
      {
        id: FIXTURE_MODEL_ID,
        projectId: FIXTURE_PROJECT_ID,
        filename: 'demo.gltf',
        source: 'gltf',
        parts: [],
        enabled: true,
        rawSource: { asset: { version: '2.0' } },
        partOverrides: {},
        createdAt: now,
      },
    ],
    buildDoc: {
      projectId: FIXTURE_PROJECT_ID,
      title: 'Test Project',
      doc: {
        type: 'doc',
        content: [
          { type: 'paragraph', content: [{ type: 'text', text: 'Desc' }] },
        ],
      },
      updatedAt: now,
    },
    ...overrides,
  };
}

/**
 * Stand-in for the IDB facade. Records every write so tests can assert on the
 * post-import state without touching a real Dexie instance. The single
 * `createProject` return value is configurable so tests can pin assertions on
 * the freshly-assigned project id.
 */
export function makeIdbMock(opts: { newProjectId?: string } = {}) {
  const newProjectId = opts.newProjectId ?? FIXTURE_NEW_PROJECT_ID;
  const calls = {
    createProject: [] as { name: string; opts?: unknown }[],
    updateProject: [] as { id: string; patch: Record<string, unknown> }[],
    createModel: [] as Record<string, unknown>[],
    putBuildDoc: [] as Record<string, unknown>[],
    createScene: [] as Record<string, unknown>[],
    createAnnotation: [] as Record<string, unknown>[],
    putAsset: [] as Record<string, unknown>[],
  };
  return {
    calls,
    db: {
      async createProject(name: string, opts?: unknown) {
        calls.createProject.push({ name, opts });
        return { id: newProjectId };
      },
      async updateProject(id: string, patch: Record<string, unknown>) {
        calls.updateProject.push({ id, patch });
      },
      async createModel(model: Record<string, unknown>) {
        calls.createModel.push(model);
      },
      async putBuildDoc(doc: Record<string, unknown>) {
        calls.putBuildDoc.push(doc);
      },
      async createScene(scene: Record<string, unknown>) {
        calls.createScene.push(scene);
      },
      async createAnnotation(annotation: Record<string, unknown>) {
        calls.createAnnotation.push(annotation);
      },
      async putAsset(asset: Record<string, unknown>) {
        calls.putAsset.push(asset);
      },
    },
  };
}
