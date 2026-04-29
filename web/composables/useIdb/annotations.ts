/**
 * Annotation CRUD. Annotations are scene-scoped via `sceneId` and the scenes
 * layer cascades the delete inside its own transaction.
 *
 * Reads route through `applyAnnotationDefaults` so partially-populated rows
 * (e.g. from a future field addition) hydrate cleanly.
 */

import { getDb, safeWrite } from './db';
import { applyAnnotationDefaults } from './defaults';
import type { IdbAnnotation, IdbCallout, IdbDimension } from './types';

type ImmutableFields = 'id' | 'sceneId' | 'kind' | 'groupId' | 'createdAt';
type CalloutPatch = Partial<Omit<IdbCallout, ImmutableFields>>;
type DimensionPatch = Partial<Omit<IdbDimension, ImmutableFields>>;
export type AnnotationPatch = CalloutPatch | DimensionPatch;

export async function getAnnotationsForScene(
  sceneId: string,
): Promise<IdbAnnotation[]> {
  const db = await getDb();
  const rows = await db.annotations.where('sceneId').equals(sceneId).toArray();
  return rows
    .map((r) => applyAnnotationDefaults(r))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function getAnnotationsForProject(
  projectId: string,
): Promise<IdbAnnotation[]> {
  const db = await getDb();
  const sceneIds = (
    await db.scenes.where('projectId').equals(projectId).toArray()
  ).map((s) => s.id);
  if (sceneIds.length === 0) return [];
  const rows = await db.annotations.where('sceneId').anyOf(sceneIds).toArray();
  return rows.map((r) => applyAnnotationDefaults(r));
}

export async function createAnnotation(
  annotation: IdbAnnotation,
): Promise<void> {
  const db = await getDb();
  await safeWrite(() => db.annotations.put(annotation));
}

export async function updateAnnotation(
  id: string,
  patch: AnnotationPatch,
): Promise<void> {
  const db = await getDb();
  const existing = await db.annotations.get(id);
  if (!existing) throw new Error(`Annotation ${id} not found`);
  const updated = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  } as IdbAnnotation;
  await safeWrite(() => db.annotations.put(updated));
}

export async function deleteAnnotation(id: string): Promise<void> {
  const db = await getDb();
  await safeWrite(() => db.annotations.delete(id));
}
