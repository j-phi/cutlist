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

// Local draft state for each editable dimension. Lets the user type a freeform
// string (e.g. "8 ft", "120", "2.4m") without thrashing the YAML on every
// keystroke; commit on blur or Enter. Cleared on add/remove because indices
// shift and a stale draft would be mis-attributed to the wrong row.
const drafts = ref<Record<number, string>>({});
const crossWidthDraft = ref<string | null>(null);
const crossThicknessDraft = ref<string | null>(null);

function draftFor(idx: number, mm: number): string {
  return drafts.value[idx] ?? displayDim(mm);
}

function onDraft(idx: number, raw: string) {
  drafts.value[idx] = raw;
}

function emitLengths(next: number[]) {
  drafts.value = {};
  emit('update:modelValue', {
    ...props.modelValue,
    size: { ...props.modelValue.size, lengths: next },
  });
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
  const next = [...props.modelValue.size.lengths];
  next[idx] = fromDisplay(parsed);
  emitLengths(next.sort((a, b) => a - b));
}

function removeLength(idx: number) {
  emitLengths(props.modelValue.size.lengths.filter((_, i) => i !== idx));
}

function addLength() {
  // Seed with a copy of the longest current length so the user immediately
  // edits a sensible number; fall back to 96″ / 2400mm if the list is empty.
  const existing = props.modelValue.size.lengths;
  const seed =
    existing.length > 0
      ? Math.max(...existing)
      : unit.value === 'in'
        ? convertUnits(96, 'in', 'mm')
        : 2400;
  emitLengths([...existing, seed].sort((a, b) => a - b));
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

function commitCrossSection(
  field: 'crossSectionWidth' | 'crossSectionThickness',
) {
  const draftRef =
    field === 'crossSectionWidth' ? crossWidthDraft : crossThicknessDraft;
  const raw = draftRef.value;
  if (raw == null) return;
  const parsed = parseDimension(raw, unit.value);
  // Invalid or non-positive: drop the draft so the input reverts to canonical.
  if (parsed == null || parsed <= 0) {
    draftRef.value = null;
    return;
  }
  draftRef.value = null;
  emit('update:modelValue', {
    ...props.modelValue,
    size: { ...props.modelValue.size, [field]: fromDisplay(parsed) },
  });
}

function crossDisplay(
  field: 'crossSectionWidth' | 'crossSectionThickness',
): string {
  const draftRef =
    field === 'crossSectionWidth' ? crossWidthDraft : crossThicknessDraft;
  return draftRef.value ?? displayDim(props.modelValue.size[field]);
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

    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-muted uppercase tracking-wider">
        Cross-section ({{ unit }})
      </label>
      <div class="flex items-center gap-2">
        <UInput
          :model-value="crossDisplay('crossSectionThickness')"
          class="flex-1 font-mono"
          :placeholder="unit === 'in' ? 'e.g. 1 1/2' : 'e.g. 38'"
          data-testid="linear-cross-thickness"
          @update:model-value="(v: string) => (crossThicknessDraft = v)"
          @blur="commitCrossSection('crossSectionThickness')"
          @keydown.enter="commitCrossSection('crossSectionThickness')"
        />
        <span class="text-dim text-sm">&times;</span>
        <UInput
          :model-value="crossDisplay('crossSectionWidth')"
          class="flex-1 font-mono"
          :placeholder="unit === 'in' ? 'e.g. 3 1/2' : 'e.g. 89'"
          data-testid="linear-cross-width"
          @update:model-value="(v: string) => (crossWidthDraft = v)"
          @blur="commitCrossSection('crossSectionWidth')"
          @keydown.enter="commitCrossSection('crossSectionWidth')"
        />
      </div>
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
