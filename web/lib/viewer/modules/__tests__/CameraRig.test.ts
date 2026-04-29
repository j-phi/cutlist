import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EventBus } from '../EventBus';
import { CameraRig } from '../CameraRig';
import type { ViewerEvent } from '../../types';

function makeCanvas(): HTMLElement {
  const el = document.createElement('div');
  el.style.width = '800px';
  el.style.height = '600px';
  // happy-dom doesn't run layout — fake the rect.
  Object.defineProperty(el, 'getBoundingClientRect', {
    value: () => ({
      x: 0,
      y: 0,
      top: 0,
      left: 0,
      bottom: 600,
      right: 800,
      width: 800,
      height: 600,
      toJSON: () => ({}),
    }),
  });
  document.body.appendChild(el);
  return el;
}

describe('CameraRig', () => {
  let canvas: HTMLElement;
  let bus: EventBus<ViewerEvent>;
  let renders: number;
  let rig: CameraRig;

  beforeEach(() => {
    canvas = makeCanvas();
    bus = new EventBus<ViewerEvent>();
    renders = 0;
    rig = new CameraRig({
      THREE,
      OrbitControls,
      domElement: canvas,
      bus,
      requestRender: () => {
        renders++;
      },
    });
  });

  afterEach(() => {
    rig.dispose();
    canvas.remove();
  });

  it('Should default to perspective mode', () => {
    expect(rig.getCameraMode()).toBe('perspective');
    expect(rig.active()).toBe(rig.perspective);
  });

  it('Should configure OnShape-style mouse buttons (left=null, mid=PAN, right=ROTATE)', () => {
    expect(rig.controls.mouseButtons.LEFT).toBe(null);
    expect(rig.controls.mouseButtons.MIDDLE).toBe(THREE.MOUSE.PAN);
    expect(rig.controls.mouseButtons.RIGHT).toBe(THREE.MOUSE.ROTATE);
  });

  it('Should swap to orthographic and preserve position', () => {
    rig.perspective.position.set(3, 4, 5);
    rig.controls.target.set(0, 0, 0);

    rig.setCameraMode('orthographic');

    expect(rig.getCameraMode()).toBe('orthographic');
    expect(rig.active()).toBe(rig.orthographic);
    expect(rig.orthographic.position.toArray()).toEqual([3, 4, 5]);
  });

  it('Should size the ortho frustum to match perspective vertical extent on swap', () => {
    rig.perspective.position.set(0, 0, 10);
    rig.controls.target.set(0, 0, 0);
    const dist = 10;
    const expectedH =
      2 * dist * Math.tan(THREE.MathUtils.degToRad(rig.perspective.fov) / 2);

    rig.setCameraMode('orthographic');

    const halfH = (rig.orthographic.top - rig.orthographic.bottom) / 2;
    expect(halfH).toBeCloseTo(expectedH / 2, 3);
  });

  it('Should round-trip pose via getPose / setPose', () => {
    rig.setControlsDamping(false);
    rig.setPose({ position: [1, 2, 3], target: [4, 5, 6] });
    const pose = rig.getPose();
    expect(pose.position[0]).toBeCloseTo(1, 5);
    expect(pose.position[1]).toBeCloseTo(2, 5);
    expect(pose.position[2]).toBeCloseTo(3, 5);
    expect(pose.target[0]).toBeCloseTo(4, 5);
    expect(pose.target[1]).toBeCloseTo(5, 5);
    expect(pose.target[2]).toBeCloseTo(6, 5);
  });

  it('Should round-trip zoom and up via getPose / setPose', () => {
    rig.setControlsDamping(false);
    rig.setPose({
      position: [1, 2, 3],
      target: [0, 0, 0],
      zoom: 2.5,
      up: [0, 0, -1],
    });
    const pose = rig.getPose();
    expect(pose.zoom).toBeCloseTo(2.5, 5);
    expect(pose.up?.[0]).toBeCloseTo(0, 5);
    expect(pose.up?.[1]).toBeCloseTo(0, 5);
    expect(pose.up?.[2]).toBeCloseTo(-1, 5);
  });

  it('Should default zoom to 1 when setPose omits it', () => {
    rig.setControlsDamping(false);
    rig.perspective.zoom = 5;
    rig.setPose({ position: [1, 2, 3], target: [0, 0, 0] });
    expect(rig.perspective.zoom).toBe(1);
  });

  it('Should compute getDirection as normalized (target → position)', () => {
    rig.controls.target.set(0, 0, 0);
    rig.perspective.position.set(0, 0, 5);
    const d = rig.getDirection();
    expect(d.x).toBeCloseTo(0);
    expect(d.y).toBeCloseTo(0);
    expect(d.z).toBeCloseTo(1);
  });

  it('Should request a render when applyViewPreset starts a tween', async () => {
    rig.perspective.position.set(2, 1.5, 2);
    rig.controls.target.set(0, 0, 0);
    const before = renders;

    rig.applyViewPreset('iso');

    // The tween schedules its first frame on rAF.
    await new Promise((r) => requestAnimationFrame(() => r(null)));

    expect(renders).toBeGreaterThan(before);
  });

  it('Should land on the iso unit direction after the preset tween settles', async () => {
    rig.perspective.position.set(0, 0, 5);
    rig.controls.target.set(0, 0, 0);

    rig.applyViewPreset('iso');

    // Drive 30 rAF ticks (well past the 300ms tween at typical 60Hz).
    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 16));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }

    const dir = rig.getDirection();
    const expected = new THREE.Vector3(1, 1, 1).normalize();
    expect(dir.x).toBeCloseTo(expected.x, 2);
    expect(dir.y).toBeCloseTo(expected.y, 2);
    expect(dir.z).toBeCloseTo(expected.z, 2);
  });

  it('Should land on the front preset direction (0, 0, 1)', async () => {
    rig.perspective.position.set(2, 1.5, 2);
    rig.controls.target.set(0, 0, 0);

    rig.applyViewPreset('front');

    for (let i = 0; i < 30; i++) {
      await new Promise((r) => setTimeout(r, 16));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }

    const dir = rig.getDirection();
    expect(dir.x).toBeCloseTo(0, 2);
    expect(dir.y).toBeCloseTo(0, 2);
    expect(dir.z).toBeCloseTo(1, 2);
  });

  it('Should fit to a bounding box and frame within ±5% on mode swap', () => {
    const bounds = new THREE.Box3(
      new THREE.Vector3(-1, -1, -1),
      new THREE.Vector3(1, 1, 1),
    );
    rig.fit(bounds);

    const perspDist = rig.perspective.position.distanceTo(rig.controls.target);

    rig.setCameraMode('orthographic');
    const orthoHalfH = (rig.orthographic.top - rig.orthographic.bottom) / 2;
    const expectedHalfH =
      perspDist * Math.tan(THREE.MathUtils.degToRad(rig.perspective.fov) / 2);

    expect(orthoHalfH).toBeCloseTo(expectedHalfH, 3);
  });
});
