// @vitest-environment nuxt
/**
 * Smoke tests for useThreeViewer.
 *
 * Three.js needs WebGL, which happy-dom doesn't ship — we can't drive a real
 * render here. These tests pin the composable's API surface, its lazy-init
 * behaviour (no Three import + no listeners until a container element shows
 * up), and the lifecycle guards that prevent dispose-before-init from
 * throwing. Anything beyond that lives in manual visual QA.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { effectScope, ref, type EffectScope } from 'vue';

import useThreeViewer from '../useThreeViewer';
import type { ObjectGraph } from '~/utils/types';

const EMPTY_GRAPH: ObjectGraph = {
  parts: [],
  objects: [],
  objectIndex: new Map(),
  partIndex: new Map(),
  colorMap: {},
  nodePartMap: [],
};

let scope: EffectScope | null = null;

function runInScope<T>(fn: () => T): T {
  scope = effectScope();
  return scope.run(fn) as T;
}

afterEach(() => {
  scope?.stop();
  scope = null;
  vi.restoreAllMocks();
});

describe('useThreeViewer', () => {
  it('Should return a stable API surface', () => {
    const result = runInScope(() => {
      const container = ref<HTMLElement | undefined>(undefined);
      return useThreeViewer(container);
    });

    expect(typeof result.loadModel).toBe('function');
    expect(typeof result.clearModels).toBe('function');
    expect(typeof result.fit).toBe('function');
    expect(typeof result.dispose).toBe('function');
    expect(result.ready.value).toBe(false);
  });

  it('Should be inert until a container element appears', () => {
    runInScope(() => {
      const container = ref<HTMLElement | undefined>(undefined);
      const viewer = useThreeViewer(container);
      // No container yet — init must not have fired, ready stays false.
      expect(viewer.ready.value).toBe(false);
    });
  });

  it('Should treat clearModels and dispose as safe before init', () => {
    runInScope(() => {
      const container = ref<HTMLElement | undefined>(undefined);
      const viewer = useThreeViewer(container);
      // Both should no-op when state is null. No throw, no console warn.
      expect(() => viewer.clearModels()).not.toThrow();
      expect(() => viewer.dispose()).not.toThrow();
      expect(() => viewer.fit()).not.toThrow();
    });
  });

  it('Should resolve loadModel as a no-op when not initialised', async () => {
    const result = runInScope(() => {
      const container = ref<HTMLElement | undefined>(undefined);
      return useThreeViewer(container);
    });
    await expect(result.loadModel(EMPTY_GRAPH)).resolves.toBeUndefined();
  });
});
