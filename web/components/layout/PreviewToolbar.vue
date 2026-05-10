<script lang="ts" setup>
import { convertUnits, formatDimensionForInput, parseDimension } from 'cutlist';

const {
  bladeWidth,
  distanceUnit,
  margin,
  defaultAlgorithm,
  showPartNumbers,
  isLoading,
} = useProjectSettings();

const unit = computed<'mm' | 'in'>(() => distanceUnit.value ?? 'mm');

/**
 * Decouple the typed string from the mm-stored value so live keystrokes
 * (e.g. "0." mid-typing) don't get reformatted away. Mirrors the pattern
 * in `ManualPartRow`: the input is the source of truth while focused; we
 * push parsed values to storage; we only reformat from storage when the
 * unit flips.
 */
function useMmInput(mm: Ref<number | undefined>) {
  const display = (v: number | undefined) =>
    v == null
      ? ''
      : formatDimensionForInput(convertUnits(v, 'mm', unit.value), unit.value);

  const input = ref(display(mm.value));

  /** True when the current input string already represents `mm.value`. */
  const isEcho = () => {
    const parsed = parseDimension(input.value, unit.value);
    if (parsed == null) return false;
    return convertUnits(parsed, unit.value, 'mm') === mm.value;
  };

  // Storage → display: hydrates the input on first arrival of the project
  // value and on any external change. Skips echoes from our own writes so
  // mid-typing values like `"0."` aren't snapped back to `"0"`.
  watch(mm, (v) => {
    if (v == null || isEcho()) return;
    input.value = display(v);
  });

  // Re-render the input in the new unit on a unit flip, preserving the
  // typed precision (so "1 1/2" → "38.1" rather than reformatting from mm).
  watch(unit, (next, prev) => {
    const v = parseDimension(input.value, prev);
    if (v != null)
      input.value = formatDimensionForInput(convertUnits(v, prev, next), next);
  });

  // Input → storage. Update mm only when the parse is valid; a transient
  // typo doesn't overwrite the stored value.
  watch(input, (s) => {
    const parsed = parseDimension(s, unit.value);
    if (parsed == null) return;
    const next = convertUnits(parsed, unit.value, 'mm');
    if (next !== mm.value) mm.value = next;
  });

  return input;
}

const bladeInput = useMmInput(bladeWidth);
const marginInput = useMmInput(margin);

const ALGORITHM_ITEMS = [
  { label: 'Auto', value: 'auto' },
  { label: 'Tidy', value: 'tidy' },
  { label: 'Compact', value: 'compact' },
  { label: 'CNC', value: 'cnc' },
];
</script>

<template>
  <div v-if="!isLoading" class="flex items-center gap-3 flex-wrap">
    <div class="flex items-center gap-1.5">
      <label class="text-xs text-muted whitespace-nowrap">Default cut</label>
      <USelect
        v-model="defaultAlgorithm"
        :items="ALGORITHM_ITEMS"
        size="xs"
        class="w-24"
      />
    </div>

    <div class="flex items-center gap-1.5">
      <label class="text-xs text-muted whitespace-nowrap"
        >Blade ({{ unit }})</label
      >
      <UInput v-model="bladeInput" type="text" size="xs" class="w-20" />
    </div>

    <div class="flex items-center gap-1.5">
      <label class="text-xs text-muted whitespace-nowrap"
        >Margin ({{ unit }})</label
      >
      <UInput v-model="marginInput" type="text" size="xs" class="w-20" />
    </div>

    <label class="flex items-center gap-1.5 cursor-pointer">
      <UCheckbox v-model="showPartNumbers" />
      <span class="text-xs text-muted whitespace-nowrap">Part #s</span>
    </label>
  </div>
</template>
