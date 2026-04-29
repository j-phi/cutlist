/**
 * Dimension annotation — pure helpers + handler integration.
 *
 * The viewer is faked with a known rigid transform so we can round-trip
 * world↔local without booting Three.js. The 45° snap, the three-step
 * pick flow, and the cross-Object anchor wiring are all exercised through
 * the public hook surface.
 */
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import {
  createDimensionHandler,
  createDimensionKindHooks,
  formatLength,
  snapOffsetToWorldAxis,
  type DimensionViewer,
} from '../dimension';
import { PREVIEW_ANNOTATION_ID } from '~/composables/useAnnotationAuthor';
import type { UseAnnotationsApi } from '~/composables/useAnnotations';
import type { IdbAnnotation, IdbDimension } from '~/composables/useIdb';
import type { SnapTarget } from '~/lib/viewer/types';

type Vec3 = [number, number, number];

function makeViewer(): DimensionViewer & {
  setSnap(s: SnapTarget | null): void;
  hoverLog: Array<SnapTarget | null>;
} {
  let nextSnap: SnapTarget | null = null;
  const hoverLog: Array<SnapTarget | null> = [];
  return {
    findSnapTarget: () => nextSnap,
    setSnapHover: (t) => {
      hoverLog.push(t);
    },
    worldToObjectLocal: (_g, w) => [w[0], w[1], w[2]],
    objectLocalToWorld: (_g, l) => [l[0], l[1], l[2]],
    // Cursor (x, y) maps to world (x/100, y/100, 0) — gives step-3 tests a
    // direct linear cursor→world relationship for asserting magnitude.
    unprojectToPlane: (x, y) => [x / 100, y / 100, 0],
    getCameraPose: () => ({ position: [0, 0, 5], target: [0, 0, 0] }),
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
        input.kind === 'dimension'
          ? {
              ...base,
              kind: 'dimension',
              anchor1: input.anchor1,
              anchor2: input.anchor2,
              offsetLocal: input.offsetLocal,
              text: input.text,
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

function vertex(groupId: number, p: Vec3): SnapTarget {
  return { kind: 'vertex', groupId, worldPoint: p };
}

function edge(groupId: number, a: Vec3, b: Vec3): SnapTarget {
  return {
    kind: 'edge',
    groupId,
    worldPoint: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2],
    edgeA: a,
    edgeB: b,
  };
}

// ─── Pure helpers ──────────────────────────────────────────────────────────

describe('snapOffsetToWorldAxis', () => {
  it('Should snap a 30° offset around an X-axis line to 45° in the YZ plane', () => {
    const line = { a: [0, 0, 0] as Vec3, b: [1, 0, 0] as Vec3 };
    // Raw offset at 30° in YZ — should land on 45°.
    const mag = 0.1;
    const a30 = (30 * Math.PI) / 180;
    const raw: Vec3 = [0, Math.cos(a30) * mag, Math.sin(a30) * mag];
    const out = snapOffsetToWorldAxis(raw, line);
    // Snapped angle 45° → equal Y & Z components, magnitude preserved.
    const snapY = Math.cos(Math.PI / 4) * mag;
    const snapZ = Math.sin(Math.PI / 4) * mag;
    expect(out[0]).toBeCloseTo(0, 9);
    expect(out[1]).toBeCloseTo(snapY, 9);
    expect(out[2]).toBeCloseTo(snapZ, 9);
  });

  it('Should drop the parallel component along the dimension line', () => {
    const line = { a: [0, 0, 0] as Vec3, b: [1, 0, 0] as Vec3 };
    // Mostly along +Y but with an X component that should drop out.
    const raw: Vec3 = [0.5, 0.5, 0];
    const out = snapOffsetToWorldAxis(raw, line);
    expect(out[0]).toBeCloseTo(0, 9);
    // Magnitude of the snapped offset matches the perp component magnitude.
    expect(Math.hypot(out[0], out[1], out[2])).toBeCloseTo(0.5, 9);
  });

  it('Should return zero for a zero-length line', () => {
    expect(
      snapOffsetToWorldAxis([1, 1, 1], { a: [0, 0, 0], b: [0, 0, 0] }),
    ).toEqual([0, 0, 0]);
  });
});

describe('formatLength', () => {
  it('Rounds metric lengths to whole millimetres', () => {
    expect(formatLength(0.1234, 'mm')).toBe('123mm');
    expect(formatLength(1.8, 'mm')).toBe('1800mm');
  });
  it('Produces 2-decimal inches', () => {
    expect(formatLength(0.0254, 'in')).toBe('1.00in');
    expect(formatLength(0.5, 'in')).toBe('19.69in');
  });
});

// ─── Handler integration ───────────────────────────────────────────────────

describe('createDimensionHandler', () => {
  function makeAuthor() {
    const previews: Array<IdbAnnotation | null> = [];
    return {
      previews,
      setPreview(a: IdbAnnotation | null) {
        previews.push(a);
      },
    };
  }

  it('Stages anchor1 on the first click and keeps pick mode open', async () => {
    const v = makeViewer();
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const author = makeAuthor();
    const handler = createDimensionHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    v.setSnap(vertex(1, [0, 0, 0]));
    const r1 = await handler.onClick({ x: 0, y: 0 });
    expect(r1.done).toBe(false);
    expect(api.add).not.toHaveBeenCalled();
  });

  it('Stages anchor2 on the second click on a different Object', async () => {
    const v = makeViewer();
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const handler = createDimensionHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author: makeAuthor(),
    });
    v.setSnap(vertex(1, [0, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });
    v.setSnap(vertex(2, [1, 0, 0]));
    const r2 = await handler.onClick({ x: 0, y: 0 });
    expect(r2.done).toBe(false);
    expect(api.add).not.toHaveBeenCalled();
  });

  it('Forwards snap hover to the viewer during step 1 and step 2', () => {
    const v = makeViewer();
    const handler = createDimensionHandler({
      viewer: v,
      annotationsApi: makeApi(),
      activeSceneId: ref('s1'),
      author: makeAuthor(),
    });
    const target = vertex(1, [0, 0, 0]);
    v.setSnap(target);
    handler.onPointerMove({ x: 5, y: 5 });
    expect(v.hoverLog).toContain(target);
  });

  it('Drives a preview annotation during step 3 pointer-move', async () => {
    const v = makeViewer();
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const author = makeAuthor();
    const handler = createDimensionHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    v.setSnap(vertex(1, [0, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });
    v.setSnap(vertex(1, [1, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });
    handler.onPointerMove({ x: 100, y: 200 });
    const last = author.previews[author.previews.length - 1];
    expect(last).not.toBeNull();
    expect(last!.id).toBe(PREVIEW_ANNOTATION_ID);
    expect(last!.kind).toBe('dimension');
  });

  it('Stages both endpoints from a single edge click and skips step 2', async () => {
    const v = makeViewer();
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const author = makeAuthor();
    const handler = createDimensionHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    v.setSnap(edge(7, [0, 0, 0], [1, 0, 0]));
    const r1 = await handler.onClick({ x: 0, y: 0 });
    expect(r1.done).toBe(false);
    // After one edge click, pointer-move should drive the preview directly —
    // proving anchor2 was already populated from the edge.
    handler.onPointerMove({ x: 50, y: 50 });
    const last = author.previews[author.previews.length - 1];
    expect(last).not.toBeNull();
    expect(last!.kind).toBe('dimension');
    if (last && last.kind === 'dimension') {
      expect(last.anchor1.local).toEqual([0, 0, 0]);
      expect(last.anchor2.local).toEqual([1, 0, 0]);
    }
  });

  it('Preserves the offset magnitude as the cursor moves further from mid', async () => {
    const v = makeViewer();
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const author = makeAuthor();
    const handler = createDimensionHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    // Stage a dimension along world X from (-1,0,0) to (1,0,0). Mid is at
    // origin so the cursor unproject (x/100, y/100, 0) acts as a direct
    // perpendicular world offset under our identity transforms.
    v.setSnap(vertex(1, [-1, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });
    v.setSnap(vertex(1, [1, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });

    // Cursor 100px above mid → world offset y = 1.0 in the test viewer.
    handler.onPointerMove({ x: 0, y: 100 });
    const close = author.previews[author.previews.length - 1];
    expect(close).not.toBeNull();
    if (close && close.kind === 'dimension') {
      const closeMag = Math.hypot(...close.offsetLocal);
      // Cursor 300px above mid → 3× further.
      handler.onPointerMove({ x: 0, y: 300 });
      const far = author.previews[author.previews.length - 1];
      if (far && far.kind === 'dimension') {
        const farMag = Math.hypot(...far.offsetLocal);
        // Magnitude must scale with cursor distance — the regression we hit
        // was Three.js `transformDirection` normalising the offset to
        // unit length, locking the witness lines to a "preset distance".
        expect(farMag).toBeGreaterThan(closeMag * 2);
      } else {
        throw new Error('expected dimension preview');
      }
    } else {
      throw new Error('expected dimension preview');
    }
  });

  it('Updates the hint reactively after each click', async () => {
    const v = makeViewer();
    const handler = createDimensionHandler({
      viewer: v,
      annotationsApi: makeApi(),
      activeSceneId: ref('s1'),
      author: makeAuthor(),
    });
    expect(handler.hint()).toMatch(/two points or an edge/);
    v.setSnap(vertex(1, [0, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });
    expect(handler.hint()).toMatch(/second point/);
    v.setSnap(vertex(1, [1, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });
    expect(handler.hint()).toMatch(/set offset/);
  });

  it('Commits a dimension across two Objects on the third click', async () => {
    const v = makeViewer();
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const handler = createDimensionHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author: makeAuthor(),
    });
    v.setSnap(vertex(1, [0, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });
    v.setSnap(vertex(2, [1, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });
    const r3 = await handler.onClick({ x: 0, y: 0 });
    expect(r3.done).toBe(true);
    expect(api.added).toHaveLength(1);
    const dim = api.added[0] as IdbDimension;
    expect(dim.anchor1.groupId).toBe(1);
    expect(dim.anchor2.groupId).toBe(2);
    expect(dim.groupId).toBe(1);
  });

  it('Resets staged state on Esc', async () => {
    const v = makeViewer();
    const api = makeApi();
    const sceneId = ref<string | null>('s1');
    const author = makeAuthor();
    const handler = createDimensionHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: sceneId,
      author,
    });
    v.setSnap(vertex(1, [0, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });
    v.setSnap(vertex(1, [1, 0, 0]));
    await handler.onClick({ x: 0, y: 0 });
    handler.onEsc();
    // After Esc, a fresh first click stages anchor1 again — meaning the
    // previous staged state was cleared.
    v.setSnap(vertex(3, [0, 0, 0]));
    const r = await handler.onClick({ x: 0, y: 0 });
    expect(r.done).toBe(false);
    expect(api.add).not.toHaveBeenCalled();
  });

  it('Ignores clicks with no snap target during step 1', async () => {
    const v = makeViewer();
    const api = makeApi();
    const handler = createDimensionHandler({
      viewer: v,
      annotationsApi: api,
      activeSceneId: ref('s1'),
      author: makeAuthor(),
    });
    v.setSnap(null);
    const r = await handler.onClick({ x: 0, y: 0 });
    expect(r.done).toBe(false);
  });
});

// ─── Projector hooks ───────────────────────────────────────────────────────

describe('createDimensionKindHooks', () => {
  function dim(
    a1: Vec3,
    a2: Vec3,
    offset: Vec3 = [0, 0, 0],
    g1 = 1,
    g2 = 1,
  ): IdbDimension {
    const now = '2026-04-29T00:00:00.000Z';
    return {
      id: 'd',
      sceneId: 's',
      kind: 'dimension',
      groupId: g1,
      anchor1: { groupId: g1, local: a1 },
      anchor2: { groupId: g2, local: a2 },
      offsetLocal: offset,
      createdAt: now,
      updatedAt: now,
    };
  }

  function viewerStub() {
    return {
      getCameraPose: () => ({
        position: [0, 0, 5] as Vec3,
        target: [0, 0, 0] as Vec3,
      }),
    };
  }

  it('Emits three leader segments for an offset dimension', () => {
    const hooks = createDimensionKindHooks(viewerStub());
    const a = dim([0, 0, 0], [1, 0, 0], [0, 0.1, 0]);
    const lookup = (_g: number, l: Vec3): Vec3 => l;
    const specs = hooks.leaderSpec!(a, lookup);
    expect(Array.isArray(specs)).toBe(true);
    expect((specs as unknown as Array<unknown>).length).toBe(3);
  });

  it('Emits tick caps when the offset is near zero', () => {
    const hooks = createDimensionKindHooks(viewerStub());
    const a = dim([0, 0, 0], [1, 0, 0], [0, 0, 0]);
    const lookup = (_g: number, l: Vec3): Vec3 => l;
    const specs = hooks.leaderSpec!(a, lookup) as unknown as Array<{
      start: Vec3;
      end: Vec3;
    }>;
    expect(specs).toHaveLength(3);
    // Main line goes a→b. The two tick caps share their midpoints with a and b
    // respectively, so each cap's centre lands at one of the endpoints.
    const centres = specs
      .slice(1)
      .map((s) => [
        (s.start[0] + s.end[0]) / 2,
        (s.start[1] + s.end[1]) / 2,
        (s.start[2] + s.end[2]) / 2,
      ]);
    // After Z-bias the centres aren't exact, but the X coords match.
    expect(centres[0][0]).toBeCloseTo(0, 6);
    expect(centres[1][0]).toBeCloseTo(1, 6);
  });

  it('Resolves cross-Object anchors via the lookup', () => {
    const hooks = createDimensionKindHooks(viewerStub());
    const a = dim([0, 0, 0], [0, 0, 0], [0, 0.1, 0], 1, 2);
    const lookup = (g: number, l: Vec3): Vec3 =>
      g === 1 ? l : [l[0] + 5, l[1], l[2]];
    const specs = hooks.leaderSpec!(a, lookup) as unknown as Array<{
      start: Vec3;
      end: Vec3;
    }>;
    // The main line spans from (anchor1 + offset) to (anchor2 + offset),
    // and anchor2 lives at world (5, 0, 0) thanks to the lookup.
    const main = specs[0];
    expect(Math.abs(main.end[0] - main.start[0])).toBeCloseTo(5, 6);
  });

  it('Returns null when an anchor cannot be resolved', () => {
    const hooks = createDimensionKindHooks(viewerStub());
    const a = dim([0, 0, 0], [1, 0, 0], [0, 0.1, 0]);
    const specs = hooks.leaderSpec!(a, () => null);
    expect(specs).toBeNull();
  });

  it('Exposes aux world points for the main-line endpoints', () => {
    const hooks = createDimensionKindHooks(viewerStub());
    const a = dim([0, 0, 0], [1, 0, 0], [0, 0.1, 0]);
    const lookup = (_g: number, l: Vec3): Vec3 => l;
    const aux = hooks.auxWorld!(a, lookup);
    expect(aux).not.toBeNull();
    expect(aux!).toHaveLength(2);
  });
});
