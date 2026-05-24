<script lang="ts" setup>
import { LABEL_PRESETS, type LabelPresetId } from '~/utils/pdf/labels';

const {
  downloadLabels,
  isExportingLabels,
  error,
  canExportLabels,
  labelsDisabledReason,
} = useExportPdf();

const isOpen = ref(false);
const preset = ref<LabelPresetId>('avery-5160');

const presetOptions = Object.values(LABEL_PRESETS).map((p) => ({
  label: p.label,
  value: p.id as LabelPresetId,
}));

async function onDownload() {
  await downloadLabels(preset.value);
  if (!error.value) isOpen.value = false;
}
</script>

<template>
  <div>
    <UButton
      :title="
        canExportLabels
          ? 'Export part labels (cut stickers) as a PDF'
          : labelsDisabledReason
      "
      icon="i-lucide-tags"
      color="neutral"
      size="sm"
      aria-label="Export labels"
      :disabled="!canExportLabels"
      data-testid="btn-export-labels"
      @click="isOpen = true"
    >
      <span class="hidden sm:inline">Labels</span>
    </UButton>

    <!-- FR-LBL-6: when disabled, surface the reason inline next to the control. -->
    <span
      v-if="!canExportLabels"
      class="ml-2 text-xs text-dim"
      data-testid="labels-disabled-reason"
    >
      {{ labelsDisabledReason }}
    </span>

    <UModal
      v-model:open="isOpen"
      title="Export labels"
      description="Export part labels (cut stickers) as PDF"
    >
      <template #content>
        <div
          class="p-6 flex flex-col gap-4 bg-elevated border border-default rounded-lg"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-white">Export labels</h2>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              class="rounded-full"
              @click="isOpen = false"
            />
          </div>
          <p class="text-sm text-muted">
            Generates a printable sheet of one sticker per part instance, each
            with the part name, number, finished size, material, and the board
            it is cut from. Print onto label stock and stick each sticker on its
            cut piece.
          </p>

          <UFormField label="Label stock" class="w-full">
            <USelect
              v-model="preset"
              :items="presetOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <div
            v-if="error"
            class="p-3 rounded border border-red-700 bg-red-950 text-red-300 text-sm"
          >
            {{ error }}
          </div>

          <div class="flex flex-row-reverse gap-2">
            <UButton
              :loading="isExportingLabels"
              :disabled="!canExportLabels"
              @click="onDownload"
            >
              Download
            </UButton>
            <UButton color="neutral" variant="ghost" @click="isOpen = false">
              Cancel
            </UButton>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
