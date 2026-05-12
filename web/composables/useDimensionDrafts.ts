import {
  convertUnits,
  formatValue,
  parseDimension,
  type Precision,
} from 'cutlist';
import { ref, watch, type Ref } from 'vue';

/**
 * Owns a bag of draft strings for inputs that bridge canonical mm storage
 * to a free-text display in the active unit. Each input is keyed by a
 * caller-chosen string (e.g. `size-0-width`, `cross-thickness`).
 *
 * The pattern is: while typing, the input shows the draft string verbatim;
 * on commit (blur / Enter), the draft is parsed and the parent updates its
 * mm-stored value. The composable doesn't own the mm value — the parent
 * does and writes it via `update:modelValue` — but it owns the visual
 * state in between keystrokes and the unit-flip retranslation.
 *
 * Sibling of `useDimensionInput`, which manages a single mutable Ref<mm>
 * with two-way binding. This one is for the "many parent-owned values"
 * shape that crops up in list editors.
 */
export function useDimensionDrafts(
  unit: Ref<'mm' | 'in'>,
  precision: Ref<Precision>,
) {
  const drafts = ref<Record<string, string>>({});

  /** Format a canonical mm value in the active unit + precision. */
  function format(mm: number): string {
    return formatValue(
      convertUnits(mm, 'mm', unit.value),
      unit.value,
      precision.value,
    );
  }

  /**
   * Parse a free-text dimension in the active unit, returning canonical
   * mm if valid. Returns null for unparseable input. By default zero and
   * negative values also return null (zero-length stock is never useful);
   * pass `allowZero: true` for fields where zero is a valid choice (e.g.
   * material allowances), in which case empty input is also treated as 0.
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
    return convertUnits(parsed, unit.value, 'mm');
  }

  /** What the input should render: the user's draft if typing, else canonical. */
  function display(key: string, mm: number): string {
    return drafts.value[key] ?? format(mm);
  }

  function set(key: string, raw: string): void {
    drafts.value[key] = raw;
  }

  /**
   * Parse and clear the draft. Returns the mm value if valid, else null.
   * Always clears the draft so the input reverts to canonical on the next
   * render. Pass `allowZero: true` to accept "0" / "" as zero.
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
   *  index-keyed draft can't end up mis-attributed to the wrong row. */
  function reset(): void {
    drafts.value = {};
  }

  // Unit flip: re-translate any in-progress drafts so the user's mental
  // "this is 18" stays visually consistent across the swap.
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
