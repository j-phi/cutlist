/**
 * callout — pick handler + projector hooks. Pure: the viewer surface is
 * faked with a known transform so we can round-trip world→local→world and
 * assert exact equality on the anchor + normal + default label offset.
 */
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  DEFAULT_LABEL_OFFSET_M,
  calloutKindHooks,
  createCalloutHandler,
  type CalloutViewer,
} from '../callout';
import type { UseAnnotationsApi } from '~/composables/useAnnotations';
import type { IdbCallout, IdbAnnotation } from '~/composables/useIdb';
import type { PickResult, SnapTarget } from '~/lib/viewer/types';

type Vec3 = [number, number, number];

/**
 * Fake viewer with a known rigid transform: world = local + translate.
 * So `worldToObjectLocal(world) = world - translate` and dirs are identity.
 * That's enough to exercise the round-trip semantics without booting Three.
 */
function makeViewer(translate: Vec3 = [0, 0, 0]): CalloutViewer & {
  setHit(r: PickResult | null): void;
  setSnap(s: SnapTarget | null): void;
  hoverLog: Array<SnapTarget | null>;
} {
  let nextHit: PickResult | null = null;
  let nextSnap: SnapTarget | null = null;
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
    worldDirToObjectLocal: (_g, d) => [d[0], d[1], d[2]],
    setHit: (r) => {
      nextHit = r;
    },
    setSnap: (s) => {
      nextSnap = s;
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

function makeHit(world: Vec3, normal: Vec3, groupId = 7): PickResult {
  return {
    groupId,
    worldPoint: { x: world[0], y: world[1], z: world[2] } as never,
    worldNormal: { x: normal[0], y: normal[1], z: normal[2] } as never,
  };
}

describe('createCalloutHandler — onClick', () => {
  it('Should be a no-op when there is no active scene', async () => {
    const v = makeViewer();
    const api = makeApi();
    const sceneId = ref<string | null>(null);
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
    });
    const r = await handler.onClick({ x: 0, y: 0 });
    expect(r.done).toBe(true);
    expect(api.add).not.toHaveBeenCalled();
  });

  it('Should keep pick mode open when no face is hit', async () => {
    const v = makeViewer();
    v.setHit(null);
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
    });
    const r = await handler.onClick({ x: 0, y: 0 });
    expect(r.done).toBe(false);
    expect(api.add).not.toHaveBeenCalled();
  });

  it('Should commit a callout in Object-local space at default offset', async () => {
    const translate: Vec3 = [10, 0, 0];
    const v = makeViewer(translate);
    v.setHit(makeHit([10.5, 1, 2], [0, 1, 0]));
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
    });

    const r = await handler.onClick({ x: 0, y: 0 });
    expect(r.done).toBe(true);
    expect(r.draftId).toBe('id-1');
    expect(api.added).toHaveLength(1);
    const a = api.added[0] as IdbCallout;
    expect(a.anchorLocal).toEqual([0.5, 1, 2]);
    expect(a.anchorNormalLocal).toEqual([0, 1, 0]);
    expect(a.labelOffsetLocal).toEqual([0, DEFAULT_LABEL_OFFSET_M, 0]);
    expect(a.text).toBe('');
  });

  it('Should normalize the face normal before scaling the offset', async () => {
    const v = makeViewer();
    // Non-unit normal — handler normalises before applying the offset.
    v.setHit(makeHit([0, 0, 0], [3, 4, 0]));
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
    });
    await handler.onClick({ x: 0, y: 0 });
    const a = api.added[0] as IdbCallout;
    expect(a.anchorNormalLocal[0]).toBeCloseTo(0.6, 9);
    expect(a.anchorNormalLocal[1]).toBeCloseTo(0.8, 9);
    expect(a.labelOffsetLocal[0]).toBeCloseTo(0.6 * DEFAULT_LABEL_OFFSET_M, 9);
    expect(a.labelOffsetLocal[1]).toBeCloseTo(0.8 * DEFAULT_LABEL_OFFSET_M, 9);
  });

  it('Should commit at the vertex snap point with a world-vertical offset', async () => {
    const v = makeViewer();
    v.setSnap({ kind: 'vertex', groupId: 5, worldPoint: [1, 2, 3] });
    // Even with a face hit available, snap takes priority.
    v.setHit(makeHit([99, 99, 99], [1, 0, 0], 999));
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
    });
    const r = await handler.onClick({ x: 0, y: 0 });
    expect(r.done).toBe(true);
    const a = api.added[0] as IdbCallout;
    expect(a.groupId).toBe(5);
    expect(a.anchorLocal).toEqual([1, 2, 3]);
    // Vertices always offset along world +Y so the label sits directly above.
    expect(a.anchorNormalLocal).toEqual([0, 1, 0]);
  });

  it('Should snap a non-vertical edge with a world +Y offset', async () => {
    const v = makeViewer();
    // Edge along world X — +Y is perpendicular to it, so the label goes up.
    v.setSnap({
      kind: 'edge',
      groupId: 5,
      worldPoint: [0, 0, 0],
      edgeA: [-1, 0, 0],
      edgeB: [1, 0, 0],
    });
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
    });
    await handler.onClick({ x: 0, y: 0 });
    const a = api.added[0] as IdbCallout;
    expect(a.anchorNormalLocal).toEqual([0, 1, 0]);
  });

  it('Should fall back to a horizontal world axis when the edge runs vertically', async () => {
    const v = makeViewer();
    // Edge runs along +Y → +Y would be parallel to the edge, so the
    // callout must pick the camera-facing horizontal axis. Camera default
    // is at +Z, so we expect +Z.
    v.setSnap({
      kind: 'edge',
      groupId: 5,
      worldPoint: [0, 0, 0],
      edgeA: [0, -1, 0],
      edgeB: [0, 1, 0],
    });
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
    });
    await handler.onClick({ x: 0, y: 0 });
    const a = api.added[0] as IdbCallout;
    expect(a.anchorNormalLocal).toEqual([0, 0, 1]);
  });

  it('Should clear the snap hover after a successful commit', async () => {
    const v = makeViewer();
    v.setSnap({ kind: 'vertex', groupId: 5, worldPoint: [0, 0, 0] });
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
    });
    await handler.onClick({ x: 0, y: 0 });
    expect(v.hoverLog).toContain(null);
  });

  it('Should drive the hover indicator on every pointer move', () => {
    const v = makeViewer();
    const target: SnapTarget = {
      kind: 'vertex',
      groupId: 5,
      worldPoint: [0, 0, 0],
    };
    v.setSnap(target);
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const handler = createCalloutHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
    });
    handler.onPointerMove({ x: 5, y: 5 });
    expect(v.hoverLog).toContain(target);
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
