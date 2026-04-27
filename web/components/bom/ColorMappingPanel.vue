<script lang="ts" setup>
import { parseStock } from '~/utils/parseStock';

const {
  activeId,
  allColors,
  enabledModels,
  updateColorMap,
  toggleColorExcluded,
  batchRenameByColor,
  activeProject,
} = useProjects();
const { stock } = useProjectSettings();

const expanded = ref(true);

type ParsedStock =
  | { ok: true; materials: string[] }
  | { ok: false; error: Error };

const parsedStock = computed<ParsedStock>(() => {
  if (stock.value == null) return { ok: true, materials: [] };
  try {
    const materials = Array.from(
      new Set(parseStock(stock.value).map((s) => s.material)),
    ).sort();
    return { ok: true, materials };
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err : new Error(String(err)),
    };
  }
});

const materialOptions = computed<string[]>(() =>
  parsedStock.value.ok ? parsedStock.value.materials : [],
);

const hasParseError = computed(() => !parsedStock.value.ok);

function setMapping(colorKey: string, material: string) {
  if (activeId.value == null) return;
  updateColorMap(activeId.value, colorKey, material);
}

function isIncluded(colorKey: string): boolean {
  return !(activeProject.value?.excludedColors ?? []).includes(colorKey);
}

function toggleIncluded(colorKey: string) {
  if (activeId.value == null) return;
  toggleColorExcluded(activeId.value, colorKey);
}

function rgbStyle(rgb: [number, number, number]): string {
  const r = Math.round(rgb[0] * 255);
  const g = Math.round(rgb[1] * 255);
  const b = Math.round(rgb[2] * 255);
  return `background: rgb(${r}, ${g}, ${b});`;
}

// ─── Batch rename by color ──────────────────────────────────────────────────

const batchNames = ref(new Map<string, string>());

watch(activeId, () => batchNames.value.clear());

function getBatchName(colorKey: string): string {
  const draft = batchNames.value.get(colorKey);
  if (draft !== undefined) return draft;

  const names = new Set<string>();
  for (const model of enabledModels.value) {
    for (const part of model.parts) {
      if (part.colorKey === colorKey) names.add(part.name);
    }
  }
  return names.size === 1 ? [...names][0] : '';
}

function onBatchNameInput(colorKey: string, value: string) {
  batchNames.value = new Map(batchNames.value).set(colorKey, value);
}

function commitBatchName(colorKey: string) {
  if (activeId.value == null) return;
  const value = batchNames.value.get(colorKey);
  if (value === undefined) return;
  batchRenameByColor(activeId.value, colorKey, value || undefined);
  batchNames.value = new Map(batchNames.value);
  batchNames.value.delete(colorKey);
}
</script>

<template>
  <div
    v-if="activeProject && allColors.length > 0"
    class="space-y-2 pt-2 border-t border-subtle"
  >
    <button
      type="button"
      class="flex items-center gap-1.5 w-full text-left group"
      :aria-expanded="expanded"
      aria-label="Map colors to stock materials"
      @click="expanded = !expanded"
    >
      <UIcon
        :name="expanded ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'"
        class="w-4 h-4 text-dim group-hover:text-body transition-colors shrink-0"
      />
      <span class="text-sm font-medium text-white"
        >Map colors to stock materials</span
      >
    </button>
    <template v-if="expanded">
      <p v-if="hasParseError" class="text-xs text-amber-400">
        Stock has invalid YAML. Open Settings to fix it.
      </p>
      <p
        v-else-if="materialOptions.length === 0"
        class="text-xs text-amber-400"
      >
        No stock materials defined. Open Settings to add stock first.
      </p>
      <div
        v-for="color in allColors"
        :key="color.key"
        class="flex items-center gap-3"
      >
        <UCheckbox
          :model-value="isIncluded(color.key)"
          @update:model-value="toggleIncluded(color.key)"
        />
        <span
          class="w-6 h-6 shrink-0 rounded border border-default"
          :style="rgbStyle(color.rgb)"
          :title="color.key"
        />
        <span class="text-xs text-teal-400 w-16 shrink-0">
          {{ color.count }} part{{ color.count === 1 ? '' : 's' }}
        </span>
        <USelect
          class="flex-1"
          size="sm"
          :model-value="activeProject.colorMap[color.key] || '__none__'"
          :items="[
            { value: '__none__', label: '— Unmapped —' },
            ...materialOptions.map((m) => ({ value: m, label: m })),
          ]"
          @update:model-value="
            (v: string) => setMapping(color.key, v === '__none__' ? '' : v)
          "
        />
        <UInput
          :model-value="getBatchName(color.key)"
          placeholder="Name (optional)"
          size="sm"
          class="flex-1 max-w-40"
          @update:model-value="(v: string) => onBatchNameInput(color.key, v)"
          @keydown.enter="commitBatchName(color.key)"
          @blur="commitBatchName(color.key)"
        />
      </div>
    </template>
  </div>
</template>
