/**
 * callout — pick handler + projector hooks. Pure: the viewer surface is
 * faked with a known transform so we can round-trip world→local→world and
 * assert exact equality on the anchor + normal + cursor-derived label
 * offset. The handler now mirrors the dimension flow — anchor pick on the
 * first click, cursor-driven offset on the second — so tests cover both
 * stages and the mid-flow preview channel.
 */
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  DEFAULT_LABEL_OFFSET_M,
  calloutKindHooks,
  createCalloutHandler,
  snapToWorldAxis,
  type CalloutViewer,
} from '../callout';
import type { UseAnnotationsApi } from '~/composables/useAnnotations';
import type { IdbCallout, IdbAnnotation } from '~/composables/useIdb';
import type { PickResult, SnapTarget } from '~/lib/viewer/types';

type Vec3 = [number, number, number];

/**
 * Fake viewer with a known rigid transform: world = local + translate.
 * `worldToObjectLocal(world) = world - translate`, dirs are identity.
 * Enough to exercise the round-trip semantics without booting Three.
 */
function makeViewer(translate: Vec3 = [0, 0, 0]): CalloutViewer & {
  setHit(r: PickResult | null): void;
  setSnap(s: SnapTarget | null): void;
  setUnproject(world: Vec3 | null): void;
  hoverLog: Array<SnapTarget | null>;
} {
  let nextHit: PickResult | null = null;
  let nextSnap: SnapTarget | null = null;
  let nextUnproject: Vec3 | null = null;
  const hoverLog: Array<SnapTarget | null> = [];
  return {
    raycastFromClient: () => nextHit,
    findSnapTarget: () => nextSnap,
    setSnapHover: (t) => {
      hoverLog.push(t);
    },
    getCameraPose: () => ({ position: [0, 0, 10], target: [0, 0, 0] }),
    worldToObjectLocal: (_g, w) => [
      w[0] - translate[0],
      w[1] - translate[1],
      w[2] - translate[2],
    ],
    objectLocalToWorld: (_g, l) => [
      l[0] + translate[0],
      l[1] + translate[1],
      l[2] + translate[2],
    ],
    worldDirToObjectLocal: (_g, d) => [d[0], d[1], d[2]],
    unprojectToPlane: () => (nextUnproject ? [...nextUnproject] : null),
    setHit: (r) => {
      nextHit = r;
    },
    setSnap: (s) => {
      nextSnap = s;
    },
    setUnproject: (w) => {
      nextUnproject = w;
    },
    hoverLog,
  };
}

function makeApi(): UseAnnotationsApi & { added: IdbAnnotation[] } {
  const added: IdbAnnotation[] = [];
  return {
    annotations: ref([]),
    visibleForScene: () => ref([]) as never,
    add: vi.fn(async (input) => {
      const id = `id-${added.length + 1}`;
      const now = '2026-04-29T00:00:00.000Z';
      const base = {
        id,
        sceneId: input.sceneId,
        groupId: input.groupId,
        createdAt: now,
        updatedAt: now,
      };
      added.push(
        input.kind === 'callout'
          ? {
              ...base,
              kind: 'callout',
              anchorLocal: input.anchorLocal,
              anchorNormalLocal: input.anchorNormalLocal,
              labelOffsetLocal: input.labelOffsetLocal,
              text: input.text ?? '',
            }
          : ({} as IdbAnnotation),
      );
      return id;
    }),
    update: vi.fn().mockResolvedValue(undefined),
    remove: vi.fn().mockResolvedValue(undefined),
    purgeForScene: vi.fn(),
    reload: vi.fn().mockResolvedValue(undefined),
    added,
  };
}

function makeAuthor() {
  const preview = ref<IdbAnnotation | null>(null);
  return {
    preview,
    setPreview: (a: IdbAnnotation | null) => {
      preview.value = a;
    },
  };
}

function makeHit(world: Vec3, normal: Vec3, groupId = 7): PickResult {
  return {
    groupId,
    worldPoint: { x: world[0], y: world[1], z: world[2] } as never,
    worldNormal: { x: normal[0], y: normal[1], z: normal[2] } as never,
  };
}

describe('createCalloutHandler — stage 1 (anchor pick)', () => {
  it('Should be a no-op when there is no active scene', async () => {
    const v = makeViewer();
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>(null);
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    const r = await handler.onClick({ x: 0, y: 0 });
    expect(r.done).toBe(true);
    expect(api.add).not.toHaveBeenCalled();
  });

  it('Should keep pick mode open when no anchor is hit', async () => {
    const v = makeViewer();
    v.setHit(null);
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    const r = await handler.onClick({ x: 0, y: 0 });
    expect(r.done).toBe(false);
    expect(api.add).not.toHaveBeenCalled();
    expect(author.preview.value).toBeNull();
  });

  it('Should stage the anchor on the first click without committing', async () => {
    const v = makeViewer([10, 0, 0]);
    v.setHit(makeHit([10.5, 1, 2], [0, 1, 0]));
    v.setUnproject([10.5, 1, 2]); // cursor still on anchor → ~zero offset
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    const r = await handler.onClick({ x: 0, y: 0 });
    expect(r.done).toBe(false);
    expect(api.add).not.toHaveBeenCalled();
    // A preview should have been seeded so the chip appears immediately.
    expect(author.preview.value).not.toBeNull();
    expect(author.preview.value?.kind).toBe('callout');
  });

  it('Should clear snap-hover after staging a snap-anchored callout', async () => {
    const v = makeViewer();
    v.setSnap({ kind: 'vertex', groupId: 5, worldPoint: [0, 0, 0] });
    v.setUnproject([0, 0, 0]);
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    await handler.onClick({ x: 0, y: 0 });
    expect(v.hoverLog).toContain(null);
  });
});

describe('createCalloutHandler — stage 2 (cursor offset & commit)', () => {
  it('Should commit at the cursor-derived offset, snapped to a world axis', async () => {
    const v = makeViewer();
    v.setHit(makeHit([0, 0, 0], [0, 1, 0]));
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });

    // Stage 1: anchor at world origin.
    v.setUnproject([0, 0, 0]);
    await handler.onClick({ x: 0, y: 0 });

    // Stage 2: cursor at (+0.05 along Y, with a tiny X drift).
    v.setUnproject([0.005, 0.05, 0]);
    const r = await handler.onClick({ x: 100, y: 100 });
    expect(r.done).toBe(true);
    expect(api.added).toHaveLength(1);
    const a = api.added[0] as IdbCallout;
    // Y dominates → snapped to +Y, X component zeroed.
    expect(a.labelOffsetLocal).toEqual([0, 0.05, 0]);
  });

  it('Should fall back to the anchor normal × default offset when committing without moving', async () => {
    const v = makeViewer();
    v.setHit(makeHit([0, 0, 0], [0, 1, 0]));
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });

    v.setUnproject([0, 0, 0]);
    await handler.onClick({ x: 0, y: 0 });
    // Cursor still on the anchor → offset below threshold → fallback.
    await handler.onClick({ x: 0, y: 0 });
    const a = api.added[0] as IdbCallout;
    expect(a.labelOffsetLocal).toEqual([0, DEFAULT_LABEL_OFFSET_M, 0]);
  });

  it('Should snap a non-vertical edge anchor with a fallback +Y normal', async () => {
    const v = makeViewer();
    v.setSnap({
      kind: 'edge',
      groupId: 5,
      worldPoint: [0, 0, 0],
      edgeA: [-1, 0, 0],
      edgeB: [1, 0, 0],
    });
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    v.setUnproject([0, 0, 0]);
    await handler.onClick({ x: 0, y: 0 });
    await handler.onClick({ x: 0, y: 0 }); // commit without moving
    const a = api.added[0] as IdbCallout;
    expect(a.anchorNormalLocal).toEqual([0, 1, 0]);
    expect(a.labelOffsetLocal).toEqual([0, DEFAULT_LABEL_OFFSET_M, 0]);
  });

  it('Should fall back to a horizontal world axis normal when the edge runs vertically', async () => {
    const v = makeViewer();
    v.setSnap({
      kind: 'edge',
      groupId: 5,
      worldPoint: [0, 0, 0],
      edgeA: [0, -1, 0],
      edgeB: [0, 1, 0],
    });
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    v.setUnproject([0, 0, 0]);
    await handler.onClick({ x: 0, y: 0 });
    await handler.onClick({ x: 0, y: 0 });
    const a = api.added[0] as IdbCallout;
    // Camera default at +Z → fallback normal is +Z.
    expect(a.anchorNormalLocal).toEqual([0, 0, 1]);
    expect(a.labelOffsetLocal).toEqual([0, 0, DEFAULT_LABEL_OFFSET_M]);
  });

  it('Should clear the preview after a successful commit', async () => {
    const v = makeViewer();
    v.setHit(makeHit([0, 0, 0], [0, 1, 0]));
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    v.setUnproject([0, 0, 0]);
    await handler.onClick({ x: 0, y: 0 });
    v.setUnproject([0, 0.05, 0]);
    await handler.onClick({ x: 0, y: 0 });
    expect(author.preview.value).toBeNull();
  });

  it('Should drive the live preview on every pointer move during the offset stage', async () => {
    const v = makeViewer();
    v.setHit(makeHit([0, 0, 0], [0, 1, 0]));
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    v.setUnproject([0, 0, 0]);
    await handler.onClick({ x: 0, y: 0 });

    v.setUnproject([0.04, 0, 0]);
    handler.onPointerMove({ x: 0, y: 0 });
    expect(author.preview.value).not.toBeNull();
    const p = author.preview.value as IdbCallout;
    expect(p.labelOffsetLocal).toEqual([0.04, 0, 0]);
  });

  it('Should drive the snap hover on every pointer move during the anchor stage', () => {
    const v = makeViewer();
    const target: SnapTarget = {
      kind: 'vertex',
      groupId: 5,
      worldPoint: [0, 0, 0],
    };
    v.setSnap(target);
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    handler.onPointerMove({ x: 5, y: 5 });
    expect(v.hoverLog).toContain(target);
  });
});

describe('createCalloutHandler — Esc', () => {
  it('Should clear stage state and preview on Esc', async () => {
    const v = makeViewer();
    v.setHit(makeHit([0, 0, 0], [0, 1, 0]));
    const api = makeApi();
    const author = makeAuthor();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    v.setUnproject([0, 0, 0]);
    await handler.onClick({ x: 0, y: 0 });
    expect(author.preview.value).not.toBeNull();
    handler.onEsc();
    expect(author.preview.value).toBeNull();
  });
});

describe('snapToWorldAxis', () => {
  it('Picks the dominant axis and zeros the others', () => {
    expect(snapToWorldAxis([0.005, 0.05, 0])).toEqual([0, 0.05, 0]);
    expect(snapToWorldAxis([0.05, 0.005, 0])).toEqual([0.05, 0, 0]);
    expect(snapToWorldAxis([0, 0.005, 0.05])).toEqual([0, 0, 0.05]);
  });

  it('Preserves the sign of the dominant axis', () => {
    expect(snapToWorldAxis([0, -0.05, 0])).toEqual([0, -0.05, 0]);
    expect(snapToWorldAxis([-0.05, 0, 0])).toEqual([-0.05, 0, 0]);
  });
});

describe('calloutKindHooks', () => {
  function callout(
    anchor: Vec3,
    offset: Vec3 = [0, DEFAULT_LABEL_OFFSET_M, 0],
  ): IdbCallout {
    const now = '2026-04-29T00:00:00.000Z';
    return {
      id: 'a',
      sceneId: 's',
      kind: 'callout',
      groupId: 1,
      anchorLocal: anchor,
      anchorNormalLocal: [0, 1, 0],
      labelOffsetLocal: offset,
      text: '',
      createdAt: now,
      updatedAt: now,
    };
  }

  it('Should return the world label position (anchor + offset) for the projector', () => {
    const a = callout([1, 2, 3], [0, 0.5, 0]);
    const identity = (_g: number, l: Vec3): Vec3 => l;
    expect(calloutKindHooks.primaryWorld(a, identity)).toEqual([1, 2.5, 3]);
  });

  it('Should build a leader from anchor → label using the lookup', () => {
    const a = callout([0, 0, 0], [0, 0.5, 0]);
    const lookup = (_g: number, l: Vec3): Vec3 => [
      l[0] + 10,
      l[1] + 10,
      l[2] + 10,
    ];
    const spec = calloutKindHooks.leaderSpec!(a, lookup);
    expect(spec).not.toBeNull();
    if (Array.isArray(spec)) throw new Error('expected single spec');
    expect(spec!.start).toEqual([10, 10, 10]);
    expect(spec!.end).toEqual([10, 10.5, 10]);
  });

  it('Should return null when the lookup cannot resolve the Object', () => {
    const a = callout([0, 0, 0]);
    const spec = calloutKindHooks.leaderSpec!(a, () => null);
    expect(spec).toBeNull();
  });
});
