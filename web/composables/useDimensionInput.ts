import {
  convertUnits,
  formatValue,
  mmToUm,
  parseDimension,
  umToMm,
  type Micrometres,
  type Precision,
} from 'cutlist';
import { ref, watch, type Ref } from 'vue';

/**
 * Bridge a µm-stored ref to a free-text input string. Storage stays
 * canonical; rounding lives only at the formatting boundary.
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
  um: Ref<Micrometres | null | undefined>,
  unit: Ref<'mm' | 'in'>,
  precision: Ref<Precision>,
): { input: Ref<string>; commit: () => void } {
  const display = (v: Micrometres | null | undefined): string =>
    v == null
      ? ''
      : formatValue(
          convertUnits(umToMm(v), 'mm', unit.value),
          unit.value,
          precision.value,
        );

  const input = ref(display(um.value));
  let lastWrittenByUs = input.value;

  function writeDisplay(s: string) {
    lastWrittenByUs = s;
    input.value = s;
  }

  function parseToUm(s: string): Micrometres | null {
    const parsed = parseDimension(s, unit.value);
    if (parsed == null) return null;
    return mmToUm(convertUnits(parsed, unit.value, 'mm'));
  }

  /** True when `input.value` already represents `um.value` exactly. */
  function isEcho(): boolean {
    if (um.value == null) return input.value === '';
    const next = parseToUm(input.value);
    return next === um.value;
  }

  watch(um, (v) => {
    if (v == null) {
      writeDisplay('');
      return;
    }
    if (isEcho()) return;
    writeDisplay(display(v));
  });

  watch([unit, precision], () => {
    if (um.value != null) writeDisplay(display(um.value));
  });

  watch(input, (s) => {
    if (s === lastWrittenByUs) return;
    const next = parseToUm(s);
    if (next == null) return;
    if (next !== um.value) um.value = next;
  });

  /**
   * Re-render the input from current storage. Called by the consumer on
   * blur — matches how SketchUp / Fusion behave: typed text wins while
   * focused; canonical formatted text wins after blur.
   */
  function commit() {
    if (um.value != null) writeDisplay(display(um.value));
  }

  return { input, commit };
}
