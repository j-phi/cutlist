/**
 * Wires the annotation projector + per-kind handlers to the viewer
 * lifecycle. Originally inlined in ModelTab; the dance is enough that the
 * extraction prevents the same bug from creeping back in (start before
 * register-kind, register-handler before viewer.ready, etc.).
 *
 * The projector is constructed eagerly so callers can pass it through to
 * `<AnnotationLabels :projector="..." />` from `setup()` — the host needs a
 * stable reference for the prop binding. The internals only run when the
 * viewer reports ready.
 */

import type { Ref } from 'vue';
import type { ProjectorViewer } from '~/lib/viewer/modules/AnnotationProjector';
import { AnnotationProjector } from '~/lib/viewer/modules/AnnotationProjector';
import type {
  AnnotationAuthor,
  AnnotationAuthorViewer,
} from '~/composables/useAnnotationAuthor';
import type { UseAnnotationsApi } from '~/composables/useAnnotations';
import type { IdbAnnotation } from '~/composables/useIdb';
import type { CalloutViewer } from '~/lib/viewer/annotations/callout';
import {
  calloutKindHooks,
  createCalloutHandler,
} from '~/lib/viewer/annotations/callout';
import type { DimensionViewer } from '~/lib/viewer/annotations/dimension';
import {
  createDimensionHandler,
  createDimensionKindHooks,
} from '~/lib/viewer/annotations/dimension';

/**
 * The full surface required to instantiate the projector + the callout and
 * dimension handlers. `useThreeViewer`'s return value satisfies this
 * structurally; tests can pass a thinner stub.
 */
type Viewer = ProjectorViewer &
  CalloutViewer &
  DimensionViewer &
  AnnotationAuthorViewer & {
    ready: Ref<boolean>;
  };

export interface UseAnnotationProjectorOptions {
  viewer: Viewer;
  annotationsApi: UseAnnotationsApi;
  annotationAuthor: AnnotationAuthor;
  activeSceneId: Ref<string | null>;
  /** Lazy getter so the projector picks up tween-aware filtering. */
  getAnnotations: () => readonly IdbAnnotation[];
}

export function useAnnotationProjector(opts: UseAnnotationProjectorOptions) {
  const {
    viewer,
    annotationsApi,
    annotationAuthor,
    activeSceneId,
    getAnnotations,
  } = opts;

  // Eager construction: callers pass the projector to <AnnotationLabels>'
  // prop synchronously. Registering kind hooks here is safe because they're
  // pure data — `start()` only runs after the viewer is ready.
  const projector = new AnnotationProjector(viewer, getAnnotations);
  projector.registerKind('callout', calloutKindHooks);
  projector.registerKind('dimension', createDimensionKindHooks(viewer));

  watch(
    () => viewer.ready.value,
    (isReady) => {
      if (!isReady) return;
      projector.start();
      annotationAuthor.registerHandler(
        'callout',
        createCalloutHandler({
          viewer,
          annotationsApi,
          activeSceneId,
          author: annotationAuthor,
        }),
      );
      annotationAuthor.registerHandler(
        'dimension',
        createDimensionHandler({
          viewer,
          annotationsApi,
          activeSceneId,
          author: annotationAuthor,
        }),
      );
    },
    { immediate: true },
  );

  onScopeDispose(() => projector.dispose());

  return { projector };
}

export default useAnnotationProjector;
