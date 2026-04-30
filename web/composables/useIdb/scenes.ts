/**
 * Scene CRUD. Scenes are stored per-model, sorted by `order` on read.
 *
 * `deleteScene` cascades to annotations in a single Dexie transaction so a
 * mid-delete failure can't leave orphaned annotations.
 */

import { getDb, safeWrite } from './db';
import type { IdbScene } from './types';

export async function getScenesForModel(modelId: string): Promise<IdbScene[]> {
  const db = await getDb();
  const scenes = await db.scenes.where('modelId').equals(modelId).toArray();
  return scenes.sort((a, b) => a.order - b.order);
}

export async function nextSceneOrder(modelId: string): Promise<number> {
  const db = await getDb();
  const count = await db.scenes.where('modelId').equals(modelId).count();
  return count;
}

export async function createScene(scene: IdbScene): Promise<void> {
  const db = await getDb();
  await safeWrite(() => db.scenes.put(scene));
}

export async function updateScene(
  id: string,
  patch: Partial<
    Pick<
      IdbScene,
      | 'name'
      | 'order'
      | 'cameraMode'
      | 'cameraPose'
      | 'objectOffsets'
      | 'visibleObjects'
      | 'floorVisible'
      | 'thumbnailDataUrl'
    >
  >,
): Promise<void> {
  const db = await getDb();
  const existing = await db.scenes.get(id);
  if (!existing) throw new Error(`Scene ${id} not found`);
  const updated: IdbScene = {
    ...existing,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  await safeWrite(() => db.scenes.put(updated));
}

export async function deleteScene(id: string): Promise<void> {
  const db = await getDb();
  await safeWrite(() =>
    db.transaction('rw', [db.scenes, db.annotations], async () => {
      await db.annotations.where('sceneId').equals(id).delete();
      await db.scenes.delete(id);
    }),
  );
}
