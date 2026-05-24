/**
 * Per-project packing settings backed by the active project record in IDB.
 *
 * Each setting is a writable computed that reads `activeProject.value?.<field>`
 * and routes writes through a shared debounced writer so rapid edits (e.g.
 * dragging a number input) collapse into a single `idb.updateProject` call.
 * Local reactive state is updated synchronously via `patchActiveProject` so
 * the UI sees the new value on the next tick, even before persistence lands.
 */

import {
  type Algorithm,
  type MeasurementMode,
  type Micrometres,
  type OptimizationObjective,
  type Precision,
  type StockMatrix,
} from 'cutlist';
import { defaultPrecisionForUnit } from '~/utils/settings';
import type { IdbProject } from '~/composables/useIdb';

const DEBOUNCE_MS = 300;

// Pending patches keyed by project id, so edits made against one project
// while the user navigates away still persist against the original project.
const pendingPatches = new Map<string, Partial<IdbProject>>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flushPending(idb: ReturnType<typeof useIdb>) {
  flushTimer = null;
  const entries = [...pendingPatches.entries()];
  pendingPatches.clear();
  for (const [id, patch] of entries) {
    try {
      await idb.updateProject(id, patch);
    } catch (err) {
      console.error('[useProjectSettings] updateProject failed', err);
    }
  }
}

function scheduleFlush(idb: ReturnType<typeof useIdb>) {
  if (flushTimer) clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    flushPending(idb);
  }, DEBOUNCE_MS);
}

// Best-effort flush when the user closes the tab mid-debounce. IDB writes
// issued synchronously from the handler are held open by the browser long
// enough to complete in practice; worst case they're dropped, which matches
// pre-unload-handler behaviour.
if (import.meta.client) {
  window.addEventListener('beforeunload', () => {
    if (!flushTimer) return;
    clearTimeout(flushTimer);
    flushTimer = null;
    void flushPending(useIdb());
  });
}

export default createSharedComposable(() => {
  const { activeProject, patchActiveProject } = useProjects();
  const idb = useIdb();

  const isLoading = computed(() => activeProject.value === undefined);

  function queueWrite(patch: Partial<IdbProject>) {
    const project = activeProject.value;
    if (!project) return;
    patchActiveProject(patch);
    // IDB writes go through structured clone, which rejects Vue Proxies.
    const plain = JSON.parse(JSON.stringify(patch)) as Partial<IdbProject>;
    const pending = pendingPatches.get(project.id) ?? {};
    Object.assign(pending, plain);
    pendingPatches.set(project.id, pending);
    scheduleFlush(idb);
  }

  const bladeWidth = computed<Micrometres | undefined>({
    get: () => activeProject.value?.bladeWidth,
    set: (value) => {
      if (value == null) return;
      queueWrite({ bladeWidth: value });
    },
  });

  const margin = computed<Micrometres | undefined>({
    get: () => activeProject.value?.margin,
    set: (value) => {
      if (value == null) return;
      queueWrite({ margin: value });
    },
  });

  const defaultAlgorithm = computed<Algorithm | undefined>({
    get: () => activeProject.value?.defaultAlgorithm,
    set: (value) => {
      if (value == null) return;
      queueWrite({ defaultAlgorithm: value });
    },
  });

  const showPartNumbers = computed<boolean | undefined>({
    get: () => activeProject.value?.showPartNumbers,
    set: (value) => {
      if (value == null) return;
      queueWrite({ showPartNumbers: value });
    },
  });

  const showBomName = computed<boolean | undefined>({
    get: () => activeProject.value?.showBomName,
    set: (value) => {
      if (value == null) return;
      queueWrite({ showBomName: value });
    },
  });

  // ── F13: layout alignment (presentational — applied at render boundary). ──
  const layoutAlignH = computed<'left' | 'right' | undefined>({
    get: () => activeProject.value?.layoutAlignH,
    set: (value) => {
      if (value == null) return;
      queueWrite({ layoutAlignH: value });
    },
  });

  const layoutAlignV = computed<'top' | 'bottom' | undefined>({
    get: () => activeProject.value?.layoutAlignV,
    set: (value) => {
      if (value == null) return;
      queueWrite({ layoutAlignV: value });
    },
  });

  // ── F20: label placement (presentational). ──
  const labelPlacement = computed<'top' | 'center' | undefined>({
    get: () => activeProject.value?.labelPlacement,
    set: (value) => {
      if (value == null) return;
      queueWrite({ labelPlacement: value });
    },
  });

  // ── F20 Part B: measurement display mode (presentational). ──
  const measurementMode = computed<MeasurementMode | undefined>({
    get: () => activeProject.value?.measurementMode,
    set: (value) => {
      if (value == null) return;
      queueWrite({ measurementMode: value });
    },
  });

  // ── F7: edge-banding project defaults. ──
  const bandingThicknessUm = computed<Micrometres | undefined>({
    get: () => activeProject.value?.bandingThicknessUm,
    set: (value) => {
      if (value == null) return;
      queueWrite({ bandingThicknessUm: value });
    },
  });

  const subtractBandingThickness = computed<boolean | undefined>({
    get: () => activeProject.value?.subtractBandingThickness,
    set: (value) => {
      if (value == null) return;
      queueWrite({ subtractBandingThickness: value });
    },
  });

  // ── F11: optimization objective (busts the layout cache). ──
  const optimizationObjective = computed<OptimizationObjective | undefined>({
    get: () => activeProject.value?.optimizationObjective,
    set: (value) => {
      if (value == null) return;
      queueWrite({ optimizationObjective: value });
    },
  });

  const stocks = computed<StockMatrix[]>({
    get: () => activeProject.value?.stocks ?? [],
    set: (value) => {
      if (!activeProject.value) return;
      queueWrite({ stocks: value });
    },
  });

  /**
   * Setting `distanceUnit` resets `precision` to the new unit's default —
   * fractional precision doesn't make sense in mm and decimal-mm steps
   * don't make sense in inches. Users almost never flip mid-project, so
   * "lose the precision" is the right tradeoff for a simpler model.
   */
  const distanceUnit = computed<'in' | 'mm' | undefined>({
    get: () => activeProject.value?.distanceUnit,
    set: (value) => {
      if (value == null) return;
      queueWrite({
        distanceUnit: value,
        precision: defaultPrecisionForUnit(value),
      });
    },
  });

  /**
   * Display precision. Falls back to the unit's default when no project
   * is loaded so formatters never have to guard for undefined.
   */
  const precision = computed<Precision>({
    get: () =>
      activeProject.value?.precision ??
      defaultPrecisionForUnit(activeProject.value?.distanceUnit ?? 'mm'),
    set: (value) => {
      if (!activeProject.value) return;
      queueWrite({ precision: value });
    },
  });

  /**
   * Names of materials whose stock kind is linear. Grain lock is meaningless
   * for dimensional lumber (grain runs along the length by definition), so
   * UI surfaces hide the grain-lock control for these materials.
   */
  const linearMaterials = computed<Set<string>>(
    () =>
      new Set(
        stocks.value.filter((m) => m.kind === 'linear').map((m) => m.material),
      ),
  );

  return {
    bladeWidth,
    margin,
    defaultAlgorithm,
    showPartNumbers,
    showBomName,
    layoutAlignH,
    layoutAlignV,
    labelPlacement,
    measurementMode,
    bandingThicknessUm,
    subtractBandingThickness,
    optimizationObjective,
    stocks,
    distanceUnit,
    precision,
    isLoading,
    linearMaterials,
    /** Debounced multi-field write — merges with sibling field writes in the same tick. */
    queuePatch: queueWrite,
  };
});
