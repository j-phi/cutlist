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
  getProjectList,
  getArchivedList,
  getProjectWithModels,
  createProject,
  updateProject,
  archiveProject,
  unarchiveProject,
  deleteProject,
} from './projects';
import {
  createModel,
  updateModel,
  deleteModel,
  getModelRawSource,
  flushPendingModelWrites,
} from './models';
import {
  getBuildSteps,
  createBuildStep,
  updateBuildStep,
  deleteBuildStep,
} from './buildSteps';
import {
  getScenes,
  nextSceneOrder,
  createScene,
  updateScene,
  deleteScene,
} from './scenes';
import {
  getAnnotationsForScene,
  getAnnotationsForProject,
  createAnnotation,
  updateAnnotation,
  deleteAnnotation,
} from './annotations';
export { useIdbErrors, resetDatabase } from './db';
export {
  applyProjectDefaults,
  applyModelDefaults,
  applySceneDefaults,
  applyAnnotationDefaults,
} from './defaults';
export type { AnnotationPatch } from './annotations';
export type {
  IdbProject,
  PartOverride,
  IdbModel,
  IdbModelMeta,
  IdbBuildStep,
  IdbScene,
  IdbAnnotation,
  IdbCallout,
  IdbDimension,
  AnnotationKind,
  CameraMode,
  CameraPose,
  ObjectOffset,
} from './types';
export { IDENTITY_OBJECT_OFFSET } from './types';

export function useIdb() {
  return {
    getProjectList,
    getArchivedList,
    getProjectWithModels,
    createProject,
    updateProject,
    archiveProject,
    unarchiveProject,
    deleteProject,
    createModel,
    updateModel,
    deleteModel,
    getModelRawSource,
    getBuildSteps,
    createBuildStep,
    updateBuildStep,
    deleteBuildStep,
    flushPendingModelWrites,
    getScenes,
    nextSceneOrder,
    createScene,
    updateScene,
    deleteScene,
    getAnnotationsForScene,
    getAnnotationsForProject,
    createAnnotation,
    updateAnnotation,
    deleteAnnotation,
  };
}
