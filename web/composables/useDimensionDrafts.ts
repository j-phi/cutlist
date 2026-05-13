import {
  convertUnits,
  formatValue,
  parseDimension,
  toCanonicalMm,
  type Precision,
} from 'cutlist';
import { ref, watch, type Ref } from 'vue';

/**
 * Owns a bag of draft strings for the YAML stock-matrix editor, which
 * stores mm values (per `StockMatrix` in lib/types.ts). Each input is
 * keyed by a caller-chosen string (e.g. `size-0-width`).
 *
 * Sibling of `useDimensionInput`: that bridge owns a single µm-typed ref
 * for storage / engine values; this one bridges parent-owned mm bags for
 * the YAML matrix surface. The mm/µm split matches the storage seam.
 */
export function useDimensionDrafts(
  unit: Ref<'mm' | 'in'>,
  precision: Ref<Precision>,
) {
  const drafts = ref<Record<string, string>>({});

  function format(mm: number): string {
    return formatValue(
      convertUnits(mm, 'mm', unit.value),
      unit.value,
      precision.value,
    );
  }

  /**
   * Parse free-text in the active unit → canonical mm. Null on unparseable
   * input. Zero and negatives return null by default; pass `allowZero: true`
   * for fields where zero is valid (material allowances), in which case
   * empty input is treated as 0.
   */
  function parse(
    raw: string | undefined,
    opts: { allowZero?: boolean } = {},
  ): number | null {
    if (raw == null) return null;
    if (opts.allowZero && raw.trim() === '') return 0;
    const parsed = parseDimension(raw, unit.value);
    if (parsed == null) return null;
    if (opts.allowZero ? parsed < 0 : parsed <= 0) return null;
    return toCanonicalMm(parsed, unit.value);
  }

  function display(key: string, mm: number): string {
    return drafts.value[key] ?? format(mm);
  }

  function set(key: string, raw: string): void {
    drafts.value[key] = raw;
  }

  /**
   * Parse and clear the draft. Returns mm if valid, else null. Always
   * clears the draft so the input reverts to canonical on next render.
   */
  function commit(
    key: string,
    opts: { allowZero?: boolean } = {},
  ): number | null {
    const raw = drafts.value[key];
    delete drafts.value[key];
    return parse(raw, opts);
  }

  /** Drop every draft. Use after a structural change (add/remove) so an
   * index-keyed draft can't end up on the wrong row. */
  function reset(): void {
    drafts.value = {};
  }

  // Unit flip: re-translate in-progress drafts so the user's mental
  // "this is 18" survives the swap.
  watch(unit, (next, prev) => {
    for (const k in drafts.value) {
      const v = parseDimension(drafts.value[k], prev);
      if (v != null) {
        drafts.value[k] = formatValue(
          convertUnits(v, prev, next),
          next,
          precision.value,
        );
      }
    }
  });

  return { format, parse, display, set, commit, reset };
}

export type DimensionDrafts = ReturnType<typeof useDimensionDrafts>;
