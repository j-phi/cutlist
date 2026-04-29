import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EventBus } from '../EventBus';
import { Highlighter } from '../Highlighter';
import { ObjectRegistry } from '../ObjectRegistry';
import type { ViewerEvent } from '../../types';

function makeHighlighter(): Highlighter {
  const bus = new EventBus<ViewerEvent>();
  const registry = new ObjectRegistry({
    bus,
    requestRender: vi.fn(),
    oneScale: new THREE.Vector3(1, 1, 1),
    scratchMatrix: new THREE.Matrix4(),
  });
  return new Highlighter({ THREE, registry, requestRender: vi.fn() });
}

describe('Highlighter get/set round-trip', () => {
  it('getSelected returns the ids passed to setSelected', () => {
    const h = makeHighlighter();
    h.setSelected([1, 4, 2]);
    expect(h.getSelected().sort()).toEqual([1, 2, 4]);
  });

  it('getHovered returns the ids passed to setHovered', () => {
    const h = makeHighlighter();
    h.setHovered([7]);
    expect(h.getHovered()).toEqual([7]);
  });

  it('captures and restores selection state (used by thumbnail capture)', () => {
    const h = makeHighlighter();
    h.setSelected([3, 5]);
    h.setHovered([9]);

    const snapHovered = h.getHovered();
    const snapSelected = h.getSelected();

    h.setSelected([]);
    h.setHovered([]);
    expect(h.getSelected()).toEqual([]);
    expect(h.getHovered()).toEqual([]);

    h.setSelected(snapSelected);
    h.setHovered(snapHovered);
    expect(h.getSelected().sort()).toEqual([3, 5]);
    expect(h.getHovered()).toEqual([9]);
  });

  it('returns a fresh array each call (mutation safe)', () => {
    const h = makeHighlighter();
    h.setSelected([1, 2]);
    const first = h.getSelected();
    first.push(99);
    expect(h.getSelected().sort()).toEqual([1, 2]);
  });
});
