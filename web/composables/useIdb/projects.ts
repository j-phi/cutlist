/**
 * Project CRUD. Deletion cascades to models, scenes, annotations, build doc
 * and assets in a single Dexie transaction so partial failures don't leave
 * orphans.
 */

import type { Algorithm, Precision } from 'cutlist';
import { DEFAULT_SETTINGS, defaultPrecisionForUnit } from '~/utils/settings';
import { getDb, safeWrite } from './db';
import { applyProjectDefaults, applyModelDefaults } from './defaults';
import type { IdbProject, IdbModelMeta } from './types';

/** All projects, newest first by `updatedAt`. */
export async function getAllProjectsByRecency(): Promise<
  Pick<IdbProject, 'id' | 'name' | 'updatedAt'>[]
> {
  const db = await getDb();
  const all = await db.projects.orderBy('updatedAt').reverse().toArray();
  return all.map(({ id, name, updatedAt }) => ({ id, name, updatedAt }));
}

/**
 * One thumbnail per project — the first captured scene of the oldest model.
 * Projects without one are absent from the map.
 */
export async function getProjectThumbnails(): Promise<Map<string, string>> {
  const db = await getDb();
  const [models, scenes] = await Promise.all([
    db.models.toArray(),
    db.scenes.toArray(),
  ]);

  const modelsByProject = new Map<string, typeof models>();
  for (const m of models) {
    const arr = modelsByProject.get(m.projectId) ?? [];
    arr.push(m);
    modelsByProject.set(m.projectId, arr);
  }

  const scenesByModel = new Map<string, typeof scenes>();
  for (const s of scenes) {
    const arr = scenesByModel.get(s.modelId) ?? [];
    arr.push(s);
    scenesByModel.set(s.modelId, arr);
  }

  const result = new Map<string, string>();
  for (const [projectId, projModels] of modelsByProject) {
    const sorted = [...projModels].sort((a, b) =>
      a.createdAt.localeCompare(b.createdAt),
    );
    for (const m of sorted) {
      const projScenes = (scenesByModel.get(m.id) ?? []).sort(
        (a, b) => a.order - b.order,
      );
      const thumb = projScenes.find((s) => s.thumbnailDataUrl);
      if (thumb?.thumbnailDataUrl) {
        result.set(projectId, thumb.thumbnailDataUrl);
        break;
      }
    }
  }
  return result;
}

export async function getProjectWithModels(
  id: string,
): Promise<(IdbProject & { models: IdbModelMeta[] }) | undefined> {
  const db = await getDb();
  const [project, allModels] = await Promise.all([
    db.projects.get(id),
    db.models.where('projectId').equals(id).toArray(),
  ]);
  if (!project) return undefined;

  const models: IdbModelMeta[] = allModels
    .map(
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      ({ rawSource: _r, ...meta }) => applyModelDefaults(meta),
    )
    // Sort by createdAt to ensure stable model ordering across loads.
    // Without this, IDB returns models in UUID (primary key) order, which
    // is random — causing part number offsets to shift between sessions.
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return { ...applyProjectDefaults(project), models };
}

export async function createProject(
  name: string,
  opts?: {
    stock?: string;
    distanceUnit?: 'in' | 'mm';
    precision?: Precision;
    bladeWidth?: number;
    margin?: number;
    defaultAlgorithm?: Algorithm;
    showPartNumbers?: boolean;
  },
): Promise<IdbProject> {
  const db = await getDb();
  const now = new Date().toISOString();
  const unit = opts?.distanceUnit ?? DEFAULT_SETTINGS.distanceUnit;
  const project: IdbProject = {
    id: crypto.randomUUID(),
    name,
    colorMap: {},
    excludedColors: [],
    stock: opts?.stock ?? '',
    distanceUnit: unit,
    precision: opts?.precision ?? defaultPrecisionForUnit(unit),
    bladeWidth: opts?.bladeWidth ?? DEFAULT_SETTINGS.bladeWidth,
    margin: opts?.margin ?? DEFAULT_SETTINGS.margin,
    defaultAlgorithm:
      opts?.defaultAlgorithm ?? DEFAULT_SETTINGS.defaultAlgorithm,
    showPartNumbers: opts?.showPartNumbers ?? DEFAULT_SETTINGS.showPartNumbers,
    createdAt: now,
    updatedAt: now,
  };
  await safeWrite(() => db.projects.put(project));
  return project;
}

export async function updateProject(
  id: string,
  patch: Partial<
    Pick<
      IdbProject,
      | 'name'
      | 'colorMap'
      | 'excludedColors'
      | 'stock'
      | 'distanceUnit'
      | 'bladeWidth'
      | 'margin'
      | 'defaultAlgorithm'
      | 'showPartNumbers'
      | 'updatedAt'
    >
  >,
): Promise<IdbProject> {
  const db = await getDb();
  const existing = await db.projects.get(id);
  if (!existing) throw new Error(`Project ${id} not found`);
  const updated: IdbProject = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await safeWrite(() => db.projects.put(updated));
  return updated;
}

export async function deleteProject(id: string): Promise<void> {
  const db = await getDb();
  await safeWrite(() =>
    db.transaction(
      'rw',
      [
        db.projects,
        db.models,
        db.buildDocs,
        db.scenes,
        db.annotations,
        db.assets,
      ],
      async () => {
        // Cascade through models → scenes → annotations. Scenes are now
        // model-scoped, so we can't query them by projectId directly.
        const modelIds = (
          await db.models.where('projectId').equals(id).toArray()
        ).map((m) => m.id);
        if (modelIds.length > 0) {
          const sceneIds = (
            await db.scenes.where('modelId').anyOf(modelIds).toArray()
          ).map((s) => s.id);
          if (sceneIds.length > 0) {
            await db.annotations.where('sceneId').anyOf(sceneIds).delete();
            await db.scenes.where('modelId').anyOf(modelIds).delete();
          }
          await db.models.where('projectId').equals(id).delete();
        }
        await db.buildDocs.delete(id);
        await db.assets.where('projectId').equals(id).delete();
        await db.projects.delete(id);
      },
    ),
  );
}
