/**
 * Edge-banding summary for the active project (F7 FR-BND-2/-3).
 *
 * Totals the banded-edge length across every enabled part (Σ banded-edge
 * lengths × quantity) and, when a cost-per-length rate is set, the banding
 * cost. The rate is a display-only, per-project localStorage UI setting — it
 * does NOT affect packing, so it's deliberately not an IDB field (avoids a
 * schema bump after v10).
 *
 * The user types the rate as cost-per-display-unit (mm or inch). Banding
 * length is integer µm, so the cost is `lengthInDisplayUnit × rate` — computed
 * by converting length to the display unit first, not by scaling the rate.
 */

import {
  ONE_INCH_UM,
  projectBandingLengthUm,
  umToMm,
  type BandedEdges,
  type BandingPart,
  type Micrometres,
} from 'cutlist';
import { STORAGE_KEYS } from '~/utils/localStorage';

interface ModelLike {
  parts: {
    partNumber: number;
    size: { width: Micrometres; length: Micrometres };
    bandedEdges?: BandedEdges;
  }[];
}

/**
 * Group the enabled models' parts into one `BandingPart` per (model, part
 * number), carrying the part's nominal size + banded-edge selection and the
 * instance count as quantity. Parts with no banded edges contribute 0 length,
 * so they're kept (cheap) rather than filtered.
 */
function bandingPartsFor(models: ModelLike[]): BandingPart[] {
  const parts: BandingPart[] = [];
  for (const model of models) {
    const byPn = new Map<number, BandingPart>();
    for (const part of model.parts) {
      const existing = byPn.get(part.partNumber);
      if (existing) {
        existing.quantity += 1;
        continue;
      }
      byPn.set(part.partNumber, {
        size: { width: part.size.width, length: part.size.length },
        bandedEdges: part.bandedEdges,
        quantity: 1,
      });
    }
    parts.push(...byPn.values());
  }
  return parts;
}

/** Banding length expressed in the project's display unit. */
function lengthInUnit(lengthUm: Micrometres, unit: 'mm' | 'in'): number {
  return unit === 'in' ? lengthUm / ONE_INCH_UM : umToMm(lengthUm);
}

export default function useBandingSummary() {
  const { activeId, enabledModels } = useProjects();
  const { distanceUnit } = useProjectSettings();

  /** Cost per unit length (project display unit), as the user typed it. */
  const ratePerUnitLength = ref<number | null>(null);

  const storageKey = computed(() =>
    activeId.value
      ? STORAGE_KEYS.ui.projectBandingCostPerLength(activeId.value)
      : null,
  );

  // Load the persisted rate on project switch.
  watch(
    storageKey,
    (key) => {
      if (!key || !import.meta.client) {
        ratePerUnitLength.value = null;
        return;
      }
      const raw = window.localStorage.getItem(key);
      const parsed = raw == null ? NaN : Number(raw);
      ratePerUnitLength.value = Number.isFinite(parsed) ? parsed : null;
    },
    { immediate: true },
  );

  /**
   * Set the cost-per-length rate. Rejects non-finite / negative input,
   * retaining the prior value (FR-BND-3 input hygiene).
   */
  function setRate(value: number | null) {
    if (value != null && (!Number.isFinite(value) || value < 0)) return;
    ratePerUnitLength.value = value;
    const key = storageKey.value;
    if (!key || !import.meta.client) return;
    if (value == null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, String(value));
  }

  /** Total banded-edge length, integer µm. `0` when nothing is banded. */
  const totalLengthUm = computed<Micrometres>(() =>
    projectBandingLengthUm(bandingPartsFor(enabledModels.value)),
  );

  /**
   * Banding cost = length(display unit) × rate. `undefined` when no positive
   * rate is set (so the UI omits cost rather than showing `0`).
   */
  const cost = computed<number | undefined>(() => {
    const rate = ratePerUnitLength.value;
    if (rate == null || !Number.isFinite(rate) || rate <= 0) return undefined;
    const unit = distanceUnit.value ?? 'mm';
    return lengthInUnit(totalLengthUm.value, unit) * rate;
  });

  return {
    ratePerUnitLength,
    setRate,
    totalLengthUm,
    cost,
  };
}
