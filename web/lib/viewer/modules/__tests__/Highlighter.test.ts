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

describe('Highlighter fade alphas', () => {
  function setup() {
    const { h, registry } = makeHighlighter();
    registry.register(makeRecord(1, [10]));
    registry.register(makeRecord(2, [20]));
    const material = new THREE.MeshStandardMaterial();
    const writes: Array<{
      id: number;
      rgba: [number, number, number, number];
    }> = [];
    const batched = {
      sortObjects: false,
      setColorAt: vi.fn((id: number, v: THREE.Vector4) => {
        writes.push({ id, rgba: [v.x, v.y, v.z, v.w] });
      }),
      getVisibleAt: vi.fn(() => true),
    } as unknown as THREE.BatchedMesh;
    const colors = new Map<number, [number, number, number, number]>([
      [10, [1, 0, 0, 1]],
      [20, [0, 0, 1, 1]],
    ]);
    h.attach(batched, material, colors);
    writes.length = 0;
    return { h, material, batched, writes };
  }

  it('writes per-instance alpha + flips material to transparent for partial fades', () => {
    const { h, material, writes } = setup();
    h.setFadeAlphas(new Map([[1, 0.4]]));
    expect(material.transparent).toBe(true);
    const w10 = writes.find((w) => w.id === 10)!;
    const w20 = writes.find((w) => w.id === 20)!;
    // Object 1 fades to 0.4, object 2 stays at 1.
    expect(w10.rgba[3]).toBeCloseTo(0.4, 5);
    expect(w20.rgba[3]).toBe(1);
  });

  it('keeps material opaque when every fade is 1', () => {
    const { h, material } = setup();
    h.setFadeAlphas(
      new Map([
        [1, 1],
        [2, 1],
      ]),
    );
    expect(material.transparent).toBe(false);
  });

  it('clearFadeAlphas restores fully opaque colors', () => {
    const { h, material, writes } = setup();
    h.setFadeAlphas(new Map([[1, 0.2]]));
    writes.length = 0;
    h.clearFadeAlphas();
    expect(material.transparent).toBe(false);
    const w10 = writes.find((w) => w.id === 10)!;
    expect(w10.rgba[3]).toBe(1);
  });

  it('clamps out-of-range alphas to [0, 1]', () => {
    const { h, writes } = setup();
    h.setFadeAlphas(
      new Map([
        [1, -0.5],
        [2, 2.5],
      ]),
    );
    const w10 = writes.find((w) => w.id === 10)!;
    const w20 = writes.find((w) => w.id === 20)!;
    expect(w10.rgba[3]).toBe(0);
    expect(w20.rgba[3]).toBe(1);
  });

  it('ignores fades while a selection is active', () => {
    const { h, writes } = setup();
    h.setFadeAlphas(new Map([[1, 0.2]]));
    writes.length = 0;
    h.setSelected([1]);
    // Selected object 1 gets the highlight tint at alpha 1; object 2 ghosts
    // at GHOST_OPACITY (0.15) — neither uses the prior 0.2 fade.
    const w10 = writes.find((w) => w.id === 10)!;
    const w20 = writes.find((w) => w.id === 20)!;
    expect(w10.rgba[3]).toBe(1);
    expect(w20.rgba[3]).toBeCloseTo(0.15, 5);
  });
});
