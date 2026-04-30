import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { EventBus } from '../EventBus';
import { Highlighter } from '../Highlighter';
import { ObjectRegistry } from '../ObjectRegistry';
import type { ObjectRecord, ViewerEvent } from '../../types';

function makeHighlighter(): {
  h: Highlighter;
  registry: ObjectRegistry;
  requestRender: ReturnType<typeof vi.fn>;
} {
  const bus = new EventBus<ViewerEvent>();
  const requestRender = vi.fn();
  const registry = new ObjectRegistry({
    bus,
    requestRender,
    oneScale: new THREE.Vector3(1, 1, 1),
    scratchMatrix: new THREE.Matrix4(),
  });
  return {
    h: new Highlighter({ THREE, registry, requestRender }),
    registry,
    requestRender,
  };
}

function makeRecord(groupId: number, batchIds: number[]): ObjectRecord {
  return {
    groupId,
    partNumber: 1,
    name: `Part_${groupId}`,
    batchIds,
    originalMatrix: new THREE.Matrix4(),
    originalMatrixInverse: new THREE.Matrix4(),
    center: new THREE.Vector3(),
    offset: {
      position: new THREE.Vector3(),
      quaternion: new THREE.Quaternion(),
    },
    offsetMatrix: new THREE.Matrix4(),
    offsetMatrixInverse: new THREE.Matrix4(),
    edgesLocal: new Float32Array(0),
    boundsLocalCenter: new THREE.Vector3(),
    boundsLocalRadius: 0,
    boundsLocalMin: new THREE.Vector3(),
    boundsLocalMax: new THREE.Vector3(),
    edgeLines: null,
  };
}

describe('Highlighter get/set round-trip', () => {
  it('getSelected returns the ids passed to setSelected', () => {
    const { h } = makeHighlighter();
    h.setSelected([1, 4, 2]);
    expect(h.getSelected().sort()).toEqual([1, 2, 4]);
  });

  it('getHovered returns the ids passed to setHovered', () => {
    const { h } = makeHighlighter();
    h.setHovered([7]);
    expect(h.getHovered()).toEqual([7]);
  });

  it('captures and restores selection state (used by thumbnail capture)', () => {
    const { h } = makeHighlighter();
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
    const { h } = makeHighlighter();
    h.setSelected([1, 2]);
    const first = h.getSelected();
    first.push(99);
    expect(h.getSelected().sort()).toEqual([1, 2]);
  });

  it('keeps ghost depth writes for edge occlusion and draws selected faces in an overlay', () => {
    const { h, registry } = makeHighlighter();
    registry.register(makeRecord(1, [10]));
    registry.register(makeRecord(2, [20]));

    const material = new THREE.MeshStandardMaterial();
    const batched = {
      sortObjects: false,
      setColorAt: vi.fn(),
      getVisibleAt: vi.fn(() => true),
    } as unknown as THREE.BatchedMesh;
    const overlayMaterial = new THREE.MeshStandardMaterial();
    const overlay = {
      visible: false,
      sortObjects: true,
      setColorAt: vi.fn(),
      setVisibleAt: vi.fn(),
    } as unknown as THREE.BatchedMesh;
    const colors = new Map<number, [number, number, number, number]>([
      [10, [1, 0, 0, 1]],
      [20, [0, 0, 1, 1]],
    ]);

    h.attach(batched, material, colors, {
      batched: overlay,
      material: overlayMaterial,
    });
    // Overlay material flags are constants set once at attach time.
    expect(overlayMaterial.transparent).toBe(true);
    expect(overlayMaterial.depthTest).toBe(false);
    expect(overlayMaterial.depthWrite).toBe(false);
    expect(overlay.sortObjects).toBe(false);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(batched.sortObjects).toBe(false);
    expect(overlay.visible).toBe(false);

    h.setSelected([1]);
    expect(material.transparent).toBe(true);
    expect(material.depthWrite).toBe(true);
    expect(batched.sortObjects).toBe(true);
    expect(overlay.visible).toBe(true);
    expect(overlay.setVisibleAt).toHaveBeenCalledWith(10, true);
    expect(overlay.setVisibleAt).toHaveBeenCalledWith(20, false);

    h.setSelected([]);
    expect(material.transparent).toBe(false);
    expect(material.depthWrite).toBe(true);
    expect(batched.sortObjects).toBe(false);
    expect(overlay.visible).toBe(false);
  });
});
