<script lang="ts" setup>
import {
  toCanonicalMm,
  type LinearStockMatrix,
  type SheetStockMatrix,
} from 'cutlist';
import { STOCK_PRESETS, presetToMmStock } from '~/utils/settings';
import { FALLBACK_PALETTE } from '~/utils/materialColors';
import { useStockMutations } from '~/composables/useStockMutations';
import ViewerSidePanel from '~/components/viewer/ViewerSidePanel.vue';
import {
  STORAGE_KEYS,
  getLocalStorageJson,
  setLocalStorageJson,
} from '~/utils/localStorage';

const { stocks, distanceUnit, precision } = useProjectSettings();
const { activeId } = useProjects();
const unit = computed<'mm' | 'in'>(() => distanceUnit.value ?? 'mm');
const { add, update, remove } = useStockMutations();

function loadHelpCollapsed(projectId: string): boolean {
  const stored = getLocalStorageJson<boolean>(
    STORAGE_KEYS.ui.projectStockHelpCollapsed(projectId),
  );
  return typeof stored === 'boolean' ? stored : false;
}

const helpCollapsed = ref(
  activeId.value ? loadHelpCollapsed(activeId.value) : false,
);

watch(activeId, (id) => {
  if (id) helpCollapsed.value = loadHelpCollapsed(id);
});

watch(helpCollapsed, (value) => {
  if (activeId.value) {
    setLocalStorageJson(
      STORAGE_KEYS.ui.projectStockHelpCollapsed(activeId.value),
      value,
    );
  }
});

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
      onSelect: () => add([presetToMmStock(preset)]),
    })),
  ];
}

// Narrow to the project's unit — mixing presets gives users surprise scaled
// values (e.g. Pine 2×4 → 88.9 mm × 38.1 mm).
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
    { label: 'Sheet', icon: 'i-lucide-layers', onSelect: addCustomSheet },
    { label: 'Timber', icon: 'i-lucide-square', onSelect: addCustomLinear },
  ],
];

const entries = stocks;

// Stable per-row ids. Index keys would let a deleted card's DOM (and its
// draft state) survive into its successor; ours move with the row.
const entryKeys = ref<string[]>([]);
let nextKeyId = 0;
const makeKey = () => `e${++nextKeyId}`;

watch(
  () => entries.value.length,
  (len) => {
    while (entryKeys.value.length < len) entryKeys.value.push(makeKey());
    if (entryKeys.value.length > len) entryKeys.value.length = len;
  },
  { immediate: true },
);

function nextPaletteColor(): string {
  return FALLBACK_PALETTE[entries.value.length % FALLBACK_PALETTE.length];
}

const duplicateNames = computed<Set<string>>(() => {
  const counts = new Map<string, number>();
  for (const e of entries.value) {
    const key = e.material.trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dup = new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
  return new Set(
    entries.value
      .filter((e) => dup.has(e.material.trim().toLowerCase()))
      .map((e) => e.material),
  );
});

function addCustomSheet() {
  const blank: SheetStockMatrix = {
    kind: 'sheet',
    material: 'New Material',
    sizes: [],
    color: nextPaletteColor(),
  };
  add([blank]);
}

function addCustomLinear() {
  // Seed with 96″ / 2400 mm — the most common framing length in each unit.
  const seed = (n: number) => toCanonicalMm(n, unit.value);
  const blank: LinearStockMatrix = {
    kind: 'linear',
    material: 'New Timber',
    color: nextPaletteColor(),
    size: {
      crossSectionWidth: unit.value === 'in' ? seed(3.5) : 89,
      crossSectionThickness: unit.value === 'in' ? seed(1.5) : 38,
      lengths: [unit.value === 'in' ? seed(96) : 2400],
    },
  };
  add([blank]);
}
</script>

<template>
  <div class="absolute inset-0 grid overflow-hidden grid-cols-[auto_1fr]">
    <ViewerSidePanel
      title="How stock works"
      :collapsed="helpCollapsed"
      @update:collapsed="(v) => (helpCollapsed = v)"
    >
      <StockHelpContent />
    </ViewerSidePanel>

    <div
      class="col-start-2 min-w-0 min-h-0 flex flex-col p-4 gap-4 overflow-hidden"
    >
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
          @update:model-value="(next) => update(idx, next)"
          @remove="remove(idx)"
        />
      </div>
    </div>
  </div>
</template>
