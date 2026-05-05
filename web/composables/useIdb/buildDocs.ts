/**
 * Build doc CRUD. Exactly one build doc per project, keyed by `projectId`.
 * The doc holds a title and a Tiptap JSON tree; embedded image / scene
 * nodes carry their referenced ids in node `attrs`, so round-tripping
 * (export/import) preserves them.
 *
 * Reads return `undefined` when the doc doesn't exist yet — the UI lazily
 * creates one on first edit.
 *
 * Writes are full-record puts. There's no separate read-modify-write
 * helper: the caller (`useBuildDoc`) already holds the full reactive
 * state, so a partial-patch API would just add a redundant round-trip.
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

export async function deleteBuildDoc(projectId: string): Promise<void> {
  const db = await getDb();
  await safeWrite(() => db.buildDocs.delete(projectId));
}
