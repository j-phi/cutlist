import {
  alignPlacements,
  isLinearBoardLayout,
  type BoardLayoutLeftover,
  type ConfigInput,
  type LinearBoardLayout,
  type PartToCut,
  type SheetBoardLayout,
} from 'cutlist';
import { computePartNumberOffsets } from '~/utils/partNumberOffsets';
import {
  computeLayouts,
  computingProjects,
  PART_COUNT_SOFT_LIMIT,
} from '~/composables/useComputationWorker';
import { layoutFingerprint } from '~/utils/fingerprint';
import * as layoutCache from '~/composables/boardLayoutsCache';

/** Incrementing key — bump to force a cache-bypass recompute for the active project. */
const recomputeKey = ref(0);

type LayoutResult = {
  /** Sheet (2D) board layouts, unchanged shape for legacy consumers. */
  layouts: SheetBoardLayout[];
  /** Linear (1D) stick layouts, split out for the Layout tab's stick view. */
  linearLayouts: LinearBoardLayout[];
  leftovers: BoardLayoutLeftover[];
};

const EMPTY_RESULT: LayoutResult = {
  layouts: [],
  linearLayouts: [],
  leftovers: [],
};

/**
 * Rigidly translate each sheet board's placed cluster to the chosen corner of
 * its usable area (F13). Returns the input array unchanged when alignment is
 * unset (no active project) so callers never pay for an allocation they don't
 * need. The transform is purely presentational — see `alignPlacements`.
 */
function applyAlignment(
  layouts: SheetBoardLayout[],
  alignH: 'left' | 'right' | undefined,
  alignV: 'top' | 'bottom' | undefined,
): SheetBoardLayout[] {
  if (alignH == null || alignV == null) return layouts;
  return layouts.map((board) => ({
    ...board,
    placements: alignPlacements(
      board.placements,
      board.stock.widthUm,
      board.stock.lengthUm,
      board.marginUm,
      alignH,
      alignV,
    ),
  }));
}

/**
 * Reactive derivation of cut-layout results for the active project.
 *
 * The worker is fire-and-forget: results land in `layoutCache` keyed by
 * projectId regardless of which project is currently active. `data`,
 * `isComputing`, `error` and `partCountWarning` are pure computeds over the
 * active project id, the cache and the worker's `computingProjects` set.
 * One watcher dispatches new computations when inputs change — no cancel,
 * no project-switch watcher, no navigation guards.
 */
export default createSharedComposable(() => {
  const { activeProject, activeId, enabledModels, projectLoading } =
    useProjects();
  const {
    bladeWidth,
    defaultAlgorithm,
    margin,
    stocks,
    optimizationObjective,
    bandingThicknessUm,
    subtractBandingThickness,
    layoutAlignH,
    layoutAlignV,
  } = useProjectSettings();

  const parts = computed<PartToCut[] | undefined>(() => {
    const project = activeProject.value;
    const models = enabledModels.value;
    if (!project || models.length === 0) return;

    const merged: PartToCut[] = [];
    const offsets = computePartNumberOffsets(models);
    const excluded = new Set(project.excludedColors ?? []);

    for (let i = 0; i < models.length; i++) {
      for (const part of models[i].parts) {
        if (excluded.has(part.colorKey)) continue;
        merged.push({
          partNumber: part.partNumber + offsets[i],
          instanceNumber: part.instanceNumber,
          name: part.name,
          size: part.size,
          material: project.colorMap[part.colorKey] ?? 'Unknown',
          grainLock: part.grainLock,
        });
      }
    }

    return merged;
  });

  /** Fully-hydrated worker inputs for the active project, or undefined. */
  const activeInputs = computed(() => {
    const pid = activeId.value;
    const partsVal = parts.value;
    const bw = bladeWidth.value;
    const alg = defaultAlgorithm.value;
    const mg = margin.value;
    const st = stocks.value;
    const obj = optimizationObjective.value;
    if (!pid || partsVal == null) return undefined;
    if (bw == null || alg == null || mg == null || obj == null)
      return undefined;
    const config: ConfigInput = {
      bladeWidth: bw,
      margin: mg,
      defaultAlgorithm: alg,
      optimizationObjective: obj,
    };
    return {
      projectId: pid,
      parts: partsVal,
      stocks: st,
      config,
      // Include recomputeKey so bumping it invalidates activeInputs and
      // triggers the watcher even when parts/stock/config haven't changed.
      //
      // Banding inputs (`bandingThicknessUm`, `subtractBandingThickness`) feed
      // the cut-size subtraction at the Part→PartToCut boundary (F7) — they
      // change packing OUTPUT, so they MUST bust the layout cache. Until that
      // subtraction lands the parts don't yet reflect banding, so the fields
      // enter the fingerprint explicitly here. The presentational F13/F20
      // fields (alignment, label placement) are deliberately absent — they're
      // applied post-pack and must NOT invalidate the cache.
      fingerprint:
        layoutFingerprint({
          parts: partsVal,
          stocks: st,
          config,
          banding: {
            thicknessUm: bandingThicknessUm.value ?? 0,
            subtract: subtractBandingThickness.value ?? false,
          },
        }) + `:rk${recomputeKey.value}`,
    };
  });

  const errorByProject = shallowRef(new Map<string, string>());

  function setError(pid: string, msg: string | null): void {
    const has = errorByProject.value.has(pid);
    if (msg == null && !has) return;
    const next = new Map(errorByProject.value);
    if (msg == null) next.delete(pid);
    else next.set(pid, msg);
    errorByProject.value = next;
  }

  const data = computed<LayoutResult | undefined>(() => {
    const pid = activeId.value;
    if (!pid) return undefined;

    const cached = layoutCache.get(pid);
    if (cached) {
      return {
        // Alignment (F13) is a PRESENTATIONAL post-process applied here, at the
        // query boundary — never in the worker — so toggling it is instant and
        // the layout cache (which stores the raw, packer-produced layouts) is
        // untouched. Only sheet boards have a 2D footprint to align.
        layouts: applyAlignment(
          cached.layouts,
          layoutAlignH.value,
          layoutAlignV.value,
        ),
        linearLayouts: cached.linearLayouts,
        leftovers: cached.leftovers,
      };
    }

    // Project fully loaded but nothing to pack (no enabled models, or every
    // part excluded). Synthesise an empty result so the UI can render an
    // empty state instead of spinning forever.
    const project = activeProject.value;
    if (project && !projectLoading.value) {
      const partsVal = parts.value;
      if (partsVal == null || partsVal.length === 0) return EMPTY_RESULT;
    }

    return undefined;
  });

  const isComputing = computed(() => {
    const pid = activeId.value;
    if (!pid) return false;
    if (computingProjects.value.has(pid)) return true;
    // No active project record yet → still hydrating.
    return projectLoading.value || !activeProject.value;
  });

  const error = computed<string | null>(() => {
    const pid = activeId.value;
    if (!pid) return null;
    return errorByProject.value.get(pid) ?? null;
  });

  const partCountWarning = computed<string | null>(() => {
    const inputs = activeInputs.value;
    if (!inputs || inputs.parts.length <= PART_COUNT_SOFT_LIMIT) return null;
    return (
      `Large project (${inputs.parts.length} parts). ` +
      `Layout computation may take longer than usual.`
    );
  });

  watch(
    activeInputs,
    (inputs) => {
      if (!inputs) return;
      const { projectId, fingerprint: fp } = inputs;

      const cached = layoutCache.get(projectId);
      if (cached?.fingerprint === fp) return;

      setError(projectId, null);

      // Engine throws when stock is empty; skip the worker.
      if (inputs.stocks.length === 0) {
        layoutCache.set(projectId, {
          layouts: [],
          linearLayouts: [],
          leftovers: [],
          fingerprint: fp,
        });
        return;
      }

      computeLayouts(projectId, inputs.parts, inputs.stocks, inputs.config)
        .then((result) => {
          // Split sheet/linear once at write time; per-render reads stay O(1).
          const sheet: SheetBoardLayout[] = [];
          const linear: LinearBoardLayout[] = [];
          for (const l of result.layouts) {
            if (isLinearBoardLayout(l)) linear.push(l);
            else sheet.push(l);
          }
          layoutCache.set(projectId, {
            layouts: sheet,
            linearLayouts: linear,
            leftovers: result.leftovers,
            fingerprint: fp,
          });
        })
        .catch((err: Error) => {
          if (err.name === 'AbortError') return;
          setError(projectId, err.message || String(err));
          // Drop any stale cache so BOM falls back to raw model data.
          layoutCache.remove(projectId);
        });
    },
    { immediate: true },
  );

  function forceRecompute(): void {
    const pid = activeId.value;
    if (pid) layoutCache.remove(pid);
    recomputeKey.value++;
  }

  /**
   * Capture the current layout cache snapshot, push an undo/redo entry via the
   * provided callback, then trigger a recompute. The onUndo callback restores the
   * pre-Optimize layouts (using the current fingerprint so the watcher won't
   * immediately overwrite them). The onRedo callback re-triggers forceRecompute.
   */
  function captureAndRecompute(
    pushEntry: (onUndo: () => void, onRedo: () => void) => void,
  ): void {
    const pid = activeId.value;
    if (!pid) {
      forceRecompute();
      return;
    }
    const snapshot = layoutCache.get(pid);
    pushEntry(
      () => {
        const fp = activeInputs.value?.fingerprint;
        if (!fp) return;
        if (snapshot) {
          // Restore pre-Optimize layouts with the current fingerprint so the
          // activeInputs watcher sees a cache hit and skips recompute.
          layoutCache.set(pid, { ...snapshot, fingerprint: fp });
        }
      },
      () => forceRecompute(),
    );
    forceRecompute();
  }

  return {
    data,
    isComputing,
    error,
    partCountWarning,
    forceRecompute,
    captureAndRecompute,
  };
});
