import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { computeProportionalLinewidth } from '../linewidth';

const MIN = 0.4;
const MAX = 2.5;

function unitBox(): THREE.Box3 {
  return new THREE.Box3(
    new THREE.Vector3(-0.5, -0.5, -0.5),
    new THREE.Vector3(0.5, 0.5, 0.5),
  );
}

describe('computeProportionalLinewidth', () => {
  it('Should grow linewidth as a perspective camera moves closer', () => {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);
    const bounds = unitBox();

    cam.position.set(0, 0, 5);
    const far = computeProportionalLinewidth(cam, bounds, 600);

    cam.position.set(0, 0, 1.5);
    const near = computeProportionalLinewidth(cam, bounds, 600);

    expect(near).toBeGreaterThan(far);
  });

  it('Should grow linewidth as orthographic zoom increases', () => {
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.001, 1000);
    cam.position.set(0, 0, 5);
    const bounds = unitBox();

    cam.zoom = 0.7;
    cam.updateProjectionMatrix();
    const out = computeProportionalLinewidth(cam, bounds, 600);

    cam.zoom = 1.5;
    cam.updateProjectionMatrix();
    const inn = computeProportionalLinewidth(cam, bounds, 600);

    expect(inn).toBeGreaterThan(out);
  });

  it('Should clamp to the configured min and max', () => {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);
    const bounds = unitBox();

    cam.position.set(0, 0, 1000);
    expect(computeProportionalLinewidth(cam, bounds, 600)).toBe(MIN);

    cam.position.set(0, 0, 0.05);
    expect(computeProportionalLinewidth(cam, bounds, 600)).toBe(MAX);
  });

  it('Should return min when canvas height is zero or bounds are degenerate', () => {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);
    cam.position.set(0, 0, 2);

    expect(computeProportionalLinewidth(cam, unitBox(), 0)).toBe(MIN);

    const empty = new THREE.Box3(
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(0, 0, 0),
    );
    expect(computeProportionalLinewidth(cam, empty, 600)).toBe(MIN);
  });

  it('Should never exceed the ceiling, no matter how close the camera gets', () => {
    const cam = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);
    const bounds = unitBox();

    for (const z of [0.01, 0.05, 0.1, 0.3]) {
      cam.position.set(0, 0, z);
      expect(
        computeProportionalLinewidth(cam, bounds, 600),
      ).toBeLessThanOrEqual(MAX);
    }
  });
});
