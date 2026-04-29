/**
 * Annotation authoring state machine.
 *
 * Owns the transient `'select' | 'pick'` mode that the AnnotationLabels
 * overlay reflects in its hint banner. Per-kind handlers (callout — Spec 08;
 * linear dimension — Spec 09) register against this composable; the author
 * is the only thing that knows about the FSM and the InputRouter wiring, so
 * each kind only writes its placement logic.
 *
 * Handler contract:
 * - `onPointerMove(client)` — runs at most once per frame (the InputRouter
 *   already throttles).
 * - `onClick(client)` — returns `{ done }`. `done: true` means placement is
 *   complete and the author should drop back into select mode. Returning a
 *   `draftId` lets the author surface a freshly created annotation for inline
 *   edit (callouts) or chained tweaks.
 * - `onEsc()` — kind-specific cancel logic; the author then exits pick mode.
 * - `hint()` — the contextual one-line copy shown to the user during pick.
 *
 * `enter(kind)` requires an `activeSceneId`. With no active scene there's
 * nothing to bind the annotation to.
 */

import type { ComputedRef, Ref } from 'vue';
import type { PickHandler } from '~/lib/viewer/modules/InputRouter';
import type { UseAnnotationsApi } from '~/composables/useAnnotations';

export type Mode = 'select' | 'pick';
export type PickKind = 'callout' | 'dimension';

export interface PickKindHandler {
  onPointerMove(client: { x: number; y: number }): void;
  onClick(client: {
    x: number;
    y: number;
  }): Promise<{ done: boolean; draftId?: string | null }>;
  onEsc(): void;
  hint(): string;
}

export interface AnnotationAuthorViewer {
  setInteractionMode(mode: Mode, handler?: PickHandler | null): void;
}

export interface AnnotationAuthor {
  mode: Ref<Mode>;
  pickKind: Ref<PickKind | null>;
  draftId: Ref<string | null>;
  hint: ComputedRef<string>;

  enter(kind: PickKind): void;
  exit(): void;
  cancel(): void;

  registerHandler(kind: PickKind, handler: PickKindHandler): () => void;
  clearDraft(): void;
}

export function useAnnotationAuthor(
  viewer: AnnotationAuthorViewer,
  annotationsApi: UseAnnotationsApi,
  activeSceneId: Ref<string | null>,
): AnnotationAuthor {
  const mode = ref<Mode>('select');
  const pickKind = ref<PickKind | null>(null);
  const draftId = ref<string | null>(null);
  const handlers = new Map<PickKind, PickKindHandler>();

  const hint = computed(() => {
    if (mode.value !== 'pick' || !pickKind.value) return '';
    return handlers.get(pickKind.value)?.hint() ?? '';
  });

  function registerHandler(
    kind: PickKind,
    handler: PickKindHandler,
  ): () => void {
    handlers.set(kind, handler);
    return () => {
      if (handlers.get(kind) === handler) handlers.delete(kind);
    };
  }

  function makePickHandler(kind: PickKind): PickHandler {
    return {
      onPointerMove(client) {
        handlers.get(kind)?.onPointerMove(client);
      },
      onClick(client) {
        const h = handlers.get(kind);
        if (!h) return;
        // Fire-and-await so an async commit (IDB write) doesn't block the
        // InputRouter; the result mutates `draftId` / `mode` reactively.
        void h.onClick(client).then((r) => {
          if (r.draftId !== undefined) draftId.value = r.draftId ?? null;
          if (r.done) exit();
        });
      },
      onEsc() {
        handlers.get(kind)?.onEsc();
        exit();
      },
    };
  }

  function enter(kind: PickKind): void {
    if (!activeSceneId.value) return;
    if (!handlers.has(kind)) return;
    if (mode.value === 'pick' && pickKind.value === kind) return;
    if (mode.value === 'pick') exit();
    pickKind.value = kind;
    mode.value = 'pick';
    draftId.value = null;
    viewer.setInteractionMode('pick', makePickHandler(kind));
  }

  function exit(): void {
    if (mode.value === 'select' && pickKind.value === null) return;
    mode.value = 'select';
    pickKind.value = null;
    viewer.setInteractionMode('select');
  }

  function cancel(): void {
    if (draftId.value) {
      const id = draftId.value;
      draftId.value = null;
      void annotationsApi.remove(id);
    }
    exit();
  }

  function clearDraft(): void {
    draftId.value = null;
  }

  return {
    mode,
    pickKind,
    draftId,
    hint,
    enter,
    exit,
    cancel,
    registerHandler,
    clearDraft,
  };
}

export default useAnnotationAuthor;
