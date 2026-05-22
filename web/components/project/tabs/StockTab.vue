<script lang="ts" setup>
import {
  toCanonicalMm,
  type LinearStockMatrix,
  type SheetStockMatrix,
} from 'cutlist';
import { STOCK_PRESETS, presetToMmStock } from '~/utils/settings';
import { FALLBACK_PALETTE } from '~/utils/materialColors';
import { useStockMutations } from '~/composables/useStockMutations';
import { useStockCsvImport } from '~/composables/useStockCsvImport';
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

// ── Bulk stock import (paste / .csv drop → sheet stock) ───────────────────────

const csvImport = useStockCsvImport({
  activeId,
  distanceUnit: unit,
  stocks,
  addStock: add,
});

const showImport = ref(false);
const pastedRows = ref('');

async function onImportPaste() {
  const text = pastedRows.value;
  if (!text.trim()) return;
  await csvImport.importText(text);
  // Clear only when at least one row imported, so the user can fix and retry.
  if (csvImport.result.value && csvImport.result.value.imported > 0) {
    pastedRows.value = '';
  }
}

// Reset the paste summary each time the import modal opens.
watch(showImport, (open) => {
  if (open) {
    csvImport.clearResult();
    pastedRows.value = '';
  }
});

// ── Drag-and-drop .csv import ─────────────────────────────────────────────────

const isDragging = ref(false);

function hasCsv(e: DragEvent): boolean {
  const items = e.dataTransfer?.items;
  if (!items) return false;
  return [...items].some((i) => i.kind === 'file');
}

function onDragover(e: DragEvent) {
  if (!hasCsv(e)) return;
  e.preventDefault();
  isDragging.value = true;
}

function onDragleave(e: DragEvent) {
  // Ignore leaves that bubble from children still inside the drop zone.
  if (e.currentTarget && e.relatedTarget instanceof Node) {
    if ((e.currentTarget as Node).contains(e.relatedTarget)) return;
  }
  isDragging.value = false;
}

async function onDrop(e: DragEvent) {
  e.preventDefault();
  isDragging.value = false;
  const files = [...(e.dataTransfer?.files ?? [])].filter((f) =>
    f.name.toLowerCase().endsWith('.csv'),
  );
  if (files.length) await csvImport.importFiles(files);
}

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
  <div
    class="absolute inset-0 grid overflow-hidden grid-cols-[auto_1fr]"
    @dragover="onDragover"
    @dragleave="onDragleave"
    @drop="onDrop"
  >
    <Transition
      enter-active-class="transition-opacity duration-150"
      enter-from-class="opacity-0"
      enter-to-class="opacity-100"
      leave-active-class="transition-opacity duration-150"
      leave-from-class="opacity-100"
      leave-to-class="opacity-0"
    >
      <div
        v-if="isDragging"
        class="absolute inset-0 z-50 flex flex-col items-center justify-center gap-3 bg-overlay border-2 border-dashed border-teal-400/50 rounded-lg m-1 pointer-events-none"
      >
        <div
          class="w-14 h-14 rounded-2xl bg-teal-400/10 flex items-center justify-center"
        >
          <UIcon name="i-lucide-download" class="w-7 h-7 text-teal-400" />
        </div>
        <p class="text-sm font-semibold text-teal-400">
          Drop a .csv stock file
        </p>
      </div>
    </Transition>

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
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-clipboard-paste"
            size="sm"
            data-testid="stock-import-csv"
            @click="showImport = true"
          >
            Import CSV
          </UButton>
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

    <UModal v-model:open="showImport" :ui="{ content: 'sm:max-w-2xl' }">
      <template #content>
        <div
          class="p-6 flex flex-col gap-4 bg-elevated border border-default rounded-lg"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-hi">Import stock</h2>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              class="rounded-full"
              @click="showImport = false"
            />
          </div>
          <p class="text-xs text-dim">
            Columns: Name, Width, Height, Thickness — paste from Google Sheets
            or a CSV.
          </p>
          <UTextarea
            v-model="pastedRows"
            :rows="4"
            class="w-full font-mono text-xs"
            placeholder="Name	Width	Height	Thickness"
            aria-label="Paste stock rows"
          />
          <div class="flex justify-end">
            <UButton
              size="sm"
              :disabled="!pastedRows.trim()"
              icon="i-lucide-clipboard-paste"
              data-testid="stock-import-rows"
              @click="onImportPaste"
            >
              Import rows
            </UButton>
          </div>

          <div
            v-if="csvImport.result.value"
            class="bg-surface rounded-md p-3 flex flex-col gap-1"
            data-testid="stock-import-summary"
          >
            <p class="text-sm text-body">
              Imported {{ csvImport.result.value.imported }} stock row{{
                csvImport.result.value.imported === 1 ? '' : 's'
              }}.
            </p>
            <div
              v-if="csvImport.result.value.errors.length"
              class="flex flex-col gap-0.5"
            >
              <p class="text-xs text-muted">
                Skipped {{ csvImport.result.value.errors.length }} row{{
                  csvImport.result.value.errors.length === 1 ? '' : 's'
                }}:
              </p>
              <ul class="flex flex-col gap-0.5">
                <li
                  v-for="(err, i) in csvImport.result.value.errors"
                  :key="i"
                  class="text-xs text-dim"
                >
                  Row {{ err.row }}: {{ err.message }}
                </li>
              </ul>
            </div>
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>
