// @vitest-environment nuxt
/**
 * useStockMutations owns the policy that a stock material *category* rename or
 * delete cascades into `colorMap` (which references stock by category) — but
 * ONLY when no other entry still uses that category. Categories are shared
 * many-to-many across stock items, so a live category must keep its color
 * mapping even after one card that used it changes or is removed.
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
  it('recategorizing the only entry in a category rewrites its colorMap references', async () => {
    // Plywood is used by exactly one entry (idx 0). Recategorizing it means the
    // old category no longer exists, so its color mappings must follow.
    const { update } = useStockMutations();
    update(0, { kind: 'sheet', material: 'PlywoodX', sizes: [] });

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

  it('recategorizing one of several entries in a shared category leaves colorMap alone', async () => {
    // Two cards share "Plywood"; recategorizing one keeps the category alive on
    // the other, so the BOM color→Plywood mapping must NOT be rewritten.
    activeProject.value!.stocks = [
      { kind: 'sheet', material: 'Plywood', sizes: [] },
      { kind: 'sheet', material: 'Plywood', sizes: [] },
    ];
    const { update } = useStockMutations();
    update(0, { kind: 'sheet', material: 'Birch', sizes: [] });

    expect(activeProject.value!.colorMap).toEqual({
      red: 'Plywood',
      blue: 'MDF',
      green: 'Plywood',
    });

    await vi.advanceTimersByTimeAsync(400);
    expect(updateCalls.some((c) => c.patch.colorMap)).toBe(false);
  });

  it('deleting the only entry in a category drops its colorMap entries', async () => {
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

  it('deleting one entry from a shared category keeps its colorMap entries', async () => {
    activeProject.value!.stocks = [
      { kind: 'sheet', material: 'Plywood', sizes: [] },
      { kind: 'sheet', material: 'Plywood', sizes: [] },
    ];
    const { remove } = useStockMutations();
    remove(0);

    // Plywood still lives on the surviving entry, so its colors stay mapped.
    expect(activeProject.value!.colorMap).toEqual({
      red: 'Plywood',
      blue: 'MDF',
      green: 'Plywood',
    });

    await vi.advanceTimersByTimeAsync(400);
    expect(updateCalls.some((c) => c.patch.colorMap)).toBe(false);
  });

  it('appends added matrices verbatim — categories and names are never auto-suffixed', () => {
    const { add } = useStockMutations();
    add([
      { kind: 'sheet', name: 'Door offcut', material: 'Plywood', sizes: [] },
      { kind: 'sheet', name: 'Door offcut', material: 'Plywood', sizes: [] },
    ]);

    const added = activeProject.value!.stocks.slice(-2);
    expect(added.map((s) => s.material)).toEqual(['Plywood', 'Plywood']);
    expect(added.map((s) => s.name)).toEqual(['Door offcut', 'Door offcut']);
  });

  it('consolidate merges same role+material panels and returns the removed count', () => {
    activeProject.value!.stocks = [
      {
        kind: 'sheet',
        material: 'Plywood',
        role: 'offcut',
        sizes: [{ width: 1220, length: 2440, thickness: [18], quantity: 1 }],
      },
      { kind: 'sheet', material: 'MDF', role: 'offcut', sizes: [] },
      {
        kind: 'sheet',
        material: 'Plywood',
        role: 'offcut',
        sizes: [{ width: 600, length: 600, thickness: [18], quantity: 2 }],
      },
    ];
    const { consolidate } = useStockMutations();
    const removed = consolidate();

    expect(removed).toBe(1);
    expect(activeProject.value!.stocks).toHaveLength(2);
    const ply = activeProject.value!.stocks.find(
      (s) => s.material === 'Plywood',
    ) as { sizes: unknown[] };
    expect(ply.sizes).toEqual([
      { width: 1220, length: 2440, thickness: [18], quantity: 1 },
      { width: 600, length: 600, thickness: [18], quantity: 2 },
    ]);
  });

  it('consolidate is a no-op (returns 0, no write) when nothing shares a panel', () => {
    // Distinct materials → nothing to merge; stocks reference must be untouched.
    const before = activeProject.value!.stocks;
    const { consolidate } = useStockMutations();
    expect(consolidate()).toBe(0);
    expect(activeProject.value!.stocks).toBe(before);
  });

  it('updating a row without changing its category leaves colorMap alone', async () => {
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
    expect(updateCalls[0]?.patch.colorMap).toBeUndefined();
  });
});
