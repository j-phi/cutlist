<script lang="ts" setup>
import YAML from 'js-yaml';
import type { SheetStockMatrix, StockMatrix } from 'cutlist';
import { STOCK_PRESETS, presetToMmStock } from '~/utils/settings';
import { parseStock } from '~/utils/parseStock';
import { FALLBACK_PALETTE } from '~/utils/materialColors';

const { stock, distanceUnit, precision } = useProjectSettings();
const unit = computed<'mm' | 'in'>(() => distanceUnit.value ?? 'mm');

const sheetPresets = STOCK_PRESETS.filter((p) => p.stock.kind === 'sheet');
const timberPresets = STOCK_PRESETS.filter((p) => p.stock.kind === 'linear');

const presetItems = [
  [
    { label: 'Sheet', type: 'label' as const },
    ...sheetPresets.map((preset) => ({
      label: preset.label,
      onSelect() {
        addPreset(preset);
      },
    })),
  ],
  [
    { label: 'Timber', type: 'label' as const },
    ...timberPresets.map((preset) => ({
      label: preset.label,
      onSelect() {
        addPreset(preset);
      },
    })),
  ],
];

/**
 * Parse the full stock list. Returns an empty list if YAML is invalid;
 * the entries are the single source of truth for the flat editor.
 */
const entries = computed<StockMatrix[]>(() => {
  if (stock.value == null) return [];
  try {
    return parseStock(stock.value);
  } catch {
    return [];
  }
});

function writeEntries(next: StockMatrix[]) {
  stock.value = YAML.dump(next, { indent: 2, flowLevel: 3 });
}

function addPreset(preset: (typeof STOCK_PRESETS)[number]) {
  const next = entries.value.slice();
  next.push(presetToMmStock(preset));
  writeEntries(next);
}

function addCustomSheet() {
  const blank: SheetStockMatrix = {
    kind: 'sheet',
    material: 'New Material',
    sizes: [],
    color: FALLBACK_PALETTE[entries.value.length % FALLBACK_PALETTE.length],
  };
  writeEntries([...entries.value, blank]);
}

function updateEntry(idx: number, next: StockMatrix) {
  const list = entries.value.slice();
  list[idx] = next;
  writeEntries(list);
}

function removeEntry(idx: number) {
  writeEntries(entries.value.filter((_, i) => i !== idx));
}
</script>

<template>
  <div class="absolute inset-0 flex flex-col p-4 gap-4 overflow-y-auto">
    <div
      class="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
    >
      <p class="text-sm text-muted">
        Add the board stock you have available. Parts will be laid out onto
        these materials.
      </p>
      <div class="flex items-center gap-2 shrink-0">
        <UDropdownMenu :items="presetItems">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            trailing-icon="i-lucide-chevron-down"
            size="sm"
          >
            Add preset
          </UButton>
        </UDropdownMenu>
        <UButton
          color="neutral"
          variant="outline"
          icon="i-lucide-plus"
          size="sm"
          @click="addCustomSheet"
        >
          Add custom
        </UButton>
      </div>
    </div>

    <div
      v-if="stock != null"
      class="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto"
    >
      <template v-for="(entry, idx) in entries" :key="idx">
        <SheetStockInput
          v-if="entry.kind === 'sheet'"
          :model-value="entry"
          :distance-unit="unit"
          :precision="precision"
          @update:model-value="(next) => updateEntry(idx, next)"
          @remove="removeEntry(idx)"
        />
        <LinearStockInput
          v-else
          :model-value="entry"
          :distance-unit="unit"
          :precision="precision"
          @update:model-value="(next) => updateEntry(idx, next)"
          @remove="removeEntry(idx)"
        />
      </template>
    </div>
  </div>
</template>
