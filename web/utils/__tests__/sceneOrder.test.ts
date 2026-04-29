import { describe, expect, it } from 'vitest';
import {
  moveSceneToIndex,
  nextSceneOrder,
  removeScene,
  renumberScenes,
} from '../sceneOrder';

describe('renumberScenes', () => {
  it('Should assign 0..n-1 based on array order', () => {
    const result = renumberScenes([
      { id: 'a', order: 5 },
      { id: 'b', order: 2 },
      { id: 'c', order: 9 },
    ]);
    expect(result.map((s) => s.order)).toEqual([0, 1, 2]);
    expect(result.map((s) => s.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('removeScene', () => {
  it('Should drop the matching id and renumber survivors', () => {
    const result = removeScene(
      [
        { id: 'a', order: 0 },
        { id: 'b', order: 1 },
        { id: 'c', order: 2 },
      ],
      'b',
    );
    expect(result).toEqual([
      { id: 'a', order: 0 },
      { id: 'c', order: 1 },
    ]);
  });

  it('Should renumber even when the id is missing', () => {
    const result = removeScene(
      [
        { id: 'a', order: 5 },
        { id: 'b', order: 7 },
      ],
      'missing',
    );
    expect(result).toEqual([
      { id: 'a', order: 0 },
      { id: 'b', order: 1 },
    ]);
  });
});

describe('moveSceneToIndex', () => {
  const scenes = [
    { id: 'a', order: 0 },
    { id: 'b', order: 1 },
    { id: 'c', order: 2 },
    { id: 'd', order: 3 },
  ];

  it('Should move a scene forward and renumber', () => {
    const result = moveSceneToIndex(scenes, 'a', 2);
    expect(result.map((s) => s.id)).toEqual(['b', 'c', 'a', 'd']);
    expect(result.map((s) => s.order)).toEqual([0, 1, 2, 3]);
  });

  it('Should move a scene backward and renumber', () => {
    const result = moveSceneToIndex(scenes, 'd', 1);
    expect(result.map((s) => s.id)).toEqual(['a', 'd', 'b', 'c']);
  });

  it('Should return the original array when the move is a no-op', () => {
    const result = moveSceneToIndex(scenes, 'b', 1);
    expect(result).toBe(scenes);
  });

  it('Should clamp target index to bounds', () => {
    const forward = moveSceneToIndex(scenes, 'a', 99);
    expect(forward.map((s) => s.id)).toEqual(['b', 'c', 'd', 'a']);
    const back = moveSceneToIndex(scenes, 'd', -5);
    expect(back.map((s) => s.id)).toEqual(['d', 'a', 'b', 'c']);
  });

  it('Should return the original array when the id is unknown', () => {
    const result = moveSceneToIndex(scenes, 'unknown', 1);
    expect(result).toBe(scenes);
  });
});

describe('nextSceneOrder', () => {
  it('Should return 0 for an empty list', () => {
    expect(nextSceneOrder([])).toBe(0);
  });

  it('Should return max+1 from existing orders', () => {
    expect(nextSceneOrder([{ order: 0 }, { order: 4 }, { order: 2 }])).toBe(5);
  });
});
