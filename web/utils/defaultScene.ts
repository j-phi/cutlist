import type { IdbScene } from '~/composables/useIdb';

export const DEFAULT_SCENE_NAME = 'Default';
const DEFAULT_SCENE_ID_PREFIX = 'default:';

export function defaultSceneIdForModel(modelId: string): string {
  return `${DEFAULT_SCENE_ID_PREFIX}${modelId}`;
}

export function isDefaultSceneId(id: string): boolean {
  return id.startsWith(DEFAULT_SCENE_ID_PREFIX);
}

export function isDefaultScene(scene: Pick<IdbScene, 'id'>): boolean {
  return isDefaultSceneId(scene.id);
}
