// @vitest-environment nuxt
/**
 * useStockMutations owns the policy that a stock material rename or delete
 * must cascade into `colorMap` (which references stock by name). Without the
 * cascade, BOM color→material assignments silently orphan, leaving stale
 * names in the BOM dropdown selection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { StockMatrix } from 'cutlist';

import { DEFAULT_SETTINGS } from '~/utils/settings';

interface MockProject {
  id: string;
  stocks: StockMatrix[];
  colorMap: Record<string, string>;
  bladeWidth: number;
  margin: number;
  defaultAlgorithm: string;
  showPartNumbers: boolean;
  distanceUnit: 'in' | 'mm';
  precision: typeof DEFAULT_SETTINGS.precision;
}

const activeProject = ref<MockProject | null>(null);

function patchActiveProject(patch: Partial<MockProject>) {
  if (!activeProject.value) return;
  activeProject.value = { ...activeProject.value, ...patch };
}

mockNuxtImport('useProjects', () => () => ({
  activeProject,
  patchActiveProject,
}));

interface UpdateCall {
  id: string;
  patch: Record<string, unknown>;
}
const updateCalls: UpdateCall[] = [];

mockNuxtImport('useIdb', () => () => ({
  updateProject: (id: string, patch: Record<string, unknown>) => {
    updateCalls.push({ id, patch });
    return Promise.resolve();
  },
}));

import { useStockMutations } from '../useStockMutations';

beforeEach(() => {
  activeProject.value = {
    id: 'p1',
    stocks: [
      { kind: 'sheet', material: 'Plywood', sizes: [] },
      { kind: 'sheet', material: 'MDF', sizes: [] },
    ],
    colorMap: { red: 'Plywood', blue: 'MDF', green: 'Plywood' },
    bladeWidth: DEFAULT_SETTINGS.bladeWidth,
    margin: DEFAULT_SETTINGS.margin,
    defaultAlgorithm: DEFAULT_SETTINGS.defaultAlgorithm,
    showPartNumbers: DEFAULT_SETTINGS.showPartNumbers,
    distanceUnit: 'mm',
    precision: DEFAULT_SETTINGS.precision,
  };
  updateCalls.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useStockMutations', () => {
  it('renaming a material rewrites every colorMap reference to the new name in the same patch', async () => {
    const { update } = useStockMutations();
    update(0, { kind: 'sheet', material: 'PlywoodX', sizes: [] });

    // Synchronous: BOM dropdown / select model-values see the new name now.
    expect(activeProject.value!.colorMap).toEqual({
      red: 'PlywoodX',
      blue: 'MDF',
      green: 'PlywoodX',
    });
    expect(activeProject.value!.stocks[0].material).toBe('PlywoodX');

    await vi.advanceTimersByTimeAsync(400);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch).toMatchObject({
      colorMap: { red: 'PlywoodX', blue: 'MDF', green: 'PlywoodX' },
    });
  });

  it('deleting a material drops every colorMap entry pointing to it in the same patch', async () => {
    const { remove } = useStockMutations();
    remove(0);

    expect(activeProject.value!.colorMap).toEqual({ blue: 'MDF' });
    expect(activeProject.value!.stocks).toHaveLength(1);

    await vi.advanceTimersByTimeAsync(400);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch).toMatchObject({
      colorMap: { blue: 'MDF' },
    });
  });

  it('updating a row without renaming leaves colorMap alone', async () => {
    const { update } = useStockMutations();
    update(0, {
      kind: 'sheet',
      material: 'Plywood',
      sizes: [{ width: 1220, length: 2440, thickness: [18] }],
    });

    expect(activeProject.value!.colorMap).toEqual({
      red: 'Plywood',
      blue: 'MDF',
      green: 'Plywood',
    });

    await vi.advanceTimersByTimeAsync(400);
    expect(updateCalls[0].patch.colorMap).toBeUndefined();
  });
});
