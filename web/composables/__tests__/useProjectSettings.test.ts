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
  layoutAlignH: 'left' | 'right';
  layoutAlignV: 'top' | 'bottom';
  labelPlacement: 'top' | 'center';
  optimizationObjective: 'boards' | 'waste' | 'cost';
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
    layoutAlignH: DEFAULT_SETTINGS.layoutAlignH,
    layoutAlignV: DEFAULT_SETTINGS.layoutAlignV,
    labelPlacement: DEFAULT_SETTINGS.labelPlacement,
    optimizationObjective: DEFAULT_SETTINGS.optimizationObjective,
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
    expect(() => structuredClone(updateCalls[0].patch)).not.toThrow();
    expect(updateCalls[0].patch.stocks).toEqual([
      {
        kind: 'sheet',
        material: 'Plywood',
        sizes: [{ width: 1220, length: 2440, thickness: [18] }],
      },
    ]);
  });

  it('defaults optimizationObjective to "boards" on a fresh project and round-trips a write', async () => {
    const { optimizationObjective } = useProjectSettings();
    expect(optimizationObjective.value).toBe('boards');

    optimizationObjective.value = 'cost';
    // Local state updates synchronously via patchActiveProject.
    expect(optimizationObjective.value).toBe('cost');

    await vi.advanceTimersByTimeAsync(400);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.optimizationObjective).toBe('cost');
  });

  it('defaults layout alignment to bottom-left and round-trips a write to "right"', async () => {
    const { layoutAlignH, layoutAlignV } = useProjectSettings();
    expect(layoutAlignH.value).toBe('left');
    expect(layoutAlignV.value).toBe('bottom');

    layoutAlignH.value = 'right';
    expect(layoutAlignH.value).toBe('right');

    await vi.advanceTimersByTimeAsync(400);
    expect(updateCalls).toHaveLength(1);
    expect(updateCalls[0].patch.layoutAlignH).toBe('right');
  });
});
