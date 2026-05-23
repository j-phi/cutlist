import { describe, it, expect, beforeEach, vi } from 'vitest';
import { nextTick } from 'vue';

// Back the localStorage helpers with an in-memory store so we assert on what
// was actually persisted (an outcome) rather than on mock call metadata.
const h = vi.hoisted(() => {
  const store: Record<string, unknown> = {};
  return {
    store,
    KEY: '@cutlist/ui/layout-panel-order/v1',
    getJson: (k: string) => (k in store ? store[k] : null),
    setJson: (k: string, v: unknown) => {
      store[k] = v;
    },
  };
});

vi.mock('~/utils/localStorage', () => ({
  STORAGE_KEYS: { ui: { layoutPanelOrder: h.KEY } },
  getLocalStorageJson: h.getJson,
  setLocalStorageJson: h.setJson,
}));

beforeEach(() => {
  for (const k of Object.keys(h.store)) delete h.store[k];
  // Fresh module instance per test so the module-level panelOrder ref
  // re-hydrates from the (newly seeded) store on import.
  vi.resetModules();
});

async function load() {
  const mod = await import('../useOptimizationSettings');
  return mod.useOptimizationSettings();
}

describe('useOptimizationSettings — panelOrder persistence', () => {
  it('defaults to "board" when nothing is stored', async () => {
    expect((await load()).panelOrder.value).toBe('board');
  });

  it('hydrates panelOrder from storage on init', async () => {
    h.store[h.KEY] = 'fullest';
    expect((await load()).panelOrder.value).toBe('fullest');
  });

  it('falls back to the default when the stored value is not a known order', async () => {
    h.store[h.KEY] = 'garbage';
    expect((await load()).panelOrder.value).toBe('board');
  });

  it('persists panelOrder to storage when it changes', async () => {
    const { panelOrder } = await load();
    panelOrder.value = 'fullest';
    await nextTick();
    expect(h.store[h.KEY]).toBe('fullest');
  });

  it('resetToDefaults restores "board" and persists it', async () => {
    h.store[h.KEY] = 'fullest';
    const { panelOrder, resetToDefaults } = await load();
    resetToDefaults();
    await nextTick();
    expect(panelOrder.value).toBe('board');
    expect(h.store[h.KEY]).toBe('board');
  });
});
