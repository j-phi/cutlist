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
  type Micrometres,
  type Precision,
  type StockMatrix,
} from 'cutlist';
import { defaultPrecisionForUnit } from '~/utils/settings';
import { parseStock } from '~/utils/parseStock';
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
    const pending = pendingPatches.get(project.id) ?? {};
    Object.assign(pending, patch);
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

  const stock = computed<string | undefined>({
    get: () => activeProject.value?.stock,
    set: (value) => {
      if (value == null) return;
      queueWrite({ stock: value });
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
   * Single parse of the project's stock YAML. Every consumer that needs the
   * structured stock list reads this rather than calling `parseStock` directly,
   * so a malformed YAML edit shows up in one place and the parse work runs
   * once per stock change rather than per-consumer.
   */
  const parsedStock = computed<StockMatrix[]>(() => {
    const yaml = stock.value;
    if (!yaml) return [];
    try {
      return parseStock(yaml);
    } catch {
      return [];
    }
  });

  /**
   * Names of materials whose stock kind is linear. Grain lock is meaningless
   * for dimensional lumber (grain runs along the length by definition), so
   * UI surfaces hide the grain-lock control for these materials.
   */
  const linearMaterials = computed<Set<string>>(
    () =>
      new Set(
        parsedStock.value
          .filter((m) => m.kind === 'linear')
          .map((m) => m.material),
      ),
  );

  return {
    bladeWidth,
    margin,
    defaultAlgorithm,
    showPartNumbers,
    stock,
    parsedStock,
    distanceUnit,
    precision,
    isLoading,
    linearMaterials,
  };
});
