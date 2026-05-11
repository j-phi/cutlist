<script lang="ts" setup>
import {
  convertUnits,
  formatValue,
  parseDimension,
  type Precision,
  type SheetStockMatrix,
} from 'cutlist';

const props = defineProps<{
  modelValue: SheetStockMatrix;
  distanceUnit: 'in' | 'mm';
  precision: Precision;
}>();

const emit = defineEmits<{
  'update:modelValue': [next: SheetStockMatrix];
  remove: [];
}>();

const unit = computed(() => props.distanceUnit);

const toDisplay = (mm: number) => convertUnits(mm, 'mm', unit.value);
const fromDisplay = (display: number) =>
  convertUnits(display, unit.value, 'mm');

function displayDim(mm: number): string {
  return formatValue(toDisplay(mm), unit.value, props.precision);
}

function emitNext(patch: Partial<SheetStockMatrix>) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function onMaterialInput(name: string) {
  emitNext({ material: name });
}

function onColor(color: string | undefined) {
  emitNext({ color });
}

function emitSizes(sizes: SheetStockMatrix['sizes']) {
  emit('update:modelValue', { ...props.modelValue, sizes });
}

// Per-size "add thickness" draft, keyed by size index. Cleared when sizes
// change because indices shift.
const newThickness = ref<Record<number, string>>({});
// Add-size draft (width + length).
const newSizeWidth = ref<string>('');
const newSizeLength = ref<string>('');

function addThickness(sizeIndex: number) {
  const raw = newThickness.value[sizeIndex];
  const parsed = parseDimension(raw, unit.value);
  if (parsed == null || parsed <= 0) {
    newThickness.value[sizeIndex] = '';
    return;
  }
  const next = props.modelValue.sizes.map((s, i) =>
    i === sizeIndex
      ? { ...s, thickness: [...s.thickness, fromDisplay(parsed)] }
      : s,
  );
  newThickness.value[sizeIndex] = '';
  emitSizes(next);
}

function removeThickness(sizeIndex: number, dimIndex: number) {
  const next = props.modelValue.sizes.map((s, i) =>
    i === sizeIndex
      ? { ...s, thickness: s.thickness.filter((_, j) => j !== dimIndex) }
      : s,
  );
  emitSizes(next);
}

function addSize() {
  const w = parseDimension(newSizeWidth.value, unit.value);
  const l = parseDimension(newSizeLength.value, unit.value);
  if (w == null || w <= 0 || l == null || l <= 0) return;
  const next = [
    ...props.modelValue.sizes,
    { width: fromDisplay(w), length: fromDisplay(l), thickness: [] },
  ];
  newSizeWidth.value = '';
  newSizeLength.value = '';
  emitSizes(next);
}

function removeSize(sizeIndex: number) {
  newThickness.value = {};
  emitSizes(props.modelValue.sizes.filter((_, i) => i !== sizeIndex));
}

// When the project's display unit flips, re-render any in-progress draft
// strings so the user's mental "this is 18" remains visually consistent.
function retranslate(
  bag: Record<string | number, string>,
  prev: 'mm' | 'in',
  next: 'mm' | 'in',
) {
  for (const k in bag) {
    const v = parseDimension(bag[k], prev);
    if (v != null)
      bag[k] = formatValue(convertUnits(v, prev, next), next, props.precision);
  }
}

watch(unit, (next, prev) => {
  retranslate(newThickness.value, prev, next);
  const ws = parseDimension(newSizeWidth.value, prev);
  if (ws != null)
    newSizeWidth.value = formatValue(
      convertUnits(ws, prev, next),
      next,
      props.precision,
    );
  const ls = parseDimension(newSizeLength.value, prev);
  if (ls != null)
    newSizeLength.value = formatValue(
      convertUnits(ls, prev, next),
      next,
      props.precision,
    );
});
</script>

<template>
  <div
    class="rounded-lg border border-default bg-surface p-4 flex flex-col gap-3"
    data-testid="sheet-stock-input"
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
        data-testid="sheet-material-name"
        @update:model-value="onMaterialInput"
      />
      <span class="text-[11px] uppercase tracking-wider text-dim font-medium">
        sheet
      </span>
      <UButton
        color="neutral"
        variant="ghost"
        icon="i-lucide-trash-2"
        size="sm"
        data-testid="sheet-remove"
        @click="emit('remove')"
      />
    </div>

    <div class="flex flex-col gap-2">
      <label class="text-xs font-medium text-muted uppercase tracking-wider">
        Board sizes ({{ unit }})
      </label>

      <div
        v-for="(size, sizeIndex) in modelValue.sizes"
        :key="sizeIndex"
        class="rounded border border-subtle bg-elevated px-3 py-2 flex flex-col gap-1.5"
        data-testid="sheet-size-row"
      >
        <div class="flex items-center justify-between">
          <span class="text-[13px] text-teal-300 font-mono">
            {{ displayDim(size.width) }}{{ unit }}
            <span class="text-dim">&times;</span>
            {{ displayDim(size.length) }}{{ unit }}
          </span>
          <button
            class="text-dim hover:text-body leading-none transition-colors"
            data-testid="sheet-size-remove"
            @click="removeSize(sizeIndex)"
          >
            &times;
          </button>
        </div>

        <div class="flex flex-wrap items-center gap-1.5">
          <span
            v-for="(dim, i) in size.thickness"
            :key="i"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded border border-subtle bg-default text-[12px] text-teal-300/80 font-mono"
            data-testid="sheet-thickness-chip"
          >
            {{ displayDim(dim) }}{{ unit }}
            <button
              class="text-dim hover:text-body leading-none ml-0.5 transition-colors"
              data-testid="sheet-thickness-remove"
              @click="removeThickness(sizeIndex, i)"
            >
              &times;
            </button>
          </span>
          <input
            v-model="newThickness[sizeIndex]"
            type="text"
            class="bg-default rounded px-2 py-0.5 text-[12px] text-teal-300/70 font-mono w-16 outline-none border border-subtle focus:border-teal-600 placeholder:text-dim transition-colors"
            placeholder="+ thick"
            data-testid="sheet-thickness-add"
            @keydown.enter.prevent="addThickness(sizeIndex)"
            @blur="addThickness(sizeIndex)"
          />
        </div>
      </div>

      <div class="flex items-center gap-1.5">
        <input
          v-model="newSizeWidth"
          type="text"
          class="bg-elevated rounded px-2 py-1 text-[13px] text-teal-300/70 font-mono w-20 outline-none border border-subtle focus:border-teal-600 placeholder:text-dim transition-colors"
          placeholder="width"
          data-testid="sheet-size-width"
          @keydown.enter.prevent="addSize"
        />
        <span class="text-dim text-sm">&times;</span>
        <input
          v-model="newSizeLength"
          type="text"
          class="bg-elevated rounded px-2 py-1 text-[13px] text-teal-300/70 font-mono w-20 outline-none border border-subtle focus:border-teal-600 placeholder:text-dim transition-colors"
          placeholder="length"
          data-testid="sheet-size-length"
          @keydown.enter.prevent="addSize"
        />
        <button
          class="text-dim hover:text-teal-400 transition-colors text-sm px-1"
          data-testid="sheet-size-add"
          @click="addSize"
        >
          + add size
        </button>
      </div>
    </div>
  </div>
</template>
