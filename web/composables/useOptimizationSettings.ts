/**
 * Optimization pass configuration — module-level reactive state shared across
 * all callers. Pass order/enablement is in-memory only (resets on page load);
 * `panelOrder` persists to localStorage.
 */

import {
  STORAGE_KEYS,
  getLocalStorageJson,
  setLocalStorageJson,
} from '~/utils/localStorage';

export const PASS_LABELS: Record<
  string,
  { label: string; description: string }
> = {
  'tidy-rip-long-side': {
    label: 'Tidy — Rip first (longest side)',
    description: 'Rips full-width strips, then crosscuts. Best for table saws.',
  },
  'tidy-rip-area': {
    label: 'Tidy — Rip first (largest area)',
    description:
      'Rip-first strategy, sorted by area. Good when parts vary widely.',
  },
  'tidy-crosscut-long-side': {
    label: 'Tidy — Crosscut first',
    description: 'Crosscuts full-width first, then rips strips.',
  },
  'compact-bssf-long-side': {
    label: 'Compact — Best short-side fit (longest side)',
    description: 'Packs tightly using BSSF heuristic, sorted by longest side.',
  },
  'compact-bssf-area': {
    label: 'Compact — Best short-side fit (largest area)',
    description:
      'BSSF heuristic sorted by area. Fewer boards, more complex cuts.',
  },
  'cnc-area': {
    label: 'CNC — Largest area first',
    description:
      'Non-guillotine packing, maximizes yield. Requires CNC or jigsaw.',
  },
  'cnc-perimeter': {
    label: 'CNC — Largest perimeter first',
    description:
      'Non-guillotine, sorted by perimeter. Good for long narrow parts.',
  },
  'cnc-random': {
    label: 'CNC — Randomized',
    description:
      'Non-guillotine with random order. Can escape local optima; slowest.',
  },
};

/**
 * How board panels are ordered within each (material, thickness) group on the
 * Layout tab. `'board'` keeps the packer's board order (stable — panels never
 * shift when a part is dragged between boards in manual placement). `'fullest'`
 * sorts the most-filled boards first.
 */
export type PanelOrder = 'board' | 'fullest';

export const DEFAULT_PANEL_ORDER: PanelOrder = 'board';

export const DEFAULT_PASS_ORDER: string[] = [
  'tidy-rip-long-side',
  'tidy-rip-area',
  'tidy-crosscut-long-side',
  'compact-bssf-long-side',
  'compact-bssf-area',
  'cnc-area',
  'cnc-perimeter',
  'cnc-random',
];

// Module-level reactive state — shared across all callers
const passOrder = ref<string[]>([...DEFAULT_PASS_ORDER]);
const enabledPasses = ref<Set<string>>(new Set(DEFAULT_PASS_ORDER));

function loadPanelOrder(): PanelOrder {
  const stored = getLocalStorageJson<PanelOrder>(
    STORAGE_KEYS.ui.layoutPanelOrder,
  );
  return stored === 'board' || stored === 'fullest'
    ? stored
    : DEFAULT_PANEL_ORDER;
}
const panelOrder = ref<PanelOrder>(loadPanelOrder());

// Persist panelOrder to localStorage on change. Installed once at module level
// so it outlives any single component scope.
let persistInstalled = false;
function ensurePanelOrderPersist() {
  if (persistInstalled) return;
  persistInstalled = true;
  effectScope(true).run(() => {
    watch(panelOrder, (val) => {
      setLocalStorageJson(STORAGE_KEYS.ui.layoutPanelOrder, val);
    });
  });
}

export function useOptimizationSettings() {
  ensurePanelOrderPersist();

  function resetToDefaults(): void {
    passOrder.value = [...DEFAULT_PASS_ORDER];
    enabledPasses.value = new Set(DEFAULT_PASS_ORDER);
    panelOrder.value = DEFAULT_PANEL_ORDER;
  }

  function togglePass(passId: string): void {
    const next = new Set(enabledPasses.value);
    if (next.has(passId)) {
      // Guard: never drop below one enabled pass
      if (next.size <= 1) return;
      next.delete(passId);
    } else {
      next.add(passId);
    }
    enabledPasses.value = next;
  }

  function reorderPass(fromIndex: number, toIndex: number): void {
    if (fromIndex === toIndex) return;
    const order = [...passOrder.value];
    const [moved] = order.splice(fromIndex, 1);
    order.splice(toIndex, 0, moved);
    passOrder.value = order;
  }

  return {
    passOrder,
    enabledPasses,
    panelOrder,
    resetToDefaults,
    togglePass,
    reorderPass,
    PASS_LABELS,
    DEFAULT_PASS_ORDER,
  };
}
