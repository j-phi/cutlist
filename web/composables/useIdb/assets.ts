/**
 * Asset CRUD. Assets are binary blobs (currently images) referenced from
 * the build doc by `<image-block data-asset-id="…">` nodes. Stored in
 * their own table so doc records stay small and so a single asset can be
 * referenced by multiple blocks without duplicating bytes.
 *
 * Lifecycle: assets are project-scoped. The project-delete cascade in
 * `./projects.ts` clears them inside the same Dexie transaction.
 */

import { getDb, safeWrite } from './db';
import type { IdbAsset } from './types';

export interface CreateAssetInput {
  projectId: string;
  mimeType: string;
  blob: Blob;
}

export async function createAsset(input: CreateAssetInput): Promise<IdbAsset> {
  const db = await getDb();
  const asset: IdbAsset = {
    id: crypto.randomUUID(),
    projectId: input.projectId,
    mimeType: input.mimeType,
    blob: input.blob,
    createdAt: new Date().toISOString(),
  };
  await safeWrite(() => db.assets.put(asset));
  return asset;
}

/**
 * Persist an asset record verbatim. Used by the import pipeline, which
 * generates a fresh id for each incoming asset (to avoid collisions) and
 * needs to write that exact id rather than have one auto-assigned.
 */
export async function putAsset(asset: IdbAsset): Promise<void> {
  const db = await getDb();
  await safeWrite(() => db.assets.put(asset));
}

export async function getAsset(id: string): Promise<IdbAsset | undefined> {
  const db = await getDb();
  return db.assets.get(id);
}

export async function getAssetsForProject(
  projectId: string,
): Promise<IdbAsset[]> {
  const db = await getDb();
  return db.assets.where('projectId').equals(projectId).toArray();
}
