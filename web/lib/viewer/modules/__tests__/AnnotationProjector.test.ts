/**
 * AnnotationProjector — pure projection logic.
 *
 * The viewer is faked. We control which (groupId, local) pairs resolve to
 * which world points and which world points project onto the screen, and
 * verify the projector mutates its internal Map in place rather than
 * allocating a new one each frame.
 */
import { describe, expect, it, vi } from 'vitest';
import {
  AnnotationProjector,
  type ProjectorViewer,
} from '../AnnotationProjector';
import type {
  IdbAnnotation,
  IdbCallout,
  IdbDimension,
} from '~/composables/useIdb';

type Vec3 = [number, number, number];

function makeViewer(): ProjectorViewer & {
  frameTick: () => void;
  setObjectLocalToWorld: (
    fn: (groupId: number, local: Vec3) => Vec3 | null,
  ) => void;
  setWorldToScreen: (
    fn: (world: Vec3) => { x: number; y: number; inFront: boolean } | null,
  ) => void;
} {
  let onFrameCb: (() => void) | null = null;
  let l2w: (groupId: number, local: Vec3) => Vec3 | null = (_g, l) => l;
  let w2s: (
    world: Vec3,
  ) => { x: number; y: number; inFront: boolean } | null = (w) => ({
    x: w[0],
    y: w[1],
    inFront: true,
  });
  return {
    objectLocalToWorld: (g, l) => l2w(g, l),
    worldToScreen: (w) => w2s(w),
    onFrame: (cb) => {
      onFrameCb = cb;
      return () => {
        onFrameCb = null;
      };
    },
    frameTick: () => onFrameCb?.(),
    setObjectLocalToWorld: (fn) => {
      l2w = fn;
    },
    setWorldToScreen: (fn) => {
      w2s = fn;
    },
  };
}

function callout(
  id: string,
  groupId: number,
  anchor: Vec3,
  labelOffset: Vec3 = [0, 0, 0],
): IdbCallout {
  const now = '2026-04-29T00:00:00.000Z';
  return {
    id,
    sceneId: 's',
    kind: 'callout',
    groupId,
    anchorLocal: anchor,
    anchorNormalLocal: [0, 1, 0],
    labelOffsetLocal: labelOffset,
    text: '',
    createdAt: now,
    updatedAt: now,
  };
}

function dimension(
  id: string,
  groupId: number,
  a1: Vec3,
  a2: Vec3,
  offset: Vec3 = [0, 0, 0],
): IdbDimension {
  const now = '2026-04-29T00:00:00.000Z';
  return {
    id,
    sceneId: 's',
    kind: 'dimension',
    groupId,
    anchor1: { groupId, local: a1 },
    anchor2: { groupId, local: a2 },
    offsetLocal: offset,
    createdAt: now,
    updatedAt: now,
  };
}

describe('AnnotationProjector', () => {
  it('Should project the callout label position (anchor + offset) on tick', () => {
    const v = makeViewer();
    const annotations: IdbAnnotation[] = [
      callout('a', 1, [3, 4, 0], [0, 0.5, 0]),
    ];
    const p = new AnnotationProjector(v, () => annotations);
    p.start();
    v.frameTick();
    const pos = p.getScreenPositions().get('a')!;
    expect(pos.x).toBe(3);
    expect(pos.y).toBe(4.5);
    expect(pos.inFront).toBe(true);
  });

  it('Should use the midpoint anchor for dimensions', () => {
    const v = makeViewer();
    const annotations: IdbAnnotation[] = [
      dimension('d', 1, [0, 0, 0], [10, 0, 0]),
    ];
    const p = new AnnotationProjector(v, () => annotations);
    p.start();
    v.frameTick();
    expect(p.getScreenPositions().get('d')?.x).toBe(5);
  });

  it('Should mutate the position map in place across ticks', () => {
    const v = makeViewer();
    const annotations: IdbAnnotation[] = [callout('a', 1, [1, 1, 0])];
    const p = new AnnotationProjector(v, () => annotations);
    p.start();
    v.frameTick();
    const map1 = p.getScreenPositions();
    const ref1 = map1.get('a');
    annotations[0] = callout('a', 1, [9, 9, 0]);
    v.frameTick();
    const map2 = p.getScreenPositions();
    expect(map2).toBe(map1);
    expect(map2.get('a')).toBe(ref1);
    expect(map2.get('a')?.x).toBe(9);
  });

  it('Should drop entries for annotations whose Object cannot be resolved', () => {
    const v = makeViewer();
    const annotations: IdbAnnotation[] = [callout('a', 1, [0, 0, 0])];
    const p = new AnnotationProjector(v, () => annotations);
    p.start();
    v.frameTick();
    expect(p.getScreenPositions().has('a')).toBe(true);
    v.setObjectLocalToWorld(() => null);
    v.frameTick();
    expect(p.getScreenPositions().has('a')).toBe(false);
  });

  it('Should drop entries removed from the source list between ticks', () => {
    const v = makeViewer();
    const list: IdbAnnotation[] = [
      callout('a', 1, [0, 0, 0]),
      callout('b', 2, [1, 1, 0]),
    ];
    const p = new AnnotationProjector(v, () => list);
    p.start();
    v.frameTick();
    expect([...p.getScreenPositions().keys()].sort()).toEqual(['a', 'b']);
    list.splice(0, 1);
    v.frameTick();
    expect([...p.getScreenPositions().keys()]).toEqual(['b']);
  });

  it('Should bump version on each tick', () => {
    const v = makeViewer();
    const p = new AnnotationProjector(v, () => []);
    p.start();
    const before = p.version.value;
    v.frameTick();
    v.frameTick();
    expect(p.version.value).toBe(before + 2);
  });

  it('Should let registerKind override the default primaryWorld', () => {
    const v = makeViewer();
    const annotations: IdbAnnotation[] = [
      callout('a', 1, [3, 4, 0], [10, 10, 10]),
    ];
    const p = new AnnotationProjector(v, () => annotations);
    p.registerKind('callout', { primaryWorld: () => [99, 99, 99] });
    p.start();
    v.frameTick();
    expect(p.getScreenPositions().get('a')?.x).toBe(99);
  });

  it('Should restore the previous hooks when the registration is undone', () => {
    const v = makeViewer();
    const annotations: IdbAnnotation[] = [
      callout('a', 1, [3, 4, 0], [0, 0.5, 0]),
    ];
    const p = new AnnotationProjector(v, () => annotations);
    const off = p.registerKind('callout', { primaryWorld: () => [0, 0, 0] });
    p.start();
    v.frameTick();
    expect(p.getScreenPositions().get('a')?.x).toBe(0);
    off();
    v.frameTick();
    // After unregister, default hooks (anchor + offset) take over again.
    expect(p.getScreenPositions().get('a')?.y).toBe(4.5);
  });

  it('Should publish leader specs to the viewer when a kind registers them', () => {
    const v = makeViewer();
    const setRenderedLeaders = vi.fn();
    (v as ProjectorViewer).setRenderedLeaders = setRenderedLeaders;
    const annotations: IdbAnnotation[] = [
      callout('a', 1, [0, 0, 0], [0, 1, 0]),
    ];
    const p = new AnnotationProjector(v, () => annotations);
    p.registerKind('callout', {
      primaryWorld: (a, lookup) => lookup(a.groupId, a.anchorLocal),
      leaderSpec: (a, lookup) => {
        const start = lookup(a.groupId, a.anchorLocal);
        const end = lookup(a.groupId, [
          a.anchorLocal[0] + a.labelOffsetLocal[0],
          a.anchorLocal[1] + a.labelOffsetLocal[1],
          a.anchorLocal[2] + a.labelOffsetLocal[2],
        ]);
        if (!start || !end) return null;
        return { start, end };
      },
    });
    p.start();
    v.frameTick();
    expect(setRenderedLeaders).toHaveBeenCalledOnce();
    const map = setRenderedLeaders.mock.calls[0][0] as Map<
      string,
      { start: Vec3; end: Vec3 }
    >;
    expect(map.get('a')?.start).toEqual([0, 0, 0]);
    expect(map.get('a')?.end).toEqual([0, 1, 0]);
  });

  it('Should emit composite ids when leaderSpec returns an array', () => {
    const v = makeViewer();
    const setRenderedLeaders = vi.fn();
    (v as ProjectorViewer).setRenderedLeaders = setRenderedLeaders;
    const annotations: IdbAnnotation[] = [callout('c', 1, [0, 0, 0])];
    const p = new AnnotationProjector(v, () => annotations);
    p.registerKind('callout', {
      primaryWorld: () => [0, 0, 0],
      leaderSpec: () => [
        { start: [0, 0, 0], end: [1, 0, 0] },
        { start: [0, 0, 0], end: [0, 1, 0] },
      ],
    });
    p.start();
    v.frameTick();
    const map = setRenderedLeaders.mock.calls[0][0] as Map<
      string,
      { start: Vec3; end: Vec3 }
    >;
    expect([...map.keys()].sort()).toEqual(['c#0', 'c#1']);
  });

  it('Should project aux world points to a parallel screen-position map', () => {
    const v = makeViewer();
    const annotations: IdbAnnotation[] = [callout('c', 1, [0, 0, 0])];
    const p = new AnnotationProjector(v, () => annotations);
    p.registerKind('callout', {
      primaryWorld: () => [0, 0, 0],
      auxWorld: () => [
        [3, 4, 0],
        [9, 12, 0],
      ],
    });
    p.start();
    v.frameTick();
    const aux = p.getAuxScreenPositions().get('c');
    expect(aux).toHaveLength(2);
    expect(aux![0].x).toBe(3);
    expect(aux![0].y).toBe(4);
    expect(aux![1].x).toBe(9);
  });

  it('Should expose measure() output through getMeasurements()', () => {
    const v = makeViewer();
    const annotations: IdbAnnotation[] = [
      dimension('d', 1, [0, 0, 0], [3, 4, 0]),
    ];
    const p = new AnnotationProjector(v, () => annotations);
    p.registerKind('dimension', {
      primaryWorld: () => [0, 0, 0],
      // Hook intentionally returns world-space distance (5 = √(3²+4²)) so
      // the test would fail under the local-frame Math.hypot bug if the
      // projector ignored measure() and let DimensionLabel compute itself.
      measure: (a, lookup) => {
        const aw = lookup(a.anchor1.groupId, a.anchor1.local);
        const bw = lookup(a.anchor2.groupId, a.anchor2.local);
        if (!aw || !bw) return null;
        return Math.hypot(bw[0] - aw[0], bw[1] - aw[1], bw[2] - aw[2]);
      },
    });
    p.start();
    v.frameTick();
    expect(p.getMeasurements().get('d')).toBeCloseTo(5, 9);
  });

  it('Should drop measurements for annotations no longer in the list', () => {
    const v = makeViewer();
    const list: IdbAnnotation[] = [dimension('d', 1, [0, 0, 0], [1, 0, 0])];
    const p = new AnnotationProjector(v, () => list);
    p.registerKind('dimension', {
      primaryWorld: () => [0, 0, 0],
      measure: () => 1.234,
    });
    p.start();
    v.frameTick();
    expect(p.getMeasurements().has('d')).toBe(true);
    list.length = 0;
    v.frameTick();
    expect(p.getMeasurements().has('d')).toBe(false);
  });

  it('Should stop ticking after dispose', () => {
    const v = makeViewer();
    const onFrameSpy = vi.spyOn(v, 'onFrame');
    const list: IdbAnnotation[] = [callout('a', 1, [0, 0, 0])];
    const p = new AnnotationProjector(v, () => list);
    p.start();
    expect(onFrameSpy).toHaveBeenCalledOnce();
    p.dispose();
    v.frameTick();
    expect(p.getScreenPositions().size).toBe(0);
  });
});
