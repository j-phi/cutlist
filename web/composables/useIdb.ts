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
  applyAnnotationDefaults,
  applyBuildDocDefaults,
  applyPartOverrideDefaults,
  NO_BANDED_EDGES,
} from './useIdb/index';
export type {
  AnnotationPatch,
  BandedEdges,
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
} from './useIdb/index';
