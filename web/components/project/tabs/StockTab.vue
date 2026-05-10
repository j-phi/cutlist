<script lang="ts" setup>
import YAML from 'js-yaml';
import type { LinearStockMatrix, StockMatrix } from 'cutlist';
import { STOCK_PRESETS, presetToMmStock } from '~/utils/settings';
import { parseStock } from '~/utils/parseStock';

const { stock, distanceUnit, precision } = useProjectSettings();
const unit = computed<'mm' | 'in'>(() => distanceUnit.value ?? 'mm');

interface StockMatrixInputExpose {
  commit: () => boolean;
  addMaterial: () => void;
  scrollToBottom: () => void;
}

const stockInput = ref<StockMatrixInputExpose>();

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

function addPreset(preset: (typeof STOCK_PRESETS)[number]) {
  if (stock.value == null) return;
  const mmStock = presetToMmStock(preset);
  try {
    const current = parseStock(stock.value);
    current.push(mmStock);
    stock.value = YAML.dump(current, { indent: 2, flowLevel: 3 });
    stockInput.value?.scrollToBottom();
  } catch {
    stock.value = YAML.dump([mmStock], { indent: 2, flowLevel: 3 });
    stockInput.value?.scrollToBottom();
  }
}

/**
 * Parse the full stock list (both kinds). Returns an empty list if YAML
 * is invalid — child components own error display for their own slice.
 */
const allEntries = computed<StockMatrix[]>(() => {
  if (stock.value == null) return [];
  try {
    return parseStock(stock.value);
  } catch {
    return [];
  }
});

const linearEntries = computed<LinearStockMatrix[]>(() =>
  allEntries.value.filter((m): m is LinearStockMatrix => m.kind === 'linear'),
);

/**
 * Slice of the YAML containing only sheet rows. Linear rows are
 * preserved across StockMatrixInput's own serialise cycle by merging
 * back here on each write.
 */
const sheetYaml = computed<string>({
  get() {
    const sheets = allEntries.value.filter((m) => m.kind === 'sheet');
    return YAML.dump(sheets, { indent: 2, flowLevel: 3 });
  },
  set(next: string) {
    let sheetParsed: StockMatrix[];
    try {
      sheetParsed = parseStock(next);
    } catch {
      stock.value = next;
      return;
    }
    const merged = [...sheetParsed, ...linearEntries.value];
    stock.value = YAML.dump(merged, { indent: 2, flowLevel: 3 });
  },
});

/**
 * Replace the linear entry at the given index (relative to the linear
 * subset) and re-serialise the full list.
 */
function updateLinear(linearIdx: number, next: LinearStockMatrix) {
  const entries = allEntries.value.slice();
  let seen = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].kind !== 'linear') continue;
    if (seen === linearIdx) {
      entries[i] = next;
      break;
    }
    seen++;
  }
  stock.value = YAML.dump(entries, { indent: 2, flowLevel: 3 });
}

function removeLinear(linearIdx: number) {
  const entries = allEntries.value.slice();
  let seen = 0;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i].kind !== 'linear') continue;
    if (seen === linearIdx) {
      entries.splice(i, 1);
      break;
    }
    seen++;
  }
  stock.value = YAML.dump(entries, { indent: 2, flowLevel: 3 });
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
          @click="
            stockInput?.addMaterial();
            stockInput?.scrollToBottom();
          "
        >
          Add custom
        </UButton>
      </div>
    </div>

    <div
      v-if="stock != null"
      class="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto"
    >
      <StockMatrixInput ref="stockInput" v-model="sheetYaml" />

      <LinearStockInput
        v-for="(entry, idx) in linearEntries"
        :key="`linear-${idx}-${entry.material}`"
        :model-value="entry"
        :distance-unit="unit"
        :precision="precision"
        @update:model-value="(next) => updateLinear(idx, next)"
        @remove="removeLinear(idx)"
      />
    </div>
  </div>
</template>
