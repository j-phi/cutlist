<script lang="ts" setup>
import {
  convertUnits,
  formatValue,
  type LinearStockMatrix,
  type Precision,
} from 'cutlist';

const props = defineProps<{
  modelValue: LinearStockMatrix;
  distanceUnit: 'in' | 'mm';
  precision: Precision;
  availableLengths?: number[];
}>();

const emit = defineEmits<{
  'update:modelValue': [next: LinearStockMatrix];
  remove: [];
}>();

const unit = computed(() => props.distanceUnit);

const toDisplay = (mm: number) => convertUnits(mm, 'mm', unit.value);

function displayDim(mm: number): string {
  return formatValue(toDisplay(mm), unit.value, props.precision);
}

const crossSectionLabel = computed(() => {
  const w = displayDim(props.modelValue.size.crossSectionWidth);
  const t = displayDim(props.modelValue.size.crossSectionThickness);
  const suffix = unit.value === 'in' ? '"' : ' mm';
  return `${t}${suffix} × ${w}${suffix}`;
});

const lengthOptions = computed(() => {
  const enabled = new Set(props.modelValue.size.lengths);
  const merged = new Set<number>(props.availableLengths ?? []);
  for (const mm of props.modelValue.size.lengths) merged.add(mm);
  return [...merged]
    .sort((a, b) => a - b)
    .map((mm) => ({ mm, checked: enabled.has(mm) }));
});

function emitNext(patch: Partial<LinearStockMatrix>) {
  emit('update:modelValue', { ...props.modelValue, ...patch });
}

function onMaterialInput(name: string) {
  emitNext({ material: name });
}

function onColor(color: string | undefined) {
  emitNext({ color });
}

function toggleLength(mm: number, checked: boolean) {
  const current = new Set(props.modelValue.size.lengths);
  if (checked) current.add(mm);
  else current.delete(mm);
  const next = [...current].sort((a, b) => a - b);
  emit('update:modelValue', {
    ...props.modelValue,
    size: { ...props.modelValue.size, lengths: next },
  });
}

function lengthLabel(mm: number): string {
  if (unit.value === 'in') {
    const inches = toDisplay(mm);
    if (inches >= 12 && Math.abs(inches % 12) < 0.05) {
      const feet = Math.round(inches / 12);
      return `${feet} ft  (${displayDim(mm)}")`;
    }
    return `${displayDim(mm)}"`;
  }
  return `${displayDim(mm)} mm`;
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
        <label
          v-for="opt in lengthOptions"
          :key="opt.mm"
          class="flex items-center gap-2 rounded border border-subtle bg-elevated px-3 py-1.5 cursor-pointer hover:border-default transition-colors"
        >
          <UCheckbox
            :model-value="opt.checked"
            :data-length-mm="opt.mm"
            @update:model-value="
              (v: boolean | 'indeterminate') => toggleLength(opt.mm, v === true)
            "
          />
          <span class="text-[13px] text-body font-mono">
            {{ lengthLabel(opt.mm) }}
          </span>
        </label>
      </div>
    </div>
  </div>
</template>
