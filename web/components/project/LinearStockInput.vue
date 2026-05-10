<script lang="ts" setup>
import {
  convertUnits,
  formatValue,
  parseDimension,
  type LinearStockMatrix,
  type Precision,
} from 'cutlist';

const props = defineProps<{
  modelValue: LinearStockMatrix;
  distanceUnit: 'in' | 'mm';
  precision: Precision;
}>();

const emit = defineEmits<{
  'update:modelValue': [next: LinearStockMatrix];
  remove: [];
}>();

const unit = computed(() => props.distanceUnit);

const toDisplay = (mm: number) => convertUnits(mm, 'mm', unit.value);
const fromDisplay = (display: number) =>
  convertUnits(display, unit.value, 'mm');

function displayDim(mm: number): string {
  return formatValue(toDisplay(mm), unit.value, props.precision);
}

const crossSectionLabel = computed(() => {
  const w = displayDim(props.modelValue.size.crossSectionWidth);
  const t = displayDim(props.modelValue.size.crossSectionThickness);
  const suffix = unit.value === 'in' ? '"' : ' mm';
  return `${t}${suffix} × ${w}${suffix}`;
});

// Local draft state for each length row, keyed by index. Lets the user type a
// freeform string (e.g. "8 ft", "120", "2.4m") without us thrashing the YAML
// on every keystroke. We commit on blur or Enter.
const drafts = ref<Record<number, string>>({});

function draftFor(idx: number, mm: number): string {
  return drafts.value[idx] ?? displayDim(mm);
}

function onDraft(idx: number, raw: string) {
  drafts.value[idx] = raw;
}

function commit(idx: number) {
  const raw = drafts.value[idx];
  if (raw == null) return;
  const parsed = parseDimension(raw, unit.value);
  if (parsed == null || parsed <= 0) {
    // Invalid: drop the draft so the input reverts to the canonical value.
    delete drafts.value[idx];
    return;
  }
  const mm = fromDisplay(parsed);
  delete drafts.value[idx];
  const next = [...props.modelValue.size.lengths];
  next[idx] = mm;
  next.sort((a, b) => a - b);
  emit('update:modelValue', {
    ...props.modelValue,
    size: { ...props.modelValue.size, lengths: next },
  });
}

function removeLength(idx: number) {
  delete drafts.value[idx];
  const next = props.modelValue.size.lengths.filter((_, i) => i !== idx);
  emit('update:modelValue', {
    ...props.modelValue,
    size: { ...props.modelValue.size, lengths: next },
  });
}

function addLength() {
  // Append a sensible default the user can immediately edit: a copy of the
  // longest current length, or 96″ / 2400mm if the list is empty.
  const existing = props.modelValue.size.lengths;
  const defaultMm =
    existing.length > 0
      ? Math.max(...existing)
      : unit.value === 'in'
        ? convertUnits(96, 'in', 'mm')
        : 2400;
  const next = [...existing, defaultMm].sort((a, b) => a - b);
  emit('update:modelValue', {
    ...props.modelValue,
    size: { ...props.modelValue.size, lengths: next },
  });
}

function emitNext(patch: Partial<LinearStockMatrix>) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function onMaterialInput(name: string) {
  emitNext({ material: name });
}

function onColor(color: string | undefined) {
  emitNext({ color });
}

/** Pretty side-label for foot-multiple inches: "(8 ft)". */
function footLabel(mm: number): string {
  if (unit.value !== 'in') return '';
  const inches = toDisplay(mm);
  if (inches >= 12 && Math.abs(inches - Math.round(inches / 12) * 12) < 0.05) {
    return `${Math.round(inches / 12)} ft`;
  }
  return '';
}
</script>

<template>
  <div
    class="rounded-lg border border-default bg-surface p-4 flex flex-col gap-3"
    data-testid="linear-stock-input"
  >
    <div class="flex items-center gap-2">
      <MaterialColorPicker
        :model-value="modelValue.color"
        @update:model-value="onColor"
      />
      <UInput
        :model-value="modelValue.material"
        class="flex-1"
        placeholder="Material name"
        data-testid="linear-material-name"
        @update:model-value="onMaterialInput"
      />
      <span class="text-[11px] uppercase tracking-wider text-dim font-medium">
        linear
      </span>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        size="sm"
        data-testid="linear-remove"
        @click="emit('remove')"
      />
    </div>

    <div class="flex flex-col gap-1">
      <label class="text-xs font-medium text-muted uppercase tracking-wider">
        Cross-section
      </label>
      <span
        class="text-[13px] text-teal-300 font-mono"
        data-testid="linear-cross-section"
      >
        {{ crossSectionLabel }}
      </span>
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-muted uppercase tracking-wider">
        Available lengths
      </label>
      <div class="flex flex-col gap-1">
        <div
          v-for="(mm, idx) in modelValue.size.lengths"
          :key="idx"
          class="flex items-center gap-2"
          data-testid="linear-length-row"
        >
          <UInput
            :model-value="draftFor(idx, mm)"
            class="flex-1 font-mono"
            :placeholder="unit === 'in' ? 'e.g. 96” or 8ft' : 'e.g. 2400'"
            :data-length-mm="mm"
            @update:model-value="(v: string) => onDraft(idx, v)"
            @blur="commit(idx)"
            @keydown.enter="commit(idx)"
          />
          <span
            v-if="footLabel(mm)"
            class="text-xs text-dim font-mono min-w-[3rem] text-right"
          >
            {{ footLabel(mm) }}
          </span>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            size="xs"
            data-testid="linear-length-remove"
            @click="removeLength(idx)"
          />
        </div>
      </div>
      <UButton
        color="neutral"
        variant="soft"
        size="xs"
        icon="i-lucide-plus"
        class="self-start mt-1"
        data-testid="linear-length-add"
        @click="addLength"
      >
        Add length
      </UButton>
    </div>
  </div>
</template>
