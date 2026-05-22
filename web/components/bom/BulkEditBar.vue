<script lang="ts" setup>
import { type Micrometres } from 'cutlist';
import { useDimensionInput } from '~/composables/useDimensionInput';

const props = defineProps<{
  selectedCount: number;
  editableCount: number;
  materials: string[];
}>();

const emit = defineEmits<{
  apply: [
    patch: {
      material?: string;
      lengthUm?: Micrometres;
      widthUm?: Micrometres;
      thicknessUm?: Micrometres;
    },
  ];
  delete: [];
  clear: [];
}>();

const { distanceUnit, precision } = useProjectSettings();
const unit = computed<'mm' | 'in'>(() => distanceUnit.value ?? 'mm');
const unitLabel = computed(() => (unit.value === 'in' ? 'in' : 'mm'));

const material = ref<string | null>(null);
const lengthUm = ref<Micrometres | null>(null);
const widthUm = ref<Micrometres | null>(null);
const thicknessUm = ref<Micrometres | null>(null);

const { input: lengthInput, commit: commitLength } = useDimensionInput(
  lengthUm,
  unit,
  precision,
);
const { input: widthInput, commit: commitWidth } = useDimensionInput(
  widthUm,
  unit,
  precision,
);
const { input: thicknessInput, commit: commitThickness } = useDimensionInput(
  thicknessUm,
  unit,
  precision,
);

const isValid = computed(
  () =>
    material.value !== null ||
    lengthUm.value != null ||
    widthUm.value != null ||
    thicknessUm.value != null,
);

function reset() {
  material.value = null;
  lengthUm.value = null;
  widthUm.value = null;
  thicknessUm.value = null;
}

function onApply() {
  const patch: {
    material?: string;
    lengthUm?: Micrometres;
    widthUm?: Micrometres;
    thicknessUm?: Micrometres;
  } = {};
  if (material.value !== null) patch.material = material.value;
  if (lengthUm.value != null) patch.lengthUm = lengthUm.value;
  if (widthUm.value != null) patch.widthUm = widthUm.value;
  if (thicknessUm.value != null) patch.thicknessUm = thicknessUm.value;
  emit('apply', patch);
  reset();
}

function onClear() {
  emit('clear');
  reset();
}
</script>

<template>
  <div
    class="flex flex-wrap items-end gap-2 px-5 py-2 border-t border-subtle bg-base"
  >
    <div class="flex items-center self-center gap-1.5 mr-1">
      <span
        class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-elevated text-muted"
      >
        {{ selectedCount }} selected
        <template v-if="editableCount !== selectedCount">
          · {{ editableCount }} can be edited
        </template>
      </span>
    </div>

    <div class="flex items-end gap-2 flex-wrap flex-1">
      <div class="flex flex-col gap-0.5">
        <span class="text-xs text-dim">Material</span>
        <USelect
          v-model="material"
          :items="materials"
          placeholder="— no change —"
          size="xs"
          class="w-36"
        />
      </div>

      <div class="flex flex-col gap-0.5">
        <span class="text-xs text-dim">L ({{ unitLabel }})</span>
        <UInput
          v-model="lengthInput"
          size="xs"
          class="w-20"
          @blur="commitLength"
        />
      </div>

      <div class="flex flex-col gap-0.5">
        <span class="text-xs text-dim">W ({{ unitLabel }})</span>
        <UInput
          v-model="widthInput"
          size="xs"
          class="w-20"
          @blur="commitWidth"
        />
      </div>

      <div class="flex flex-col gap-0.5">
        <span class="text-xs text-dim">T ({{ unitLabel }})</span>
        <UInput
          v-model="thicknessInput"
          size="xs"
          class="w-20"
          @blur="commitThickness"
        />
      </div>
    </div>

    <div class="flex items-center gap-2 self-end">
      <UButton size="xs" color="primary" :disabled="!isValid" @click="onApply">
        Apply
      </UButton>
      <UButton
        size="xs"
        color="error"
        variant="soft"
        icon="i-lucide-trash-2"
        :disabled="editableCount === 0"
        @click="emit('delete')"
      >
        Delete
      </UButton>
      <UButton size="xs" color="neutral" variant="ghost" @click="onClear">
        Clear selection
      </UButton>
    </div>
  </div>
</template>
