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
 * Wire: `<UInput v-model="input" @blur="commit" />`.
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

  // The input → storage watcher relies on `lastWrittenByUs` to ignore
  // writes it didn't originate, and `isEcho` lets the storage → input
  // watcher skip reformat while the user is mid-typing.
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

  /** Re-render from canonical storage. Typed text wins while focused;
   * canonical wins on blur. */
  function commit() {
    if (um.value != null) writeDisplay(display(um.value));
  }

  return { input, commit };
}
