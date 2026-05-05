/**
 * Build doc CRUD. There's exactly one build doc per project, keyed by
 * `projectId`. The doc holds an optional `title` plus an HTML body —
 * Tiptap's serialised output. Embedded image and scene nodes carry their
 * referenced ids in `data-*` attributes so round-tripping (export/import)
 * preserves them.
 *
 * Reads return `undefined` when the doc doesn't exist yet — the UI lazily
 * creates one on first edit.
 */

import { getDb, safeWrite } from './db';
import { applyBuildDocDefaults } from './defaults';
import type { IdbBuildDoc } from './types';

export async function getBuildDoc(
  projectId: string,
): Promise<IdbBuildDoc | undefined> {
  const db = await getDb();
  const raw = await db.buildDocs.get(projectId);
  return raw ? applyBuildDocDefaults(raw) : undefined;
}

export async function putBuildDoc(doc: IdbBuildDoc): Promise<void> {
  const db = await getDb();
  await safeWrite(() => db.buildDocs.put(doc));
}

export type BuildDocPatch = Partial<Pick<IdbBuildDoc, 'title' | 'html'>>;

/**
 * Read-modify-write helper. Stamps `updatedAt`. Creates the record with
 * sensible defaults (empty html) if it didn't exist yet, so the title can
 * be set before the body is touched.
 */
export async function updateBuildDoc(
  projectId: string,
  patch: BuildDocPatch,
): Promise<IdbBuildDoc> {
  const db = await getDb();
  const existing = await db.buildDocs.get(projectId);
  const next: IdbBuildDoc = {
    projectId,
    title: existing?.title,
    html: existing?.html ?? '',
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await safeWrite(() => db.buildDocs.put(next));
  return next;
}

export async function deleteBuildDoc(projectId: string): Promise<void> {
  const db = await getDb();
  await safeWrite(() => db.buildDocs.delete(projectId));
}
