// @vitest-environment nuxt
/**
 * useModels caches the derived ObjectGraph in memory so model dropdown
 * switches don't re-parse `rawSource`. These tests mock `resolveModelScene`
 * to count derive calls — the cache hit metric is the contract.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { ObjectGraph } from '~/utils/types';
import type { Project } from '~/composables/useProjects';

const activeId = ref<string | null>('p1');
const activeProject = ref<Partial<Project> | undefined>(undefined);

mockNuxtImport('useActiveProject', () => () => ({
  activeId,
  activeProject,
}));

const resolveSpy = vi.fn(
  async (): Promise<ObjectGraph> =>
    ({ objects: [], partNumberOf: new Map() }) as unknown as ObjectGraph,
);

vi.mock('~/utils/resolveModelScene', () => ({
  resolveModelScene: (...args: unknown[]) =>
    (resolveSpy as (...a: unknown[]) => unknown)(...args),
}));

const idbStub = {
  getModelRawSource: vi.fn(async (id: string) =>
    id === 'missing' ? null : { kind: 'gltf', id },
  ),
};

mockNuxtImport('useIdb', () => () => idbStub);

import useModels from '../useModels';

let scope: EffectScope;

beforeEach(() => {
  resolveSpy.mockClear();
  idbStub.getModelRawSource.mockClear();
  activeId.value = 'p1';
  activeProject.value = {
    id: 'p1',
    models: [
      { id: 'm1', filename: 'm1.gltf', source: 'gltf' as const } as never,
      { id: 'm2', filename: 'm2.gltf', source: 'gltf' as const } as never,
    ],
  } as never;
  scope = effectScope();
  // useModels is a `createGlobalState` singleton — its cache outlives any
  // single test. Reset the cache so test order doesn't leak hits.
  scope.run(() => useModels())!.clear();
});

afterEach(() => {
  scope.stop();
});

describe('useModels', () => {
  it('Should derive once on first read and serve cached graph thereafter', async () => {
    const m = scope.run(() => useModels())!;
    const a = await m.getModelGraph('m1');
    const b = await m.getModelGraph('m1');
    expect(a).toBe(b);
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(idbStub.getModelRawSource).toHaveBeenCalledTimes(1);
  });

  it('Should derive separately for distinct model ids', async () => {
    const m = scope.run(() => useModels())!;
    await m.getModelGraph('m1');
    await m.getModelGraph('m2');
    expect(resolveSpy).toHaveBeenCalledTimes(2);
    // Re-reading m1 still hits the cache.
    await m.getModelGraph('m1');
    expect(resolveSpy).toHaveBeenCalledTimes(2);
  });

  it('Should resolve to null when no rawSource is stored', async () => {
    activeProject.value = {
      id: 'p1',
      models: [
        {
          id: 'missing',
          filename: 'x',
          source: 'gltf' as const,
        } as never,
      ],
    } as never;
    const m = scope.run(() => useModels())!;
    expect(await m.getModelGraph('missing')).toBeNull();
    expect(resolveSpy).not.toHaveBeenCalled();
  });

  it('Should clear the cache when activeId changes', async () => {
    const m = scope.run(() => useModels())!;
    await m.getModelGraph('m1');
    expect(resolveSpy).toHaveBeenCalledTimes(1);

    activeId.value = 'p2';
    activeProject.value = {
      id: 'p2',
      models: [
        { id: 'm1', filename: 'p2-m1.gltf', source: 'gltf' as const } as never,
      ],
    } as never;
    await nextTick();

    await m.getModelGraph('m1');
    expect(resolveSpy).toHaveBeenCalledTimes(2);
  });

  it('Should purge cache entries when a model disappears from active project', async () => {
    const m = scope.run(() => useModels())!;
    await m.getModelGraph('m1');
    await m.getModelGraph('m2');
    expect(resolveSpy).toHaveBeenCalledTimes(2);

    activeProject.value = {
      id: 'p1',
      models: [
        { id: 'm1', filename: 'm1.gltf', source: 'gltf' as const } as never,
      ],
    } as never;
    await nextTick();

    // m1 still cached
    await m.getModelGraph('m1');
    expect(resolveSpy).toHaveBeenCalledTimes(2);
    // m2 dropped — re-add it to the project and re-fetch; should re-derive.
    activeProject.value = {
      id: 'p1',
      models: [
        { id: 'm1', filename: 'm1.gltf', source: 'gltf' as const } as never,
        { id: 'm2', filename: 'm2.gltf', source: 'gltf' as const } as never,
      ],
    } as never;
    await nextTick();
    await m.getModelGraph('m2');
    expect(resolveSpy).toHaveBeenCalledTimes(3);
  });

  it('Should expose `purge` and `clear` for manual invalidation', async () => {
    const m = scope.run(() => useModels())!;
    await m.getModelGraph('m1');
    m.purge('m1');
    await m.getModelGraph('m1');
    expect(resolveSpy).toHaveBeenCalledTimes(2);

    m.clear();
    await m.getModelGraph('m1');
    expect(resolveSpy).toHaveBeenCalledTimes(3);
  });
});
