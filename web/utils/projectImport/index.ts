/**
 * Import validation and processing for .cutlist project files.
 *
 * All incoming data is validated against strict Zod schemas before touching
 * any runtime state. Malformed or hostile imports fail with user-readable
 * error messages at the validation boundary.
 *
 * Contract:
 * - `parseProjectExport` validates and migrates raw JSON into a ProjectExport.
 * - `importProjectData` writes validated data into IDB with fresh IDs.
 * - `importProjectFromFile` handles gzip decompression + JSON parsing.
 */

import type {
  MultiProjectExport,
  ProjectExport,
} from '~/composables/useExportProject';
import type {
  IdbAnnotation,
  IdbAsset,
  IdbBuildDoc,
  IdbModel,
  IdbProject,
  IdbScene,
} from '~/composables/useIdb';
import { getDb } from '~/composables/useIdb/db';
import { gzipDecompress } from '~/utils/compress';
import { migrateExport } from './migrations';
import { DEFAULT_SETTINGS, defaultPrecisionForUnit } from '~/utils/settings';
import {
  MicrometresSchema,
  StockMatrix,
  type Micrometres,
  type OptimizationObjective,
  type Precision,
} from 'cutlist';
import { defaultSceneIdForModel, isDefaultSceneId } from '~/utils/defaultScene';
import { base64ToBlob } from '~/utils/blobBase64';
import { remapBuildDoc } from '~/utils/buildDocRemap';
import type { JSONContent } from '@tiptap/core';
import { z } from 'zod';

// ─── Schemas ────────────────────────────────────────────────────────────────

const PartSizeSchema = z.object({
  width: MicrometresSchema,
  length: MicrometresSchema,
  thickness: MicrometresSchema,
});

const PartSchema = z.object({
  partNumber: z.number().int().min(0),
  instanceNumber: z.number().int().min(1),
  name: z.string(),
  colorKey: z.string(),
  size: PartSizeSchema,
  grainLock: z.enum(['length', 'width']).optional(),
});

const BandedEdgesSchema = z.object({
  length1: z.boolean(),
  length2: z.boolean(),
  width1: z.boolean(),
  width2: z.boolean(),
});

const PartOverrideSchema = z.object({
  grainLock: z.enum(['length', 'width']).optional(),
  name: z.string().optional(),
  bandedEdges: BandedEdgesSchema.optional(),
  bandingThicknessUm: MicrometresSchema.optional(),
});

const ColorInfoSchema = z.object({
  key: z.string(),
  rgb: z.tuple([z.number(), z.number(), z.number()]),
  count: z.number().int().min(0),
});

const NodePartMappingSchema = z.object({
  nodeIndex: z.number().int(),
  partNumber: z.number().int(),
  colorHex: z.string(),
});

const ModelSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  filename: z.string(),
  source: z.enum(['gltf', 'assimp', 'manual']),
  parts: z.array(PartSchema).default([]),
  colors: z.array(ColorInfoSchema).default([]),
  nodePartMap: z.array(NodePartMappingSchema).default([]),
  enabled: z.boolean(),
  rawSource: z.union([z.record(z.string(), z.unknown()), z.string(), z.null()]),
  partOverrides: z.record(z.string(), PartOverrideSchema).default({}),
  createdAt: z.string(),
});

// Tiptap's JSONContent is recursive and open: nodes carry an optional
// `type`, optional text, optional attrs, optional marks, and optional
// content. We stay permissive (`passthrough`) — the editor does its own
// schema validation when it loads a doc, and we just need enough
// structure to let Zod accept hand-rolled or legacy payloads without
// drifting from Tiptap's shape.
type ZodJSONContent = z.ZodType<JSONContent>;
const JSONContentSchema: ZodJSONContent = z.lazy(() =>
  z
    .object({
      type: z.string().optional(),
      text: z.string().optional(),
      attrs: z.record(z.string(), z.unknown()).optional(),
      marks: z
        .array(
          z
            .object({
              type: z.string(),
              attrs: z.record(z.string(), z.unknown()).optional(),
            })
            .passthrough(),
        )
        .optional(),
      content: z.array(JSONContentSchema).optional(),
    })
    .passthrough(),
);

const BuildDocSchema = z.object({
  projectId: z.string(),
  title: z.string().default(''),
  doc: JSONContentSchema,
  updatedAt: z.string(),
});

const ExportedAssetSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  mimeType: z.string(),
  blobBase64: z.string(),
  createdAt: z.string(),
});

const Vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
const Quat4Schema = z.tuple([z.number(), z.number(), z.number(), z.number()]);
const ObjectOffsetSchema = z.object({
  position: Vec3Schema,
  quaternion: Quat4Schema,
});

const SceneSchema = z.object({
  id: z.string(),
  modelId: z.string(),
  name: z.string(),
  order: z.number().int().min(0),
  cameraMode: z.enum(['perspective', 'orthographic']),
  cameraPose: z.object({
    position: Vec3Schema,
    target: Vec3Schema,
    zoom: z.number().finite().optional(),
    up: Vec3Schema.optional(),
  }),
  objectOffsets: z.record(z.string(), ObjectOffsetSchema).default({}),
  visibleObjects: z.array(z.number().int()).optional(),
  floorVisible: z.boolean(),
  thumbnailDataUrl: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const CalloutSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  kind: z.literal('callout'),
  groupId: z.number().int(),
  anchorLocal: Vec3Schema,
  anchorNormalLocal: Vec3Schema,
  labelOffsetLocal: Vec3Schema,
  text: z.string().default(''),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const DimensionAnchorSchema = z.object({
  groupId: z.number().int(),
  local: Vec3Schema,
});

const DimensionSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  kind: z.literal('dimension'),
  groupId: z.number().int(),
  anchor1: DimensionAnchorSchema,
  anchor2: DimensionAnchorSchema,
  offsetLocal: Vec3Schema,
  text: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const AnnotationSchema = z.discriminatedUnion('kind', [
  CalloutSchema,
  DimensionSchema,
]);

const PrecisionSchema = z.union([
  z.object({
    kind: z.literal('fraction'),
    denominator: z.union([
      z.literal(8),
      z.literal(16),
      z.literal(32),
      z.literal(64),
    ]),
  }),
  z.object({
    kind: z.literal('decimal'),
    step: z.number().positive().finite(),
  }),
]);

// Packing settings (bladeWidth, margin, defaultAlgorithm, showPartNumbers) now
// live on the project record, so they travel with the export automatically. A
// top-level `settings` field left over from the pre-v2 global-settings export
// format is silently stripped by Zod's default object behaviour.
const ProjectExportSchema = z.object({
  version: z.number(),
  project: z.object({
    id: z.string(),
    name: z.string().min(1, 'Project name cannot be empty'),
    colorMap: z.record(z.string(), z.string()),
    excludedColors: z.array(z.string()).default([]),
    stocks: z.array(StockMatrix).default([]),
    distanceUnit: z.enum(['in', 'mm']).default(DEFAULT_SETTINGS.distanceUnit),
    precision: PrecisionSchema.default(DEFAULT_SETTINGS.precision),
    bladeWidth: MicrometresSchema.default(DEFAULT_SETTINGS.bladeWidth),
    margin: MicrometresSchema.default(DEFAULT_SETTINGS.margin),
    defaultAlgorithm: z
      .enum(['auto', 'tidy', 'compact', 'cnc'])
      .default(DEFAULT_SETTINGS.defaultAlgorithm),
    showPartNumbers: z.boolean().default(DEFAULT_SETTINGS.showPartNumbers),
    showBomName: z.boolean().default(DEFAULT_SETTINGS.showBomName),
    layoutAlignH: z
      .enum(['left', 'right'])
      .default(DEFAULT_SETTINGS.layoutAlignH),
    layoutAlignV: z
      .enum(['top', 'bottom'])
      .default(DEFAULT_SETTINGS.layoutAlignV),
    labelPlacement: z
      .enum(['top', 'center'])
      .default(DEFAULT_SETTINGS.labelPlacement),
    bandingThicknessUm: MicrometresSchema.default(
      DEFAULT_SETTINGS.bandingThicknessUm,
    ),
    subtractBandingThickness: z
      .boolean()
      .default(DEFAULT_SETTINGS.subtractBandingThickness),
    optimizationObjective: z
      .enum(['boards', 'waste', 'cost'])
      .default(DEFAULT_SETTINGS.optimizationObjective),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  models: z.array(ModelSchema),
  buildDoc: BuildDocSchema.optional(),
  scenes: z.array(SceneSchema).optional(),
  annotations: z.array(AnnotationSchema).optional(),
  assets: z.array(ExportedAssetSchema).optional(),
});

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Minimal database interface for project import. Decouples import logic
 * from the concrete IDB composable so tests can provide a stub.
 */
export interface ProjectImportDb {
  createProject: (
    name: string,
    opts?: {
      stocks?: StockMatrix[];
      distanceUnit?: 'in' | 'mm';
      precision?: Precision;
      bladeWidth?: Micrometres;
      margin?: Micrometres;
      defaultAlgorithm?: 'auto' | 'tidy' | 'compact' | 'cnc';
      showPartNumbers?: boolean;
      showBomName?: boolean;
      layoutAlignH?: 'left' | 'right';
      layoutAlignV?: 'top' | 'bottom';
      labelPlacement?: 'top' | 'center';
      bandingThicknessUm?: Micrometres;
      subtractBandingThickness?: boolean;
      optimizationObjective?: OptimizationObjective;
    },
  ) => Promise<{ id: string }>;
  updateProject: (
    id: string,
    patch: Partial<{
      colorMap: Record<string, string>;
      excludedColors: string[];
    }>,
  ) => Promise<unknown>;
  createModel: (model: IdbModel) => Promise<void>;
  putBuildDoc: (doc: IdbBuildDoc) => Promise<void>;
  createScene: (scene: IdbScene) => Promise<void>;
  createAnnotation: (annotation: IdbAnnotation) => Promise<void>;
  /**
   * Persist an `IdbAsset` directly with its provided id. Used during import
   * so that block-level `assetId` references can be remapped to the new id
   * before they're written.
   */
  putAsset: (asset: IdbAsset) => Promise<void>;
}

/**
 * Validate and migrate a raw import payload into a ProjectExport.
 * Throws with a user-readable message if validation fails.
 */
export function parseProjectExport(raw: unknown): ProjectExport {
  // Basic type guard before migration.
  if (typeof raw !== 'object' || raw === null) {
    throw new Error('Invalid project file: expected a JSON object.');
  }

  const migrated = migrateExport(raw as Record<string, unknown>);
  const result = ProjectExportSchema.safeParse(migrated);
  if (!result.success) {
    // Build a human-readable summary of validation errors.
    const issues = result.error.issues.slice(0, 3);
    const messages = issues.map((i) => `${i.path.join('.')}: ${i.message}`);
    throw new Error(
      `Invalid project file:\n${messages.join('\n')}` +
        (result.error.issues.length > 3
          ? `\n...and ${result.error.issues.length - 3} more issues.`
          : ''),
    );
  }
  return result.data as unknown as ProjectExport;
}

/**
 * Write a validated ProjectExport into IDB. Generates fresh IDs for the
 * project, models, scenes, annotations, and assets to avoid collisions
 * with existing data. The build doc is rewritten with remapped ids before
 * being persisted. Returns the new project ID.
 */
export async function importProjectData(
  data: ProjectExport,
  idb: ProjectImportDb,
): Promise<string> {
  const newProject = await idb.createProject(data.project.name, {
    stocks: data.project.stocks,
    distanceUnit: data.project.distanceUnit,
    precision: data.project.precision,
    bladeWidth: data.project.bladeWidth,
    margin: data.project.margin,
    defaultAlgorithm: data.project.defaultAlgorithm,
    showPartNumbers: data.project.showPartNumbers,
    showBomName: data.project.showBomName,
    layoutAlignH: data.project.layoutAlignH,
    layoutAlignV: data.project.layoutAlignV,
    labelPlacement: data.project.labelPlacement,
    bandingThicknessUm: data.project.bandingThicknessUm,
    subtractBandingThickness: data.project.subtractBandingThickness,
    optimizationObjective: data.project.optimizationObjective,
  });
  await idb.updateProject(newProject.id, {
    colorMap: data.project.colorMap,
    excludedColors: data.project.excludedColors,
  });

  // Models get fresh IDs; scenes carry the new model id via a remap so each
  // scene stays attached to the same model it was captured against.
  const modelIdMap = new Map<string, string>();
  await Promise.all(
    data.models.map((model) => {
      const newId = crypto.randomUUID();
      modelIdMap.set(model.id, newId);
      return idb.createModel({
        ...model,
        id: newId,
        projectId: newProject.id,
      });
    }),
  );

  // Assets get fresh ids first so that any image-block embedded in the
  // build doc html can be remapped below. Without remapping, image blocks
  // would point at the originating user's asset ids and fail to resolve.
  const assetIdMap = new Map<string, string>();
  await Promise.all(
    (data.assets ?? []).map((asset) => {
      const newId = crypto.randomUUID();
      assetIdMap.set(asset.id, newId);
      return idb.putAsset({
        id: newId,
        projectId: newProject.id,
        mimeType: asset.mimeType,
        blob: base64ToBlob(asset.blobBase64, asset.mimeType),
        createdAt: asset.createdAt,
      });
    }),
  );

  // Scenes get fresh IDs; annotations follow via a sceneId remap so the
  // imported references stay intact under the new IDs. Scenes also need
  // their `modelId` remapped to whichever fresh model id we just assigned.
  // Done before the build doc so embedded scene references can be remapped.
  const sceneIdMap = new Map<string, string>();
  await Promise.all(
    (data.scenes ?? []).map((scene) => {
      const remappedModelId = modelIdMap.get(scene.modelId);
      if (!remappedModelId) {
        // Orphaned scene (no matching model in payload) — skip silently.
        return;
      }
      const newId = isDefaultSceneId(scene.id)
        ? defaultSceneIdForModel(remappedModelId)
        : crypto.randomUUID();
      sceneIdMap.set(scene.id, newId);
      return idb.createScene({
        ...scene,
        id: newId,
        modelId: remappedModelId,
      });
    }),
  );

  // Build doc comes last among the per-record writes so all referenced ids
  // (assets, models, scenes) are already remapped and available in the maps.
  if (data.buildDoc) {
    const remappedDoc = remapBuildDoc(data.buildDoc.doc, {
      assetIdMap,
      modelIdMap,
      sceneIdMap,
    });
    await idb.putBuildDoc({
      projectId: newProject.id,
      title: data.buildDoc.title,
      doc: remappedDoc,
      updatedAt: data.buildDoc.updatedAt,
    });
  }

  await Promise.all(
    (data.annotations ?? []).map((annotation) => {
      const remappedSceneId = sceneIdMap.get(annotation.sceneId);
      if (!remappedSceneId) {
        // Orphaned annotation (no matching scene in payload) — skip silently
        // rather than reject the whole import.
        return;
      }
      return idb.createAnnotation({
        ...annotation,
        id: crypto.randomUUID(),
        sceneId: remappedSceneId,
      });
    }),
  );

  return newProject.id;
}

// ─── Atomic (transactional) import ────────────────────────────────────────────

/**
 * Optional fault hooks for the atomic-import path. Used by tests to simulate a
 * mid-import write failure (e.g. a quota error on the 2nd model write) and
 * verify the whole transaction rolls back. Production callers pass nothing.
 */
export interface AtomicImportHooks {
  onCreateModel?: () => void;
}

const PROJECT_TABLES = [
  'projects',
  'models',
  'buildDocs',
  'scenes',
  'annotations',
  'assets',
] as const;

/**
 * Build a `ProjectImportDb` whose writes target an open Dexie transaction.
 * Because every write runs inside one `rw` transaction, a throw from any of
 * them (including a quota error) rolls back the *entire* import — satisfying
 * FR-DUR-4 (single transaction) and FR-DUR-5 (zero orphaned records).
 *
 * `createProject` builds a full `IdbProject` here (rather than delegating to
 * the CRUD helper) so the write stays inside the transaction; the field
 * defaults mirror `useIdb/projects.ts:createProject`.
 */
function transactionalImportDb(
  db: Awaited<ReturnType<typeof getDb>>,
  hooks: AtomicImportHooks,
): ProjectImportDb {
  return {
    async createProject(name, opts) {
      const now = new Date().toISOString();
      const unit = opts?.distanceUnit ?? DEFAULT_SETTINGS.distanceUnit;
      const project: IdbProject = {
        id: crypto.randomUUID(),
        name,
        colorMap: {},
        excludedColors: [],
        stocks: opts?.stocks ?? [],
        distanceUnit: unit,
        precision: opts?.precision ?? defaultPrecisionForUnit(unit),
        bladeWidth: opts?.bladeWidth ?? DEFAULT_SETTINGS.bladeWidth,
        margin: opts?.margin ?? DEFAULT_SETTINGS.margin,
        defaultAlgorithm:
          opts?.defaultAlgorithm ?? DEFAULT_SETTINGS.defaultAlgorithm,
        showPartNumbers:
          opts?.showPartNumbers ?? DEFAULT_SETTINGS.showPartNumbers,
        showBomName: opts?.showBomName ?? DEFAULT_SETTINGS.showBomName,
        layoutAlignH: opts?.layoutAlignH ?? DEFAULT_SETTINGS.layoutAlignH,
        layoutAlignV: opts?.layoutAlignV ?? DEFAULT_SETTINGS.layoutAlignV,
        labelPlacement: opts?.labelPlacement ?? DEFAULT_SETTINGS.labelPlacement,
        bandingThicknessUm:
          opts?.bandingThicknessUm ?? DEFAULT_SETTINGS.bandingThicknessUm,
        subtractBandingThickness:
          opts?.subtractBandingThickness ??
          DEFAULT_SETTINGS.subtractBandingThickness,
        optimizationObjective:
          opts?.optimizationObjective ?? DEFAULT_SETTINGS.optimizationObjective,
        createdAt: now,
        updatedAt: now,
      };
      await db.projects.put(project);
      return { id: project.id };
    },
    async updateProject(id, patch) {
      const existing = await db.projects.get(id);
      if (!existing) throw new Error(`Project ${id} not found`);
      await db.projects.put({
        ...existing,
        ...patch,
        updatedAt: new Date().toISOString(),
      });
    },
    async createModel(model) {
      hooks.onCreateModel?.();
      await db.models.put(model);
    },
    async putBuildDoc(doc) {
      await db.buildDocs.put(doc);
    },
    async createScene(scene) {
      await db.scenes.put(scene);
    },
    async createAnnotation(annotation) {
      await db.annotations.put(annotation);
    },
    async putAsset(asset) {
      await db.assets.put(asset);
    },
  };
}

/**
 * Import a single validated `ProjectExport` atomically: every record write
 * (project, models, assets, scenes, annotations, build doc) runs inside one
 * Dexie `rw` transaction so a partial failure leaves zero orphaned records.
 * Returns the new project id.
 */
export async function importProjectDataAtomic(
  data: ProjectExport,
  hooks: AtomicImportHooks = {},
): Promise<string> {
  const db = await getDb();
  let newProjectId = '';
  await db.transaction('rw', PROJECT_TABLES, async () => {
    newProjectId = await importProjectData(
      data,
      transactionalImportDb(db, hooks),
    );
  });
  return newProjectId;
}

/**
 * Import a multi-project "Export all" archive. Each project is imported in its
 * own atomic transaction (so a per-project failure cannot orphan its records),
 * processed sequentially. Returns the list of new project ids.
 */
export async function importArchiveData(
  archive: MultiProjectExport,
): Promise<string[]> {
  const ids: string[] = [];
  for (const project of archive.projects) {
    ids.push(await importProjectDataAtomic(project));
  }
  return ids;
}

/**
 * Type guard distinguishing a multi-project "Export all" archive from a
 * single-project export. The archive carries a `projects` array; a single
 * export carries a `project` object.
 */
function isMultiProjectArchive(raw: unknown): raw is { projects: unknown[] } {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    Array.isArray((raw as { projects?: unknown }).projects)
  );
}

/**
 * Validate and migrate a raw "Export all" archive. Each contained project is
 * run through `parseProjectExport` so the same strict Zod + migration gate
 * applies per project.
 */
export function parseProjectArchive(raw: unknown): MultiProjectExport {
  if (!isMultiProjectArchive(raw)) {
    throw new Error('Invalid archive: expected a `projects` array.');
  }
  const record = raw as Record<string, unknown>;
  const version = typeof record.version === 'number' ? record.version : 0;
  const exportedAt =
    typeof record.exportedAt === 'string'
      ? record.exportedAt
      : new Date().toISOString();
  return {
    version,
    exportedAt,
    projects: (record.projects as unknown[]).map((p) => parseProjectExport(p)),
  };
}

/**
 * Import a .cutlist file. Handles both gzipped and plain JSON input, and both
 * single-project exports and multi-project "Export all" archives. Returns the
 * new project id (the first one, for multi-project archives). All writes run
 * through the atomic transaction path (FR-DUR-4/-5).
 * Throws with a user-readable message on any failure.
 */
export async function importProjectFromFile(
  file: File,
  // `idb` is retained for API compatibility with existing callers; the atomic
  // path opens its own transaction against the singleton DB.
  _idb?: ProjectImportDb,
): Promise<string> {
  let text: string;
  try {
    text = await gzipDecompress(file);
  } catch {
    // Some static hosts may transparently decompress .gz responses.
    // Fall back to plain JSON text when gzip decode fails.
    text = await file.text();
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error(
      'Could not parse the file as JSON. Make sure this is a valid .cutlist file.',
    );
  }

  if (isMultiProjectArchive(raw)) {
    const archive = parseProjectArchive(raw);
    const ids = await importArchiveData(archive);
    if (ids.length === 0) {
      throw new Error('Archive contained no projects.');
    }
    return ids[0];
  }

  const data = parseProjectExport(raw);
  return importProjectDataAtomic(data);
}
