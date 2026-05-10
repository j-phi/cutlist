import {
  convertUnits,
  formatValue,
  parseDimension,
  type Precision,
} from 'cutlist';
import { ref, watch, type Ref } from 'vue';

/**
 * Bridge an mm-stored ref to a free-text input string. Storage stays
 * raw; rounding lives only at the formatting boundary. See "Dimensions
 * and units" in CLAUDE.md for the architecture.
 *
 * Wire: `<UInput v-model="input" @blur="commit" />`
 *
 * Two guards protect each direction:
 * - `lastWrittenByUs` lets the input → storage watcher ignore writes
 *   it didn't originate, so seeding the field from storage on mount
 *   can't push a rounded display value back into storage.
 * - `isEcho` lets the storage → input watcher skip reformat whenever
 *   the current string still parses back to the same stored value,
 *   so mid-typing keystrokes like `"1.95"` aren't snapped while the
 *   user is still typing.
 */
export function useDimensionInput(
  mm: Ref<number | null | undefined>,
  unit: Ref<'mm' | 'in'>,
  precision: Ref<Precision>,
): { input: Ref<string>; commit: () => void } {
  const display = (v: number | null | undefined): string =>
    v == null
      ? ''
      : formatValue(
          convertUnits(v, 'mm', unit.value),
          unit.value,
          precision.value,
        );

  const input = ref(display(mm.value));
  let lastWrittenByUs = input.value;

  function writeDisplay(s: string) {
    lastWrittenByUs = s;
    input.value = s;
  }

  /** True when `input.value` already represents `mm.value` losslessly. */
  function isEcho(): boolean {
    if (mm.value == null) return input.value === '';
    const parsed = parseDimension(input.value, unit.value);
    if (parsed == null) return false;
    return Math.abs(convertUnits(parsed, unit.value, 'mm') - mm.value) < 1e-6;
  }

  watch(mm, (v) => {
    if (v == null) {
      writeDisplay('');
      return;
    }
    if (isEcho()) return;
    writeDisplay(display(v));
  });

  watch([unit, precision], () => {
    if (mm.value != null) writeDisplay(display(mm.value));
  });

  watch(input, (s) => {
    if (s === lastWrittenByUs) return;
    const parsed = parseDimension(s, unit.value);
    if (parsed == null) return;
    const next = convertUnits(parsed, unit.value, 'mm');
    if (mm.value == null || Math.abs(next - mm.value) >= 1e-6) {
      mm.value = next;
    }
  });

  /**
   * Re-render the input from current storage. Called by the consumer on
   * blur — matches how SketchUp / Fusion behave: typed text wins while
   * focused; canonical formatted text wins after blur.
   */
  function commit() {
    if (mm.value != null) writeDisplay(display(mm.value));
  }

  return { input, commit };
}
