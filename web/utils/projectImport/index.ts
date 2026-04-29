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

import type { ProjectExport } from '~/composables/useExportProject';
import { gzipDecompress } from '~/utils/compress';
import { migrateExport } from './migrations';
import { DEFAULT_SETTINGS } from '~/utils/settings';
import { z } from 'zod';

// ─── Schemas ────────────────────────────────────────────────────────────────

const PartSizeSchema = z.object({
  width: z.number().finite(),
  length: z.number().finite(),
  thickness: z.number().finite(),
});

const PartSchema = z.object({
  partNumber: z.number().int().min(0),
  instanceNumber: z.number().int().min(1),
  name: z.string(),
  colorKey: z.string(),
  size: PartSizeSchema,
  grainLock: z.enum(['length', 'width']).optional(),
});

const PartOverrideSchema = z.object({
  grainLock: z.enum(['length', 'width']).optional(),
  name: z.string().optional(),
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
  source: z.enum(['gltf', 'collada', 'manual']),
  parts: z.array(PartSchema).default([]),
  colors: z.array(ColorInfoSchema).default([]),
  nodePartMap: z.array(NodePartMappingSchema).default([]),
  enabled: z.boolean(),
  rawSource: z.union([z.record(z.string(), z.unknown()), z.string(), z.null()]),
  partOverrides: z.record(z.string(), PartOverrideSchema).default({}),
  createdAt: z.string(),
});

const BuildStepSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  stepNumber: z.number().int().min(0),
  title: z.string(),
  description: z.string(),
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
  projectId: z.string(),
  name: z.string(),
  order: z.number().int().min(0),
  cameraMode: z.enum(['perspective', 'orthographic']),
  cameraPose: z.object({
    position: Vec3Schema,
    target: Vec3Schema,
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

const DimensionSchema = z.object({
  id: z.string(),
  sceneId: z.string(),
  kind: z.literal('dimension'),
  groupId: z.number().int(),
  anchor1Local: Vec3Schema,
  anchor2Local: Vec3Schema,
  offsetLocal: Vec3Schema,
  text: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

const AnnotationSchema = z.discriminatedUnion('kind', [
  CalloutSchema,
  DimensionSchema,
]);

// Packing settings (bladeWidth, margin, optimize, showPartNumbers) now live on
// the project record, so they travel with the export automatically. A
// top-level `settings` field left over from the pre-v2 global-settings export
// format is silently stripped by Zod's default object behaviour.
const ProjectExportSchema = z.object({
  version: z.number(),
  project: z.object({
    id: z.string(),
    name: z.string().min(1, 'Project name cannot be empty'),
    colorMap: z.record(z.string(), z.string()),
    excludedColors: z.array(z.string()).default([]),
    stock: z.string(),
    distanceUnit: z.enum(['in', 'mm']).default(DEFAULT_SETTINGS.distanceUnit),
    bladeWidth: z.number().finite().default(DEFAULT_SETTINGS.bladeWidth),
    margin: z.number().finite().default(DEFAULT_SETTINGS.margin),
    optimize: z.enum(['Auto', 'CNC']).default(DEFAULT_SETTINGS.optimize),
    showPartNumbers: z.boolean().default(DEFAULT_SETTINGS.showPartNumbers),
    createdAt: z.string(),
    updatedAt: z.string(),
  }),
  models: z.array(ModelSchema),
  buildSteps: z.array(BuildStepSchema).optional(),
  scenes: z.array(SceneSchema).optional(),
  annotations: z.array(AnnotationSchema).optional(),
});

// ─── Parsing ────────────────────────────────────────────────────────────────

/**
 * Minimal database interface for project import. Decouples import logic
 * from the concrete IDB composable so tests can provide a stub.
 *
 * `createModel` and `createBuildStep` accept `any` intentionally: the import
 * layer spreads Zod-validated output with fresh IDs, producing the correct
 * IDB record shape at runtime. Tightening these to IdbModel/IdbBuildStep
 * would couple this module to the concrete IDB types.
 */
export interface ProjectImportDb {
  createProject: (
    name: string,
    opts?: {
      stock?: string;
      distanceUnit?: 'in' | 'mm';
      bladeWidth?: number;
      margin?: number;
      optimize?: 'Auto' | 'CNC';
      showPartNumbers?: boolean;
    },
  ) => Promise<{ id: string }>;
  updateProject: (
    id: string,
    patch: Partial<{
      colorMap: Record<string, string>;
      excludedColors: string[];
    }>,
  ) => Promise<unknown>;
  createModel: (model: any) => Promise<void>;
  createBuildStep: (step: any) => Promise<void>;
  createScene: (scene: any) => Promise<void>;
  createAnnotation: (annotation: any) => Promise<void>;
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
 * project, models, and build steps to avoid collisions with existing data.
 * Returns the new project ID.
 */
export async function importProjectData(
  data: ProjectExport,
  idb: ProjectImportDb,
): Promise<string> {
  const newProject = await idb.createProject(data.project.name, {
    stock: data.project.stock,
    distanceUnit: data.project.distanceUnit,
    bladeWidth: data.project.bladeWidth,
    margin: data.project.margin,
    optimize: data.project.optimize,
    showPartNumbers: data.project.showPartNumbers,
  });
  await idb.updateProject(newProject.id, {
    colorMap: data.project.colorMap,
    excludedColors: data.project.excludedColors,
  });

  await Promise.all(
    data.models.map((model) =>
      idb.createModel({
        ...model,
        id: crypto.randomUUID(),
        projectId: newProject.id,
      }),
    ),
  );

  await Promise.all(
    (data.buildSteps ?? []).map((step) =>
      idb.createBuildStep({
        ...step,
        id: crypto.randomUUID(),
        projectId: newProject.id,
      }),
    ),
  );

  // Scenes get fresh IDs; annotations follow via a sceneId remap so the
  // imported references stay intact under the new IDs.
  const sceneIdMap = new Map<string, string>();
  await Promise.all(
    (data.scenes ?? []).map((scene) => {
      const newId = crypto.randomUUID();
      sceneIdMap.set(scene.id, newId);
      return idb.createScene({
        ...scene,
        id: newId,
        projectId: newProject.id,
      });
    }),
  );

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

/**
 * Import a .cutlist file. Handles both gzipped and plain JSON input.
 * Returns the new project ID on success.
 * Throws with a user-readable message on any failure.
 */
export async function importProjectFromFile(
  file: File,
  idb: ProjectImportDb,
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

  const data = parseProjectExport(raw);
  return importProjectData(data, idb);
}
