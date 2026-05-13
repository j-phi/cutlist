<script lang="ts" setup>
import type { Micrometres } from 'cutlist';
import type { ManualPartInput } from '~/composables/useProjects';
import { useDimensionInput } from '~/composables/useDimensionInput';
import { cycleGrainLock, GRAIN_LABELS } from '~/utils/grain';

const props = defineProps<{
  materials: string[];
  initial?: ManualPartInput & { partNumber: number };
}>();

const emit = defineEmits<{
  save: [data: ManualPartInput];
  cancel: [];
}>();

const { distanceUnit, precision, linearMaterials } = useProjectSettings();
const unit = computed<'mm' | 'in'>(() => distanceUnit.value ?? 'mm');

const name = ref(props.initial?.name ?? '');
const widthUm = ref<Micrometres | null>(props.initial?.widthUm ?? null);
const lengthUm = ref<Micrometres | null>(props.initial?.lengthUm ?? null);
const thicknessUm = ref<Micrometres | null>(props.initial?.thicknessUm ?? null);
const qty = ref(props.initial?.qty ?? 1);
const material = ref(props.initial?.material ?? props.materials[0] ?? '');
const grainLock = ref<'length' | 'width' | undefined>(props.initial?.grainLock);

const isLinear = computed(() => linearMaterials.value.has(material.value));
watch(isLinear, (linear) => {
  if (linear) grainLock.value = undefined;
});

const { input: widthInput, commit: commitWidth } = useDimensionInput(
  widthUm,
  unit,
  precision,
);
const { input: lengthInput, commit: commitLength } = useDimensionInput(
  lengthUm,
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
    name.value.trim() !== '' &&
    widthUm.value != null &&
    widthUm.value > 0 &&
    lengthUm.value != null &&
    lengthUm.value > 0 &&
    thicknessUm.value != null &&
    thicknessUm.value > 0 &&
    qty.value >= 1 &&
    material.value !== '',
);

const placeholder = computed(() => (unit.value === 'in' ? 'e.g. 3/4' : '0'));
const formAriaLabel = computed(() =>
  props.initial ? 'Edit part' : 'Add part',
);
const submitLabel = computed(() => (props.initial ? 'Save' : 'Add'));
const grainLabel = computed(() => GRAIN_LABELS[grainLock.value ?? 'free']);

function submit() {
  if (
    !isValid.value ||
    widthUm.value == null ||
    lengthUm.value == null ||
    thicknessUm.value == null
  )
    return;
  emit('save', {
    name: name.value.trim(),
    widthUm: widthUm.value,
    lengthUm: lengthUm.value,
    thicknessUm: thicknessUm.value,
    qty: qty.value,
    material: material.value,
    grainLock: grainLock.value,
  });
  if (!props.initial) {
    name.value = '';
    widthUm.value = null;
    lengthUm.value = null;
    thicknessUm.value = null;
    qty.value = 1;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter') submit();
  if (e.key === 'Escape') emit('cancel');
}
</script>

<template>
  <div
    class="flex flex-col gap-2 p-2 rounded-lg border border-subtle bg-surface"
    role="form"
    :aria-label="formAriaLabel"
    @keydown="onKeydown"
  >
    <div class="grid grid-cols-12 gap-2 items-center">
      <UInput
        v-model="name"
        placeholder="Part name"
        size="sm"
        class="col-span-3"
        autofocus
      />
      <label class="col-span-1 text-xs text-muted">L ({{ unit }})</label>
      <UInput
        id="manual-part-length"
        v-model="lengthInput"
        :placeholder="placeholder"
        size="sm"
        type="text"
        inputmode="decimal"
        class="col-span-1"
        @blur="commitLength"
        @keydown.enter.prevent="submit"
      />
      <label class="col-span-1 text-xs text-muted">W ({{ unit }})</label>
      <UInput
        id="manual-part-width"
        v-model="widthInput"
        :placeholder="placeholder"
        size="sm"
        type="text"
        inputmode="decimal"
        class="col-span-1"
        @blur="commitWidth"
        @keydown.enter.prevent="submit"
      />
      <label class="col-span-1 text-xs text-muted">T ({{ unit }})</label>
      <UInput
        id="manual-part-thickness"
        v-model="thicknessInput"
        :placeholder="placeholder"
        size="sm"
        type="text"
        inputmode="decimal"
        class="col-span-1"
        @blur="commitThickness"
        @keydown.enter.prevent="submit"
      />
      <UInputNumber
        id="manual-part-qty"
        v-model="qty"
        :min="1"
        size="sm"
        class="col-span-1"
      />
      <USelect
        v-model="material"
        :items="materials"
        size="sm"
        class="col-span-1"
        aria-label="Material"
      />
    </div>
    <div class="flex gap-2 justify-between">
      <div class="flex items-center gap-2">
        <UButton
          v-if="!isLinear"
          size="xs"
          color="neutral"
          variant="ghost"
          @click="grainLock = cycleGrainLock(grainLock)"
        >
          {{ grainLabel }}
        </UButton>
      </div>
      <div class="flex gap-2">
        <UButton
          size="xs"
          color="neutral"
          variant="ghost"
          @click="emit('cancel')"
        >
          Cancel
        </UButton>
        <UButton size="xs" color="primary" :disabled="!isValid" @click="submit">
          {{ submitLabel }}
        </UButton>
      </div>
    </div>
  </div>
</template>
