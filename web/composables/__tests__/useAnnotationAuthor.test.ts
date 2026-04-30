// @vitest-environment nuxt
/**
 * useAnnotationAuthor — mode FSM and handler routing.
 *
 * Outcome-based tests. The author IS a dispatcher — its job is to route input
 * to per-kind handlers — so we observe dispatch by recording call args into
 * plain arrays rather than relying on vi.fn metadata. Same coverage, no
 * `mock.calls[0][0]` introspection.
 *
 * Avoids the IDB layer entirely: a recording stand-in for UseAnnotationsApi
 * captures `remove(id)` calls directly. The FSM / handler-registration logic
 * is independent of where annotations live.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import {
  useAnnotationAuthor,
  type AnnotationAuthorViewer,
  type PickKindHandler,
} from '../useAnnotationAuthor';
import type { UseAnnotationsApi } from '../useAnnotations';
import type { PickHandler } from '~/lib/viewer/modules/InputRouter';

let scope: EffectScope;

/** Stand-in for AnnotationAuthorViewer that records every setInteractionMode call. */
function makeViewer() {
  const modeCalls: Array<{
    mode: 'select' | 'pick';
    handler: PickHandler | null;
  }> = [];
  const snapHoverCalls: Array<unknown> = [];
  const viewer: AnnotationAuthorViewer = {
    setInteractionMode(mode, handler) {
      modeCalls.push({ mode, handler: handler ?? null });
    },
    setSnapHover(target) {
      snapHoverCalls.push(target);
    },
  };
  return { viewer, modeCalls, snapHoverCalls };
}

/** Stand-in for UseAnnotationsApi that records remove() calls into a plain array. */
function makeAnnotationsApi() {
  const removeCalls: string[] = [];
  const api: UseAnnotationsApi = {
    annotations: ref([]),
    visibleForScene: () => ref([]) as never,
    add: async () => 'annot-id',
    update: async () => {},
    remove: async (id: string) => {
      removeCalls.push(id);
    },
    purgeForScene: () => {},
    reload: async () => {},
  };
  return { api, removeCalls };
}

/**
 * Recording handler — captures onPointerMove / onClick / onEsc invocations into
 * plain arrays. Each method is a real function (not a vi.fn) so assertions are
 * over arrays, not mock metadata.
 *
 * Pass `clickResult` to control what onClick resolves with; pass `clickPromise`
 * to drive the timing manually (the FSM's done/draftId handling runs on the
 * promise's microtask resolution).
 */
function recordingHandler(
  opts: {
    hint?: () => string;
    clickResult?: { done: boolean; draftId?: string | null };
    clickPromise?: Promise<{ done: boolean; draftId?: string | null }>;
  } = {},
) {
  const moves: Array<{ x: number; y: number }> = [];
  const clicks: Array<{ x: number; y: number }> = [];
  let escCount = 0;
  const handler: PickKindHandler = {
    onPointerMove(client) {
      moves.push(client);
    },
    onClick(client) {
      clicks.push(client);
      // Return the supplied promise verbatim — wrapping it via `async` would
      // add an extra microtask layer that the FSM's `.then(...)` chain has to
      // unwrap, which makes await-counts in tests fragile.
      return (
        opts.clickPromise ?? Promise.resolve(opts.clickResult ?? { done: true })
      );
    },
    onEsc() {
      escCount++;
    },
    hint: opts.hint ?? (() => 'hint'),
  };
  return {
    handler,
    moves,
    clicks,
    escCount: () => escCount,
  };
}

beforeEach(() => {
  scope = effectScope();
});

afterEach(() => {
  scope.stop();
});

describe('useAnnotationAuthor — mode FSM', () => {
  it('Should refuse to enter pick mode without an active scene', () => {
    const { viewer, modeCalls } = makeViewer();
    const { api } = makeAnnotationsApi();
    const sceneId = ref<string | null>(null);
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    author.registerHandler('callout', recordingHandler().handler);

    author.enter('callout');
    expect(author.mode.value).toBe('select');
    expect(modeCalls).toEqual([]);
  });

  it('Should refuse to enter pick mode for a kind without a registered handler', () => {
    const { viewer } = makeViewer();
    const { api } = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    author.enter('callout');
    expect(author.mode.value).toBe('select');
  });

  it('Should switch into pick mode and register a PickHandler', () => {
    const { viewer, modeCalls } = makeViewer();
    const { api } = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    author.registerHandler('callout', recordingHandler().handler);
    author.enter('callout');
    expect(author.mode.value).toBe('pick');
    expect(author.pickKind.value).toBe('callout');
    expect(modeCalls.at(-1)?.mode).toBe('pick');
    expect(modeCalls.at(-1)?.handler).not.toBeNull();
  });

  it('Should expose the active handler hint', () => {
    const { viewer } = makeViewer();
    const { api } = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    author.registerHandler(
      'callout',
      recordingHandler({ hint: () => 'click a face' }).handler,
    );
    author.enter('callout');
    expect(author.hint.value).toBe('click a face');
    author.exit();
    expect(author.hint.value).toBe('');
  });

  it('Should exit on done click and update draftId', async () => {
    const { viewer, modeCalls } = makeViewer();
    const { api } = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    let resolveClick!: (r: { done: boolean; draftId?: string }) => void;
    const clickPromise = new Promise<{ done: boolean; draftId?: string }>(
      (res) => {
        resolveClick = res;
      },
    );
    const rec = recordingHandler({ clickPromise });
    author.registerHandler('callout', rec.handler);
    author.enter('callout');

    const pickHandler = modeCalls.at(-1)?.handler as PickHandler;
    pickHandler.onClick!({ x: 10, y: 20 });
    // The FSM-supplied PickHandler delegates to our recording handler.
    expect(rec.clicks).toEqual([{ x: 10, y: 20 }]);

    resolveClick({ done: true, draftId: 'a-1' });
    await Promise.resolve();
    await Promise.resolve();
    expect(author.draftId.value).toBe('a-1');
    expect(author.mode.value).toBe('select');
  });

  it('Should remove the draft on cancel', () => {
    const { viewer } = makeViewer();
    const { api, removeCalls } = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    author.registerHandler('callout', recordingHandler().handler);
    author.enter('callout');
    author.draftId.value = 'a-1';
    author.cancel();
    expect(author.mode.value).toBe('select');
    expect(removeCalls).toEqual(['a-1']);
    expect(author.draftId.value).toBeNull();
  });

  it('Should route Esc to the handler and exit', () => {
    const { viewer, modeCalls } = makeViewer();
    const { api } = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    const rec = recordingHandler();
    author.registerHandler('callout', rec.handler);
    author.enter('callout');

    const pickHandler = modeCalls.at(-1)?.handler as PickHandler;
    pickHandler.onEsc!();
    expect(rec.escCount()).toBe(1);
    expect(author.mode.value).toBe('select');
  });
});

describe('useAnnotationAuthor — handler registration', () => {
  it('Should let an unregister callback drop the handler', () => {
    const { viewer } = makeViewer();
    const { api } = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    const off = author.registerHandler('callout', recordingHandler().handler);
    off();
    author.enter('callout');
    expect(author.mode.value).toBe('select');
  });
});

describe('useAnnotationAuthor — projectableAnnotations', () => {
  it('Should pass through the visible list when there is no preview draft', () => {
    const { viewer } = makeViewer();
    const { api } = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    const visible = ref([
      { id: 'a', sceneId: 's1', kind: 'callout' } as never,
      { id: 'b', sceneId: 's1', kind: 'callout' } as never,
    ]);
    const projectable = author.projectableAnnotations(visible, sceneId);
    expect(projectable.value).toHaveLength(2);
  });

  it('Should append the preview when its sceneId matches', () => {
    const { viewer } = makeViewer();
    const { api } = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    const visible = ref([{ id: 'a', sceneId: 's1', kind: 'callout' } as never]);
    const draft = { id: 'd', sceneId: 's1', kind: 'callout' } as never;
    author.setPreview(draft);
    const projectable = author.projectableAnnotations(visible, sceneId);
    expect(projectable.value).toHaveLength(2);
    expect(projectable.value.map((a) => a.id)).toContain('d');
  });

  it('Should drop the preview when its sceneId differs from the renderable id', () => {
    const { viewer } = makeViewer();
    const { api } = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(viewer, api, sceneId))!;
    const visible = ref([{ id: 'a', sceneId: 's1', kind: 'callout' } as never]);
    author.setPreview({
      id: 'd',
      sceneId: 'other',
      kind: 'callout',
    } as never);
    const projectable = author.projectableAnnotations(visible, sceneId);
    expect(projectable.value).toHaveLength(1);
  });
});
