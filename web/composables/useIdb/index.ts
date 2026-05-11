/**
 * IndexedDB persistence layer for Cutlist.
 *
 * All app data lives in IndexedDB. This directory owns the schema, provides
 * CRUD operations, and applies defensive defaults on reads so that records
 * missing fields added by later migrations still work at runtime.
 *
 * Error handling:
 * - QuotaExceededError is caught on writes and surfaced via `useIdbErrors()`.
 * - FutureSchemaError (from `~/utils/versions`) is surfaced to the user on
 *   startup when the stored DB was written by a newer Cutlist.
 *
 * Contract:
 * - `getDb()` (in `./db`) is the singleton entry point. It opens the database,
 *   runs the startup migration sweep, and returns the idb handle.
 * - All public functions go through `getDb()` and handle IDB errors.
 *
 * The implementation is split across per-concern modules; this file
 * re-exports the combined API as a single `useIdb()` composable plus the
 * public named exports (`useIdbErrors`, the `apply*Defaults` helpers, and
 * the type surface).
 */

import {
  getAllProjectsByRecency,
  getProjectThumbnails,
  getProjectWithModels,
  createProject,
  updateProject,
  deleteProject,
} from './projects';
import {
  createModel,
  updateModel,
  deleteModel,
  getModelRawSource,
  flushPendingModelWrites,
} from './models';
import { getBuildDoc, putBuildDoc, deleteBuildDoc } from './buildDocs';
import {
  createAsset,
  putAsset,
  getAsset,
  getAssetsForProject,
  deleteAssets,
} from './assets';
import {
  getScenesForModel,
  nextSceneOrder,
  createScene,
  updateScene,
  deleteScene,
} from './scenes';
import {
  getAnnotationsForScene,
  getAnnotationsForProject,
  getAnnotationsForModel,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from './annotations';
export { useIdbErrors, resetDatabase } from './db';
export {
  applyProjectDefaults,
  applyModelDefaults,
  applyAnnotationDefaults,
  applyBuildDocDefaults,
} from './defaults';
export type { AnnotationPatch } from './annotations';
export type {
  IdbProject,
  PartOverride,
  IdbModel,
  IdbModelMeta,
  IdbBuildDoc,
  IdbAsset,
  IdbScene,
  IdbAnnotation,
  IdbCallout,
  IdbDimension,
  DimensionAnchor,
  AnnotationKind,
} from './types';

export function useIdb() {
  return {
    getAllProjectsByRecency,
    getProjectThumbnails,
    getProjectWithModels,
    createProject,
    updateProject,
    deleteProject,
    createModel,
    updateModel,
    deleteModel,
    getModelRawSource,
    getBuildDoc,
    putBuildDoc,
    deleteBuildDoc,
    createAsset,
    putAsset,
    getAsset,
    getAssetsForProject,
    deleteAssets,
    flushPendingModelWrites,
    getScenesForModel,
    nextSceneOrder,
    createScene,
    updateScene,
    deleteScene,
    getAnnotationsForScene,
    getAnnotationsForProject,
    getAnnotationsForModel,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
  };
}
