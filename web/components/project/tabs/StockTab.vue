<script lang="ts" setup>
import {
  aggregateSheetShoppingList,
  reduceStockMatrix,
  toCanonicalMm,
  type LinearStockMatrix,
  type SheetStockMatrix,
  type StockMatrix,
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
const { add, update, remove, consolidate } = useStockMutations();
const toast = useToast();

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

// Split the unified stock array into the two tiers the UI renders separately.
// Each entry keeps its real index in `stocks` so edits/removes/keys map back
// to the correct underlying record — the lists are filtered views, not copies.
interface IndexedEntry {
  entry: StockMatrix;
  idx: number;
}

const offcutEntries = computed<IndexedEntry[]>(() =>
  entries.value
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => entry.role === 'offcut'),
);

const generalEntries = computed<IndexedEntry[]>(() =>
  entries.value
    .map((entry, idx) => ({ entry, idx }))
    .filter(({ entry }) => entry.role !== 'offcut'),
);

// "To buy" projection: aggregate the current layout into per-(material,
// thickness) general-sheet purchase counts. Offcuts are owned, so we only
// surface the general (buyable) sizes the optimizer reached for. Reactive off
// the shared layouts query — recomputes whenever stock/parts change.
const { data: layoutData } = useBoardLayoutsQuery();
const formatDistance = useFormatDistance();

interface BuyLine {
  key: string;
  material: string;
  count: number;
  sizeLabel: string;
}

const buyLines = computed<BuyLine[]>(() => {
  const layouts = layoutData.value?.layouts;
  if (!layouts || layouts.length === 0) return [];
  const expanded = reduceStockMatrix(entries.value);
  const groups = aggregateSheetShoppingList(layouts, expanded);
  const lines: BuyLine[] = [];
  for (const group of groups) {
    for (const size of group.generalSizes) {
      if (size.count <= 0) continue;
      const w = formatDistance(size.widthUm) ?? String(size.widthUm);
      const l = formatDistance(size.lengthUm) ?? String(size.lengthUm);
      lines.push({
        key: `${group.material}-${group.thicknessUm}-${size.widthUm}x${size.lengthUm}`,
        material: group.material,
        count: size.count,
        sizeLabel: `${w} × ${l}`,
      });
    }
  }
  return lines;
});

// Distinct, non-empty material categories across all stock — offered as
// autocomplete suggestions on each card. Categories are intentionally shared
// across items, so this is a deduped pool, not a uniqueness constraint.
const materialOptions = computed<string[]>(() => {
  const set = new Set<string>();
  for (const e of entries.value) {
    const m = e.material.trim();
    if (m) set.add(m);
  }
  return [...set];
});

const duplicateNames = computed<Set<string>>(() => {
  // Names are advisory labels (Layout page) and must be unambiguous across ALL
  // entries — offcut and general alike — so the user can tell two leftover
  // pieces apart. Categories may repeat freely; names should not.
  const counts = new Map<string, number>();
  for (const e of entries.value) {
    const key = (e.name ?? '').trim().toLowerCase();
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const dup = new Set([...counts].filter(([, n]) => n > 1).map(([k]) => k));
  return new Set(
    entries.value
      .filter((e) => dup.has((e.name ?? '').trim().toLowerCase()))
      .map((e) => e.name ?? ''),
  );
});

function addCustomSheet() {
  const blank: SheetStockMatrix = {
    kind: 'sheet',
    name: 'New sheet',
    material: 'Uncategorized',
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
    name: 'New timber',
    material: 'Uncategorized',
    color: nextPaletteColor(),
    size: {
      crossSectionWidth: unit.value === 'in' ? seed(3.5) : 89,
      crossSectionThickness: unit.value === 'in' ? seed(1.5) : 38,
      lengths: [unit.value === 'in' ? seed(96) : 2400],
    },
  };
  add([blank]);
}

// Offer "Consolidate" only when two or more sheet panels share a (role,
// material) — i.e. there's an actual merge to perform.
const canConsolidate = computed<boolean>(() => {
  const seen = new Set<string>();
  for (const m of entries.value) {
    if (m.kind !== 'sheet') continue;
    const key = `${m.role ?? 'general'} ${m.material}`;
    if (seen.has(key)) return true;
    seen.add(key);
  }
  return false;
});

function onConsolidate() {
  const removed = consolidate();
  toast.add(
    removed > 0
      ? {
          title: 'Consolidated',
          description: `Merged ${removed} duplicate material panel${
            removed === 1 ? '' : 's'
          }.`,
        }
      : {
          title: 'Nothing to consolidate',
          description: 'No materials share a panel.',
        },
  );
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
          Drop a .csv offcut file
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
            v-if="canConsolidate"
            color="neutral"
            variant="outline"
            icon="i-lucide-combine"
            size="sm"
            data-testid="stock-consolidate"
            @click="onConsolidate"
          >
            Consolidate materials
          </UButton>
          <UButton
            color="neutral"
            variant="outline"
            icon="i-lucide-clipboard-paste"
            size="sm"
            data-testid="stock-import-csv"
            @click="showImport = true"
          >
            Import offcuts
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

      <div v-else class="flex-1 flex flex-col gap-6 min-h-0 overflow-y-auto">
        <section
          v-if="offcutEntries.length > 0"
          class="flex flex-col gap-3"
          data-testid="stock-offcuts-section"
        >
          <div class="flex flex-col gap-0.5">
            <h3 class="text-sm font-semibold text-hi">Offcuts</h3>
            <p class="text-xs text-muted">
              Leftover sheets you already own. The optimizer consumes these
              first, before any general stock. Set the quantity to how many of
              each you have.
            </p>
          </div>
          <StockCard
            v-for="{ entry, idx } in offcutEntries"
            :key="entryKeys[idx]"
            :model-value="entry"
            :distance-unit="unit"
            :precision="precision"
            :material-options="materialOptions"
            :duplicate-name="duplicateNames.has(entry.name ?? '')"
            show-quantity
            @update:model-value="(next) => update(idx, next)"
            @remove="remove(idx)"
          />
        </section>

        <section
          class="flex flex-col gap-3"
          data-testid="stock-general-section"
        >
          <h3
            v-if="offcutEntries.length > 0"
            class="text-sm font-semibold text-hi"
          >
            General stock
          </h3>

          <div
            v-if="buyLines.length > 0"
            class="rounded-lg border border-subtle bg-surface px-3 py-2.5 flex flex-col gap-1"
            data-testid="stock-buy-projection"
          >
            <p
              class="text-[11px] uppercase tracking-wider text-dim font-medium"
            >
              Projected purchase
            </p>
            <ul class="flex flex-col gap-0.5">
              <li
                v-for="line in buyLines"
                :key="line.key"
                class="text-sm text-body"
                data-testid="stock-buy-line"
              >
                Buy {{ line.count }}× {{ line.sizeLabel }} {{ line.material }}
              </li>
            </ul>
          </div>
          <StockCard
            v-for="{ entry, idx } in generalEntries"
            :key="entryKeys[idx]"
            :model-value="entry"
            :distance-unit="unit"
            :precision="precision"
            :material-options="materialOptions"
            :duplicate-name="duplicateNames.has(entry.name ?? '')"
            @update:model-value="(next) => update(idx, next)"
            @remove="remove(idx)"
          />
        </section>
      </div>
    </div>

    <UModal v-model:open="showImport" :ui="{ content: 'sm:max-w-2xl' }">
      <template #content>
        <div
          class="p-6 flex flex-col gap-4 bg-elevated border border-default rounded-lg"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-hi">Offcut Stock Import</h2>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              class="rounded-full"
              @click="showImport = false"
            />
          </div>
          <p class="text-xs text-muted">
            Import the leftover sheets you already own. The optimizer consumes
            these offcuts before any general stock.
          </p>
          <p class="text-xs text-dim">
            Columns: Width, Height, Thickness, plus optional Name, Material, and
            Quantity (how many of each — defaults to 1). Rows that share a
            Material are grouped onto one panel; rows with no Material land in a
            single Uncategorized panel. Paste from Google Sheets or a CSV.
          </p>
          <UTextarea
            v-model="pastedRows"
            :rows="4"
            class="w-full font-mono text-xs"
            placeholder="Name	Width	Height	Thickness	Material	Quantity"
            aria-label="Paste offcut rows"
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
              Imported {{ csvImport.result.value.imported }} offcut row{{
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
