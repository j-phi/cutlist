<script lang="ts" setup>
import type { Precision } from 'cutlist';
import { defaultPrecisionForUnit } from '~/utils/settings';

const open = defineModel<boolean>('open', { default: false });

const { addProject } = useProjects();
const toast = useToast();
const projectName = ref('');
const unit = ref<'mm' | 'in'>('mm');
const precision = ref<Precision>(defaultPrecisionForUnit('mm'));

interface PrecisionOption {
  label: string;
  value: Precision;
}

const inchPrecisionOptions: PrecisionOption[] = [
  { label: '1/8"', value: { kind: 'fraction', denominator: 8 } },
  { label: '1/16"', value: { kind: 'fraction', denominator: 16 } },
  { label: '1/32"', value: { kind: 'fraction', denominator: 32 } },
  { label: '1/64"', value: { kind: 'fraction', denominator: 64 } },
  { label: 'Decimal (0.01")', value: { kind: 'decimal', step: 0.01 } },
];

const mmPrecisionOptions: PrecisionOption[] = [
  { label: '1 mm', value: { kind: 'decimal', step: 1 } },
  { label: '0.5 mm', value: { kind: 'decimal', step: 0.5 } },
  { label: '0.1 mm', value: { kind: 'decimal', step: 0.1 } },
  { label: '0.01 mm', value: { kind: 'decimal', step: 0.01 } },
];

const precisionOptions = computed(() =>
  unit.value === 'in' ? inchPrecisionOptions : mmPrecisionOptions,
);

function precisionKey(p: Precision): string {
  return p.kind === 'fraction' ? `f:${p.denominator}` : `d:${p.step}`;
}

const precisionItems = computed(() =>
  precisionOptions.value.map((o) => ({
    label: o.label,
    value: precisionKey(o.value),
  })),
);

const precisionModel = computed<string>({
  get: () => precisionKey(precision.value),
  set: (key: string) => {
    const match = precisionOptions.value.find(
      (o) => precisionKey(o.value) === key,
    );
    if (match) precision.value = match.value;
  },
});

// Reset to defaults when the modal opens. When the user flips units, the
// precision resets too — fractional precision in mm and decimal-mm steps
// in inches are nonsense, so we don't try to carry one across.
watch(open, (v) => {
  if (v) {
    projectName.value = '';
    unit.value = 'mm';
    precision.value = defaultPrecisionForUnit('mm');
  }
});

watch(unit, (u) => {
  precision.value = defaultPrecisionForUnit(u);
});

async function createProject() {
  const name = projectName.value.trim();
  if (!name) return;
  try {
    await addProject(name, unit.value, precision.value);
    open.value = false;
  } catch (err) {
    toast.add({
      title: 'Failed to create project',
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    });
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="New Project"
    description="Create a new project"
  >
    <template #content>
      <div class="p-6 space-y-4 bg-elevated border border-default rounded-lg">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium text-white">New Project</h3>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            class="rounded-full"
            @click="open = false"
          />
        </div>
        <UInput
          v-model="projectName"
          placeholder="Project name"
          class="w-full"
          autofocus
          @keydown.enter="createProject"
        />
        <div>
          <label class="block text-xs text-muted mb-1.5">Units</label>
          <div
            class="flex gap-1 p-0.5 rounded-lg bg-surface border border-subtle"
          >
            <button
              class="flex-1 py-1.5 text-sm font-medium rounded-md transition-colors"
              :class="
                unit === 'mm'
                  ? 'bg-teal-500 text-black'
                  : 'text-muted hover:text-body'
              "
              @click="unit = 'mm'"
            >
              mm
            </button>
            <button
              class="flex-1 py-1.5 text-sm font-medium rounded-md transition-colors"
              :class="
                unit === 'in'
                  ? 'bg-teal-500 text-black'
                  : 'text-muted hover:text-body'
              "
              @click="unit = 'in'"
            >
              inch
            </button>
          </div>
        </div>
        <div>
          <label class="block text-xs text-muted mb-1.5">
            Display precision
          </label>
          <USelect v-model="precisionModel" :items="precisionItems" />
          <p class="text-xs text-dim mt-1.5 leading-snug">
            {{
              unit === 'in'
                ? 'Dimensions in the BOM and PDF round to the nearest fraction (e.g. a 38 mm board reads as 1 1/2"). Pick the smallest fraction you cut to.'
                : 'Dimensions in the BOM and PDF round to this step (e.g. 0.1 mm shows 38.1 mm). Coarser steps make cut lists easier to read.'
            }}
            You can change this anytime in Settings.
          </p>
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            :disabled="!projectName.trim()"
            @click="createProject"
          >
            Create
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
