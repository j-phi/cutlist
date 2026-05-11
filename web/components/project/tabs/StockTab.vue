<script lang="ts" setup>
import YAML from 'js-yaml';
import {
  convertUnits,
  type LinearStockMatrix,
  type SheetStockMatrix,
  type StockMatrix,
} from 'cutlist';
import { STOCK_PRESETS, presetToMmStock } from '~/utils/settings';
import { FALLBACK_PALETTE } from '~/utils/materialColors';

const { stock, parsedStock, distanceUnit, precision } = useProjectSettings();
const unit = computed<'mm' | 'in'>(() => distanceUnit.value ?? 'mm');

interface DropdownItem {
  label: string;
  type?: 'label';
  icon?: string;
  onSelect?: () => void;
}

function presetGroup(
  label: 'Sheet' | 'Timber',
  presets: (typeof STOCK_PRESETS)[number][],
): DropdownItem[] {
  return [
    { label, type: 'label' },
    ...presets.map((preset) => ({
      label: preset.label,
      onSelect: () => addPreset(preset),
    })),
  ];
}

/**
 * Presets filtered to the project's active unit. Showing inch presets in
 * an mm project (or vice versa) hands the user raw scaled values they
 * didn't expect (e.g. Pine 2×4 → 88.9 mm × 38.1 mm), so we narrow the menu.
 */
const presetItems = computed<DropdownItem[][]>(() => {
  const presetsInUnit = STOCK_PRESETS.filter((p) => p.unit === unit.value);
  const sheets = presetsInUnit.filter((p) => p.stock.kind === 'sheet');
  const timber = presetsInUnit.filter((p) => p.stock.kind === 'linear');
  const groups: DropdownItem[][] = [];
  if (sheets.length > 0) groups.push(presetGroup('Sheet', sheets));
  if (timber.length > 0) groups.push(presetGroup('Timber', timber));
  return groups;
});

const customItems: DropdownItem[][] = [
  [
    {
      label: 'Sheet',
      icon: 'i-lucide-layers',
      onSelect: () => addCustomSheet(),
    },
    {
      label: 'Timber',
      icon: 'i-lucide-square',
      onSelect: () => addCustomLinear(),
    },
  ],
];

const entries = parsedStock;

// Stable per-row ids. Index keys would let a deleted card's DOM (and its
// draft state) survive into its successor; ours move with the row.
const entryKeys = ref<string[]>([]);
let nextKeyId = 0;
const makeKey = () => `e${++nextKeyId}`;

watch(
  () => entries.value.length,
  (len) => {
    if (entryKeys.value.length !== len) {
      entryKeys.value = Array.from({ length: len }, makeKey);
    }
  },
  { immediate: true },
);

function writeEntries(next: StockMatrix[]) {
  stock.value = YAML.dump(next, { indent: 2, flowLevel: 3 });
}

function nextPaletteColor(): string {
  return FALLBACK_PALETTE[entries.value.length % FALLBACK_PALETTE.length];
}

function normalizeName(name: string): string {
  return name.trim().toLowerCase();
}

/**
 * Materials are name-keyed everywhere (colorMap, PDF shopping aggregation,
 * stock→part grouping). Two rows sharing a name silently confuse the packer
 * (first match wins), so we auto-suffix on add and flag collisions on edit.
 * Comparison is trim+case-insensitive: users read "Pine" and "pine " as one.
 */
function uniqueMaterialName(name: string, existing: StockMatrix[]): string {
  const trimmed = name.trim();
  const taken = new Set(existing.map((e) => normalizeName(e.material)));
  if (!taken.has(normalizeName(trimmed))) return trimmed;
  let n = 2;
  while (taken.has(normalizeName(`${trimmed} (${n})`))) n++;
  return `${trimmed} (${n})`;
}

const duplicateNames = computed<Set<string>>(() => {
  const counts = new Map<string, number>();
  for (const e of entries.value) {
    const key = normalizeName(e.material);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dupKeys = new Set(
    [...counts.entries()].filter(([, n]) => n > 1).map(([k]) => k),
  );
  return new Set(
    entries.value
      .filter((e) => dupKeys.has(normalizeName(e.material)))
      .map((e) => e.material),
  );
});

function appendEntry(next: StockMatrix) {
  entryKeys.value.push(makeKey());
  writeEntries([...entries.value, next]);
}

function addPreset(preset: (typeof STOCK_PRESETS)[number]) {
  const next = presetToMmStock(preset);
  next.material = uniqueMaterialName(next.material, entries.value);
  appendEntry(next);
}

function addCustomSheet() {
  const blank: SheetStockMatrix = {
    kind: 'sheet',
    material: uniqueMaterialName('New Material', entries.value),
    sizes: [],
    color: nextPaletteColor(),
  };
  appendEntry(blank);
}

function addCustomLinear() {
  // Seed with one length so the card isn't a blank slate: 96″ / 2400mm
  // matches the most common framing-lumber length in each unit.
  const seedLengthMm =
    unit.value === 'in' ? convertUnits(96, 'in', 'mm') : 2400;
  const blank: LinearStockMatrix = {
    kind: 'linear',
    material: uniqueMaterialName('New Timber', entries.value),
    color: nextPaletteColor(),
    size: {
      crossSectionWidth:
        unit.value === 'in' ? convertUnits(3.5, 'in', 'mm') : 89,
      crossSectionThickness:
        unit.value === 'in' ? convertUnits(1.5, 'in', 'mm') : 38,
      lengths: [seedLengthMm],
    },
  };
  appendEntry(blank);
}

function updateEntry(idx: number, next: StockMatrix) {
  const list = entries.value.slice();
  list[idx] = next;
  writeEntries(list);
}

function removeEntry(idx: number) {
  entryKeys.value.splice(idx, 1);
  writeEntries(entries.value.filter((_, i) => i !== idx));
}
</script>

<template>
  <div class="absolute inset-0 flex flex-col p-4 gap-4 overflow-y-auto">
    <div
      class="shrink-0 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
    >
      <p class="text-sm text-muted">
        Add the stock you have available. Parts will be laid out onto these
        materials.
      </p>
      <div class="flex items-center gap-2 shrink-0">
        <UDropdownMenu
          :items="presetItems"
          :disabled="presetItems.length === 0"
        >
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            trailing-icon="i-lucide-chevron-down"
            size="sm"
            :disabled="presetItems.length === 0"
            data-testid="stock-add-preset"
          >
            Add preset
          </UButton>
        </UDropdownMenu>
        <UDropdownMenu :items="customItems">
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-plus"
            trailing-icon="i-lucide-chevron-down"
            size="sm"
            data-testid="stock-add-custom"
          >
            Add custom
          </UButton>
        </UDropdownMenu>
      </div>
    </div>

    <div
      v-if="entries.length === 0"
      class="flex-1 flex items-center justify-center"
      data-testid="stock-empty-state"
    >
      <div
        class="max-w-sm text-center bg-base border border-default rounded-lg p-6 flex flex-col gap-4"
      >
        <UIcon name="i-lucide-warehouse" class="w-8 h-8 text-dim mx-auto" />
        <div>
          <h3 class="text-base text-hi font-medium mb-1">No stock yet</h3>
          <p class="text-sm text-muted">
            Add the boards or timber you have available. Parts you import or
            enter manually will be laid out onto this stock.
          </p>
        </div>
        <div class="flex items-center justify-center gap-2">
          <UButton
            size="sm"
            color="primary"
            icon="i-lucide-layers"
            data-testid="stock-empty-add-sheet"
            @click="addCustomSheet"
          >
            Add sheet
          </UButton>
          <UButton
            size="sm"
            color="neutral"
            variant="outline"
            icon="i-lucide-square"
            data-testid="stock-empty-add-timber"
            @click="addCustomLinear"
          >
            Add timber
          </UButton>
        </div>
      </div>
    </div>

    <div v-else class="flex-1 flex flex-col gap-3 min-h-0 overflow-y-auto">
      <StockCard
        v-for="(entry, idx) in entries"
        :key="entryKeys[idx]"
        :model-value="entry"
        :distance-unit="unit"
        :precision="precision"
        :duplicate-name="duplicateNames.has(entry.material)"
        @update:model-value="(next) => updateEntry(idx, next)"
        @remove="removeEntry(idx)"
      />
    </div>
  </div>
</template>
