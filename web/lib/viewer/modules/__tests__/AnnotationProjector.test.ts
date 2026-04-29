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

function callout(id: string, groupId: number, anchor: Vec3): IdbCallout {
  const now = '2026-04-29T00:00:00.000Z';
  return {
    id,
    sceneId: 's',
    kind: 'callout',
    groupId,
    anchorLocal: anchor,
    anchorNormalLocal: [0, 1, 0],
    labelOffsetLocal: [0, 0.1, 0],
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
): IdbDimension {
  const now = '2026-04-29T00:00:00.000Z';
  return {
    id,
    sceneId: 's',
    kind: 'dimension',
    groupId,
    anchor1Local: a1,
    anchor2Local: a2,
    offsetLocal: [0, 0.1, 0],
    createdAt: now,
    updatedAt: now,
  };
}

describe('AnnotationProjector', () => {
  it('Should project the callout anchor on tick', () => {
    const v = makeViewer();
    const annotations: IdbAnnotation[] = [callout('a', 1, [3, 4, 0])];
    const p = new AnnotationProjector(v, () => annotations);
    p.start();
    v.frameTick();
    const pos = p.getScreenPositions().get('a')!;
    expect(pos.x).toBe(3);
    expect(pos.y).toBe(4);
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
