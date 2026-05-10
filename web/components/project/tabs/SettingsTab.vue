<script lang="ts" setup>
import type { Precision } from 'cutlist';

const { activeProject, activeId, renameProject, closeProject } = useProjects();
const { distanceUnit, precision } = useProjectSettings();

const projectName = ref('');
watch(
  () => activeProject.value?.name,
  (name) => {
    if (name) projectName.value = name;
  },
  { immediate: true },
);

function saveProjectName() {
  const name = projectName.value.trim();
  if (!name || !activeId.value || name === activeProject.value?.name) return;
  renameProject(activeId.value, name);
}

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

const precisionOptions = computed<PrecisionOption[]>(() =>
  distanceUnit.value === 'in' ? inchPrecisionOptions : mmPrecisionOptions,
);

function precisionKey(p: Precision | undefined): string {
  if (!p) return '';
  return p.kind === 'fraction' ? `f:${p.denominator}` : `d:${p.step}`;
}

const precisionModel = computed<string>({
  get: () => precisionKey(precision.value),
  set: (key: string) => {
    const match = precisionOptions.value.find(
      (o) => precisionKey(o.value) === key,
    );
    if (match) precision.value = match.value;
  },
});

const precisionItems = computed(() =>
  precisionOptions.value.map((o) => ({
    label: o.label,
    value: precisionKey(o.value),
  })),
);

const showDeleteConfirm = ref(false);
function deleteProject() {
  if (!activeId.value) return;
  closeProject(activeId.value);
  showDeleteConfirm.value = false;
}
</script>

<template>
  <div class="flex flex-col gap-8">
    <div class="flex flex-col gap-4">
      <h3 class="text-sm font-medium text-muted uppercase tracking-wide">
        Project
      </h3>
      <UFormField label="Project name">
        <UInput
          v-model="projectName"
          @blur="saveProjectName"
          @keydown.enter="($event.target as HTMLInputElement).blur()"
        />
      </UFormField>

      <UFormField label="Units">
        <USelect
          v-model="distanceUnit"
          :items="[
            { label: 'Millimeters (mm)', value: 'mm' },
            { label: 'Inches (in)', value: 'in' },
          ]"
        />
      </UFormField>

      <UFormField
        label="Display precision"
        help="How dimensions are rounded for display. Storage is unaffected — switch precision any time to see more or fewer digits."
      >
        <USelect v-model="precisionModel" :items="precisionItems" />
      </UFormField>
    </div>

    <div class="flex flex-col gap-4 border-t border-subtle pt-8">
      <h3 class="text-sm font-medium text-muted uppercase tracking-wide">
        Danger Zone
      </h3>
      <div
        class="flex items-center justify-between p-4 rounded-lg border border-red-900/50 bg-red-950/50"
      >
        <div>
          <p class="text-sm font-medium text-white">Delete project</p>
          <p class="text-sm text-muted">This cannot be undone.</p>
        </div>
        <UButton
          v-if="!showDeleteConfirm"
          color="error"
          variant="outline"
          @click="showDeleteConfirm = true"
        >
          Delete
        </UButton>
        <div v-else class="flex gap-2">
          <UButton
            color="neutral"
            variant="ghost"
            @click="showDeleteConfirm = false"
            >Cancel</UButton
          >
          <UButton color="error" @click="deleteProject">Confirm Delete</UButton>
        </div>
      </div>
    </div>
  </div>
</template>
