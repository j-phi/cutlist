/**
 * Barrel module re-exporting the composables/useIdb/ directory.
 *
 * Kept at this path so Nuxt's composable auto-import continues to pick up
 * `useIdb` / `useIdbErrors`, and so existing `~/composables/useIdb` imports
 * from every caller resolve without change. See `./useIdb/index.ts` for the
 * implementation and `./useIdb/types.ts` for the type surface.
 */

export {
  useIdb,
  useIdbErrors,
  applyProjectDefaults,
  applyModelDefaults,
  applySceneDefaults,
  applyAnnotationDefaults,
  IDENTITY_OBJECT_OFFSET,
  isIdentityObjectOffset,
} from './useIdb/index';
export type {
  AnnotationPatch,
  IdbProject,
  PartOverride,
  IdbModel,
  IdbModelMeta,
  IdbBuildStep,
  IdbScene,
  IdbAnnotation,
  IdbCallout,
  IdbDimension,
  DimensionAnchor,
  AnnotationKind,
  CameraMode,
  CameraPose,
  ObjectOffset,
} from './useIdb/index';
