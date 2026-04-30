// @vitest-environment nuxt
/**
 * useAnnotationAuthor — mode FSM and handler routing.
 *
 * Avoids the IDB layer entirely by stubbing UseAnnotationsApi: the FSM /
 * handler-registration logic is independent of where annotations live.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';
import {
  useAnnotationAuthor,
  type AnnotationAuthorViewer,
  type PickKindHandler,
} from '../useAnnotationAuthor';
import type { UseAnnotationsApi } from '../useAnnotations';

let scope: EffectScope;

function makeViewer(): AnnotationAuthorViewer & {
  modeCalls: Array<['select' | 'pick', unknown]>;
} {
  const calls: Array<['select' | 'pick', unknown]> = [];
  return {
    modeCalls: calls,
    setInteractionMode: (mode, handler) => {
      calls.push([mode, handler ?? null]);
    },
  };
}

function makeAnnotationsApi(): UseAnnotationsApi {
  return {
    annotations: ref([]),
    visibleForScene: () => ref([]) as never,
    add: vi.fn().mockResolvedValue('annot-id'),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    purgeForScene: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
  };
}

function makeHandler(
  overrides: Partial<PickKindHandler> = {},
): PickKindHandler {
  return {
    onPointerMove: vi.fn(),
    onClick: vi.fn().mockResolvedValue({ done: true }),
    onEsc: vi.fn(),
    hint: () => 'hint',
    ...overrides,
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
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>(null);
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
    author.registerHandler('callout', makeHandler());

    author.enter('callout');
    expect(author.mode.value).toBe('select');
    expect(v.modeCalls).toHaveLength(0);
  });

  it('Should refuse to enter pick mode for a kind without a registered handler', () => {
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
    author.enter('callout');
    expect(author.mode.value).toBe('select');
  });

  it('Should switch into pick mode and register a PickHandler', () => {
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
    author.registerHandler('callout', makeHandler());
    author.enter('callout');
    expect(author.mode.value).toBe('pick');
    expect(author.pickKind.value).toBe('callout');
    expect(v.modeCalls.at(-1)?.[0]).toBe('pick');
  });

  it('Should expose the active handler hint', () => {
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
    author.registerHandler(
      'callout',
      makeHandler({ hint: () => 'click a face' }),
    );
    author.enter('callout');
    expect(author.hint.value).toBe('click a face');
    author.exit();
    expect(author.hint.value).toBe('');
  });

  it('Should exit on done click and update draftId', async () => {
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
    let resolveClick!: (r: { done: boolean; draftId?: string }) => void;
    const onClick = vi.fn().mockReturnValue(
      new Promise<{ done: boolean; draftId?: string }>((res) => {
        resolveClick = res;
      }),
    );
    author.registerHandler('callout', makeHandler({ onClick }));
    author.enter('callout');

    const handler = v.modeCalls.at(-1)?.[1] as {
      onClick: (c: { x: number; y: number }) => void;
    };
    handler.onClick({ x: 10, y: 20 });
    resolveClick({ done: true, draftId: 'a-1' });
    await Promise.resolve();
    await Promise.resolve();
    expect(author.draftId.value).toBe('a-1');
    expect(author.mode.value).toBe('select');
  });

  it('Should remove the draft on cancel', async () => {
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
    author.registerHandler('callout', makeHandler());
    author.enter('callout');
    author.draftId.value = 'a-1';
    author.cancel();
    expect(author.mode.value).toBe('select');
    expect(api.remove).toHaveBeenCalledWith('a-1');
    expect(author.draftId.value).toBeNull();
  });

  it('Should route Esc to the handler and exit', () => {
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
    const onEsc = vi.fn();
    author.registerHandler('callout', makeHandler({ onEsc }));
    author.enter('callout');

    const handler = v.modeCalls.at(-1)?.[1] as { onEsc: () => void };
    handler.onEsc();
    expect(onEsc).toHaveBeenCalled();
    expect(author.mode.value).toBe('select');
  });
});

describe('useAnnotationAuthor — handler registration', () => {
  it('Should let an unregister callback drop the handler', () => {
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
    const off = author.registerHandler('callout', makeHandler());
    off();
    author.enter('callout');
    expect(author.mode.value).toBe('select');
  });
});

describe('useAnnotationAuthor — projectableAnnotations', () => {
  it('Should pass through the visible list when there is no preview draft', () => {
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
    const visible = ref([
      { id: 'a', sceneId: 's1', kind: 'callout' } as never,
      { id: 'b', sceneId: 's1', kind: 'callout' } as never,
    ]);
    const projectable = author.projectableAnnotations(visible, sceneId);
    expect(projectable.value).toHaveLength(2);
  });

  it('Should append the preview when its sceneId matches', () => {
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
    const visible = ref([{ id: 'a', sceneId: 's1', kind: 'callout' } as never]);
    const draft = { id: 'd', sceneId: 's1', kind: 'callout' } as never;
    author.setPreview(draft);
    const projectable = author.projectableAnnotations(visible, sceneId);
    expect(projectable.value).toHaveLength(2);
    expect(projectable.value.map((a) => a.id)).toContain('d');
  });

  it('Should drop the preview when its sceneId differs from the renderable id', () => {
    const v = makeViewer();
    const api = makeAnnotationsApi();
    const sceneId = ref<string | null>('s1');
    const author = scope.run(() => useAnnotationAuthor(v, api, sceneId))!;
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
