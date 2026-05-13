// @vitest-environment nuxt
/**
 * Regression: writing complex structured fields (e.g. `stocks`) via the
 * writable computed must not leak Vue reactivity into the IDB write. IDB uses
 * structured clone, which rejects Proxies — components routinely spread
 * reactive props (`{ ...props.modelValue }`), so nested values arrive deeply
 * reactive at the setter.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { reactive, ref } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { StockMatrix } from 'cutlist';

import { DEFAULT_SETTINGS } from '~/utils/settings';

interface MockProject {
  id: string;
  stocks: StockMatrix[];
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

import useProjectSettings from '../useProjectSettings';

beforeEach(() => {
  activeProject.value = reactive({
    id: 'p1',
    stocks: [],
    bladeWidth: DEFAULT_SETTINGS.bladeWidth,
    margin: DEFAULT_SETTINGS.margin,
    defaultAlgorithm: DEFAULT_SETTINGS.defaultAlgorithm,
    showPartNumbers: DEFAULT_SETTINGS.showPartNumbers,
    distanceUnit: 'mm' as const,
    precision: DEFAULT_SETTINGS.precision,
  });
  updateCalls.length = 0;
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useProjectSettings', () => {
  it('queues IDB writes with plain (structured-cloneable) data even when set from reactive sources', async () => {
    const { stocks } = useProjectSettings();

    // Mirrors what `{ ...props.modelValue }` produces in a component: a new
    // object whose nested fields are still Vue proxies.
    const reactiveStock = reactive<StockMatrix>({
      kind: 'sheet',
      material: 'Plywood',
      sizes: [{ width: 1220, length: 2440, thickness: [18] }],
    });
    stocks.value = [reactiveStock];

    await vi.advanceTimersByTimeAsync(400);

    expect(updateCalls).toHaveLength(1);
    // The whole point: this must not throw. structured-clone rejects Proxies.
    expect(() => structuredClone(updateCalls[0].patch)).not.toThrow();
    expect(updateCalls[0].patch.stocks).toEqual([
      {
        kind: 'sheet',
        material: 'Plywood',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
    ]);
  });

  it('reflects writes immediately in stocks.value so dependent computeds (e.g. BOM material dropdown) update without waiting for IDB', () => {
    const { stocks } = useProjectSettings();
    activeProject.value!.stocks = [
      { kind: 'sheet', material: 'Plywood', sizes: [] },
      { kind: 'sheet', material: 'MDF', sizes: [] },
    ];

    // Rename row 0 — same shape a StockCard rename produces.
    const next = stocks.value.slice();
    next[0] = { ...next[0], material: 'PlywoodX' };
    stocks.value = next;

    expect(stocks.value.map((s) => s.material)).toEqual(['PlywoodX', 'MDF']);

    // Remove row 1 — same shape a StockCard remove produces.
    stocks.value = stocks.value.filter((_, i) => i !== 1);
    expect(stocks.value.map((s) => s.material)).toEqual(['PlywoodX']);
  });
});
