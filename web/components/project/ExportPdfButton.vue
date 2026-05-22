<script lang="ts" setup>
import type { PdfScale } from '~/utils/exportPdf';

const { download, isExporting, error, canExport } = useExportPdf();
const { isComputing } = useBoardLayoutsQuery();

const isOpen = ref(false);
const scale = ref<PdfScale>('auto');
const showDimensions = ref(false);

const scaleOptions: { label: string; value: PdfScale }[] = [
  { label: 'Auto (fit each board to page)', value: 'auto' },
  { label: '1:1 (full size, will tile)', value: 1 },
  { label: '1:5', value: 5 },
  { label: '1:10', value: 10 },
  { label: '1:20', value: 20 },
  { label: '1:50', value: 50 },
];

async function onDownload() {
  await download(scale.value, showDimensions.value);
  if (!error.value) isOpen.value = false;
}
</script>

<template>
  <div>
    <UButton
      :title="
        isComputing
          ? 'Waiting for layout to finish computing…'
          : 'Export BOM (plus board layouts if available) as a PDF'
      "
      icon="i-lucide-file-down"
      color="neutral"
      size="sm"
      aria-label="Print"
      :disabled="!canExport || isComputing"
      @click="isOpen = true"
    >
      <span class="hidden sm:inline">Print</span>
    </UButton>

    <UModal
      v-model:open="isOpen"
      title="Export PDF"
      description="Export board layouts as PDF"
    >
      <template #content>
        <div
          class="p-6 flex flex-col gap-4 bg-elevated border border-default rounded-lg"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-white">Export PDF</h2>
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
            Generates a PDF with the BOM table and each board layout drawn at
            the chosen scale. "Auto" picks the largest integer scale that fits
            each board on a single page. Fixed scales tile boards that don't
            fit.
          </p>

          <UFormField label="Scale" class="w-full">
            <USelect
              v-model="scale"
              :items="scaleOptions"
              value-key="value"
              label-key="label"
              class="w-full"
            />
          </UFormField>

          <label class="flex items-center gap-2 cursor-pointer select-none">
            <UCheckbox v-model="showDimensions" />
            <span class="text-sm text-body">Show dimensions on pieces</span>
          </label>

          <div
            v-if="error"
            class="p-3 rounded border border-red-700 bg-red-950 text-red-300 text-sm"
          >
            {{ error }}
          </div>

          <div class="flex flex-row-reverse gap-2">
            <UButton
              :loading="isExporting"
              :disabled="!canExport || isComputing"
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
