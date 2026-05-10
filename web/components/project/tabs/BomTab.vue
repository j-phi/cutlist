<script lang="ts" setup>
import { mToMm } from 'cutlist';
import { parseStock } from '~/utils/parseStock';
import { computePartNumberOffsets } from '~/utils/partNumberOffsets';
import { STORAGE_KEYS } from '~/utils/localStorage';
import type { ManualPartInput } from '~/composables/useProjects';
import type { BomRow } from '~/composables/useBomRows';
import type { SortKey } from '~/composables/useBomFilter';

const {
  activeProject,
  activeId,
  enabledModels,
  manualModel,
  addModel,
  removeModel,
  toggleModel,
  addManualPart,
  updateManualPart,
  removeManualPart,
  updatePartNameOverride,
  updatePartGrainLock,
} = useProjects();

const { requestGrainLockChange } = useGrainLockConfirm();
const { distanceUnit, stock } = useProjectSettings();
const formatDistance = useFormatDistance();
const toast = useToast();
const modelViewer = useModelViewerStore();

// ── BOM rows & filter (extracted composables) ────────────────────────────────

const {
  allRows,
  isComputing,
  totalParts,
  materialNames,
  warningCount,
  showModelColumn,
  manualPartNumbers,
} = useBomRows();
const { search, sortKey, sortDir, toggleSort, filteredGroups } = useBomFilter(
  activeId,
  allRows,
);

// ── UI state ─────────────────────────────────────────────────────────────────

const showAddForm = ref(false);
const editingPartNumber = ref<number | null>(null);
const renamingPartNumber = ref<number | null>(null);
const partNameDraft = ref('');
const partNameInput = ref<HTMLInputElement | null>(null);
function onPartNameInputMounted(el: unknown) {
  const input = el as HTMLInputElement | null;
  if (input && input !== partNameInput.value) {
    partNameInput.value = input;
    nextTick(() => {
      input.focus();
      input.select();
    });
  }
}
const splitContainer = ref<HTMLDivElement | null>(null);

// ── File import (drag/drop, picker) ──────────────────────────────────────────

const {
  isDragging,
  fileInput,
  pickFile,
  bind: importBind,
} = useBomImport({
  activeId,
  onModelParsed: (model) => {
    if (activeId.value) addModel(activeId.value, model);
  },
});

// ── Materials list ───────────────────────────────────────────────────────────

const materials = computed(() => {
  if (!stock.value) return [];
  try {
    return parseStock(stock.value).map((s) => s.material);
  } catch {
    return [];
  }
});

// ── Manual part tracking ─────────────────────────────────────────────────────

const manualPartOffset = computed(() => {
  const models = enabledModels.value;
  const offsets = computePartNumberOffsets(models);
  for (let i = 0; i < models.length; i++) {
    if (models[i].source === 'manual') return offsets[i];
  }
  return 0;
});

const manualPartInfoMap = computed(() => {
  const model = manualModel.value;
  if (!model)
    return new Map<number, ManualPartInput & { partNumber: number }>();
  const groups = new Map<number, (typeof model.parts)[number][]>();
  for (const part of model.parts) {
    const list = groups.get(part.partNumber) ?? [];
    list.push(part);
    groups.set(part.partNumber, list);
  }
  const result = new Map<number, ManualPartInput & { partNumber: number }>();
  for (const [pn, parts] of groups) {
    result.set(pn, {
      partNumber: pn,
      name: parts[0].name,
      widthMm: mToMm(parts[0].size.width),
      lengthMm: mToMm(parts[0].size.length),
      thicknessMm: mToMm(parts[0].size.thickness),
      qty: parts.length,
      material: parts[0].colorKey,
      grainLock: parts[0].grainLock,
    });
  }
  return result;
});

function getManualEditInfo(adjustedPn: number) {
  return manualPartInfoMap.value.get(adjustedPn - manualPartOffset.value);
}

const importedModels = computed(
  () => activeProject.value?.models.filter((m) => m.source !== 'manual') ?? [],
);
const totalModelParts = computed(() =>
  importedModels.value.reduce((s, m) => s + m.parts.length, 0),
);
const hasModelPreview = computed(() =>
  enabledModels.value.some((m) => m.source !== 'manual'),
);
const isNarrow = useMediaQuery('(max-width: 767px)');
const splitDirection = computed<'horizontal' | 'vertical'>(() =>
  isNarrow.value ? 'vertical' : 'horizontal',
);
const {
  panelSize: previewPanelSize,
  isResizing: isResizingPreview,
  startResize: startPreviewResize,
} = usePersistedSplitPanel(splitContainer, hasModelPreview, {
  storageKey: () => {
    const id = activeId.value ?? '__none__';
    return isNarrow.value
      ? STORAGE_KEYS.ui.projectBomPreviewHeight(id)
      : STORAGE_KEYS.ui.projectBomPreviewWidth(id);
  },
  direction: splitDirection,
  horizontal: { minPanelPx: 280, minMainPx: 420 },
  vertical: { minPanelPx: 120, minMainPx: 200 },
  defaultPanelRatio: 1 / 2,
});
const highlightedPartNumber = computed(() => {
  const inv = modelViewer.partNumberOfGroupId.value;
  const hov = modelViewer.hoveredGroupIds.value;
  const sel = modelViewer.selectedGroupIds.value;
  for (const id of hov) {
    const pn = inv.get(id);
    if (pn != null) return pn;
  }
  for (const id of sel) {
    const pn = inv.get(id);
    if (pn != null) return pn;
  }
  return null;
});

// ── Compact dimension format ─────────────────────────────────────────────────

function formatDim(m: number | undefined | null): string {
  const s = formatDistance(m);
  if (!s) return '';
  if (distanceUnit.value === 'mm') return s.replace(/\s*mm$/, '');
  return s.replace(/\s*"$/, '');
}

const tableColspan = computed(() => (showModelColumn.value ? 8 : 7));

function isInteractiveTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(
    target.closest('button,input,textarea,select,a,[role="button"],label'),
  );
}

function onRowClick(row: BomRow, event: MouseEvent) {
  if (isInteractiveTarget(event.target)) return;
  modelViewer.selectPart(row.number);
}

function onRowEnter(row: BomRow) {
  modelViewer.hoverPart(row.number);
}

function onRowLeave(row: BomRow) {
  if (highlightedPartNumber.value === row.number) {
    modelViewer.hoverPart(null);
  }
}

function clearBomHover() {
  modelViewer.hoverPart(null);
}

// ── Manual part actions ──────────────────────────────────────────────────────

function startEditManualPart(adjustedPn: number) {
  editingPartNumber.value = adjustedPn;
  renamingPartNumber.value = null;
  showAddForm.value = false;
}

function startRenamePart(row: BomRow) {
  renamingPartNumber.value = row.number;
  partNameDraft.value = row.name;
  editingPartNumber.value = null;
  partNameInput.value = null;
}

function cancelRenamePart() {
  renamingPartNumber.value = null;
  partNameDraft.value = '';
}

async function saveRenamePart(row: BomRow) {
  if (renamingPartNumber.value !== row.number) return;
  if (!activeId.value) return;
  const nextName = partNameDraft.value.trim();
  if (!nextName) {
    toast.add({
      title: 'Name required',
      description: 'Part name cannot be empty.',
      color: 'error',
    });
    return;
  }
  if (nextName !== row.name) {
    await updatePartNameOverride(activeId.value, row.number, nextName);
  }
  cancelRenamePart();
}

async function handleAddPart(input: ManualPartInput) {
  if (!activeId.value) return;
  await addManualPart(activeId.value, input);
  showAddForm.value = false;
}

async function handleUpdatePart(adjustedPn: number, input: ManualPartInput) {
  if (!activeId.value) return;
  await updateManualPart(
    activeId.value,
    adjustedPn - manualPartOffset.value,
    input,
  );
  editingPartNumber.value = null;
}

async function handleRemovePart(adjustedPn: number) {
  if (!activeId.value) return;
  await removeManualPart(activeId.value, adjustedPn - manualPartOffset.value);
  if (editingPartNumber.value === adjustedPn) editingPartNumber.value = null;
  if (renamingPartNumber.value === adjustedPn) cancelRenamePart();
}

onUnmounted(() => {
  clearBomHover();
});
</script>

<template>
  <div class="absolute inset-0 overflow-hidden" v-bind="importBind.dropZone">
    <input
      ref="fileInput"
      type="file"
      accept=".gltf,.dae"
      multiple
      class="hidden"
      aria-label="Import model files"
      v-bind="importBind.fileInput"
    />

    <!-- Drag overlay -->
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
          Drop .gltf or .dae file to import
        </p>
      </div>
    </Transition>

    <div
      ref="splitContainer"
      class="absolute inset-0 flex flex-col-reverse md:flex-row min-h-0 min-w-0"
    >
      <div
        class="relative flex-1 min-h-0 min-w-0 overflow-y-auto overflow-x-hidden"
        @mouseleave="clearBomHover"
      >
        <template v-if="activeProject">
          <!-- ─── Collapsible Models Panel ──────────────────────────────────── -->
          <BomModelsList
            v-if="activeProject.models.length > 0"
            :imported-models="importedModels"
            :total-model-parts="totalModelParts"
            @pick-file="pickFile"
            @toggle-model="(id) => toggleModel(activeProject!.id, id)"
            @remove-model="(id) => removeModel(activeProject!.id, id)"
          />

          <!-- ─── Empty state ───────────────────────────────────────────────── -->
          <BomEmptyState
            v-if="
              activeProject.models.length === 0 && activeProject.id === activeId
            "
            @pick-file="pickFile"
            @add-manual-part="showAddForm = true"
          />

          <!-- ─── First-load computing spinner ────────────────────────────── -->
          <div
            v-else-if="isComputing && allRows.length === 0"
            class="m-auto flex items-center gap-2 text-muted"
          >
            <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin" />
            <span class="text-sm">Computing cut list&hellip;</span>
          </div>

          <!-- ─── Main BOM content ──────────────────────────────────────────── -->
          <template v-else>
            <template v-if="allRows.length > 0">
              <!-- Bill of Materials subheading -->
              <div
                class="flex items-center justify-between gap-2 px-5 pt-4 pb-1"
              >
                <h3 class="text-sm font-medium text-hi">Bill of Materials</h3>
                <ExportPdfButton />
              </div>

              <!-- Summary bar -->
              <div class="flex items-center gap-2 px-5 pb-3 text-xs text-muted">
                <span
                  >{{ totalParts }} part{{ totalParts === 1 ? '' : 's' }}</span
                >
                <span class="text-dim">&middot;</span>
                <span
                  >{{ materialNames.length }} material{{
                    materialNames.length === 1 ? '' : 's'
                  }}</span
                >
                <template v-if="warningCount > 0">
                  <span class="text-dim">&middot;</span>
                  <span class="text-amber-500"
                    >{{ warningCount }} warning{{
                      warningCount === 1 ? '' : 's'
                    }}</span
                  >
                </template>
                <template v-if="isComputing">
                  <span class="text-dim">&middot;</span>
                  <span class="flex items-center gap-1 text-muted">
                    <UIcon
                      name="i-lucide-loader-2"
                      class="w-3 h-3 animate-spin"
                    />
                    Updating&hellip;
                  </span>
                </template>
              </div>
            </template>

            <!-- Toolbar: search + add part -->
            <div class="flex items-center gap-2 px-5 pb-3">
              <UInput
                v-model="search"
                placeholder="Filter parts..."
                icon="i-lucide-search"
                size="sm"
                class="flex-1"
              />
              <UButton
                size="sm"
                variant="soft"
                color="neutral"
                icon="i-lucide-plus"
                label="Add Part"
                @click="
                  showAddForm = true;
                  editingPartNumber = null;
                "
              />
            </div>

            <!-- Parts table (horizontally scrollable on small screens) -->
            <div v-if="filteredGroups.length > 0" class="overflow-x-auto">
              <table
                class="w-full text-sm border-separate border-spacing-0"
                style="min-width: 480px"
                aria-label="Bill of materials"
              >
                <thead
                  class="sticky top-0 z-10 bg-base shadow-[inset_0_-1px_0_var(--color-mist-800)]"
                >
                  <tr>
                    <BomSortableHeader
                      column-key="number"
                      label="#"
                      :current-sort="sortKey"
                      :sort-dir="sortDir"
                      width-class="w-14 pl-5"
                      @toggle="toggleSort"
                    />
                    <BomSortableHeader
                      column-key="name"
                      label="Name"
                      :current-sort="sortKey"
                      :sort-dir="sortDir"
                      @toggle="toggleSort"
                    />
                    <th
                      v-if="showModelColumn"
                      class="px-4 py-2.5 text-left text-xs font-medium text-muted tracking-wide w-48"
                    >
                      Model
                    </th>
                    <BomSortableHeader
                      column-key="qty"
                      label="QTY"
                      align="right"
                      width-class="w-14"
                      :current-sort="sortKey"
                      :sort-dir="sortDir"
                      @toggle="toggleSort"
                    />
                    <BomSortableHeader
                      column-key="thickness"
                      label="T"
                      align="right"
                      width-class="w-18"
                      :unit-suffix="distanceUnit ?? ''"
                      :current-sort="sortKey"
                      :sort-dir="sortDir"
                      @toggle="toggleSort"
                    />
                    <BomSortableHeader
                      column-key="width"
                      label="W"
                      align="right"
                      width-class="w-22"
                      :unit-suffix="distanceUnit ?? ''"
                      :current-sort="sortKey"
                      :sort-dir="sortDir"
                      @toggle="toggleSort"
                    />
                    <BomSortableHeader
                      column-key="length"
                      label="L"
                      align="right"
                      width-class="w-22"
                      :unit-suffix="distanceUnit ?? ''"
                      :current-sort="sortKey"
                      :sort-dir="sortDir"
                      @toggle="toggleSort"
                    />
                    <th
                      class="px-4 py-2.5 text-left text-xs font-medium text-muted tracking-wide"
                    >
                      Grain
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <template
                    v-for="(group, gi) in filteredGroups"
                    :key="group.material"
                  >
                    <!-- Material group header -->
                    <tr>
                      <td
                        :colspan="tableColspan"
                        :class="['px-5 pb-1.5', gi === 0 ? 'pt-3' : 'pt-5']"
                      >
                        <div
                          class="flex items-center gap-2.5 pb-1.5 border-b border-subtle"
                        >
                          <span class="text-sm font-semibold text-body">{{
                            group.material
                          }}</span>
                          <span class="text-xs text-muted"
                            >{{ group.totalParts }} part{{
                              group.totalParts === 1 ? '' : 's'
                            }}</span
                          >
                        </div>
                      </td>
                    </tr>

                    <!-- Data rows -->
                    <template v-for="row in group.rows" :key="row.number">
                      <!-- Inline edit form for manual parts -->
                      <tr
                        v-if="row.isManual && editingPartNumber === row.number"
                      >
                        <td :colspan="tableColspan" class="px-4 py-1.5">
                          <ManualPartRow
                            :materials="materials"
                            :initial="getManualEditInfo(row.number)"
                            @save="
                              (d: ManualPartInput) =>
                                handleUpdatePart(row.number, d)
                            "
                            @cancel="editingPartNumber = null"
                          />
                        </td>
                      </tr>

                      <!-- Normal data row -->
                      <tr
                        v-else
                        class="group/row transition-colors text-[13px] cursor-pointer"
                        :class="[
                          row.leftoverCount > 0
                            ? 'bg-amber-500/[0.06] hover:bg-amber-500/10'
                            : 'hover:bg-surface',
                          highlightedPartNumber === row.number
                            ? 'bg-teal-500/12 ring-1 ring-inset ring-teal-400/40'
                            : '',
                        ]"
                        @mouseenter="onRowEnter(row)"
                        @mouseleave="onRowLeave(row)"
                        @click="onRowClick(row, $event)"
                      >
                        <td class="pl-5 pr-4 py-2.5 text-muted tabular-nums">
                          {{ row.number }}
                        </td>
                        <td class="px-4 py-2.5 text-body font-medium">
                          <div
                            v-if="renamingPartNumber === row.number"
                            class="inline-flex items-center gap-1"
                          >
                            <input
                              :ref="onPartNameInputMounted"
                              v-model="partNameDraft"
                              class="max-w-[14rem] text-[13px] font-medium bg-transparent text-teal-400 outline-none border-b border-teal-400/50"
                              @keydown.enter.prevent="saveRenamePart(row)"
                              @keydown.esc.prevent="cancelRenamePart"
                              @blur="saveRenamePart(row)"
                              @click.stop
                              @dblclick.stop
                            />
                            <button
                              type="button"
                              class="p-0.5 rounded text-teal-400 hover:text-teal-300 transition-colors"
                              title="Save"
                              @mousedown.prevent
                              @click="saveRenamePart(row)"
                            >
                              <UIcon
                                name="i-lucide-check"
                                class="w-3.5 h-3.5"
                              />
                            </button>
                            <button
                              type="button"
                              class="p-0.5 rounded text-muted hover:text-body transition-colors"
                              title="Cancel"
                              @mousedown.prevent
                              @click="cancelRenamePart"
                            >
                              <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
                            </button>
                          </div>
                          <div v-else class="inline-flex items-center gap-1.5">
                            <span
                              class="cursor-text"
                              :title="
                                row.isManual
                                  ? 'Double click to edit part'
                                  : 'Double click to rename part'
                              "
                              @dblclick="
                                row.isManual
                                  ? startEditManualPart(row.number)
                                  : startRenamePart(row)
                              "
                            >
                              {{ row.name }}
                            </span>
                            <UIcon
                              v-if="row.leftoverCount > 0"
                              name="i-lucide-triangle-alert"
                              class="w-3.5 h-3.5 shrink-0 text-amber-500"
                              :title="
                                row.leftoverCount === row.qty
                                  ? 'No board stock could be found for these dimensions'
                                  : `${row.leftoverCount} of ${row.qty} could not be placed on any board`
                              "
                            />
                            <button
                              v-if="!row.isManual"
                              type="button"
                              class="p-0.5 rounded-full text-dim hover:text-muted opacity-0 group-hover/row:opacity-100 transition-opacity"
                              title="Rename part"
                              @click="startRenamePart(row)"
                            >
                              <UIcon
                                name="i-lucide-square-pen"
                                class="w-3.5 h-3.5"
                              />
                            </button>
                            <template v-if="row.isManual">
                              <button
                                type="button"
                                class="p-0.5 rounded-full text-dim hover:text-muted opacity-0 group-hover/row:opacity-100 transition-opacity"
                                title="Edit part"
                                @click="startEditManualPart(row.number)"
                              >
                                <UIcon
                                  name="i-lucide-square-pen"
                                  class="w-3.5 h-3.5"
                                />
                              </button>
                              <button
                                type="button"
                                class="p-0.5 rounded-full text-dim hover:text-muted opacity-0 group-hover/row:opacity-100 transition-opacity"
                                title="Remove part"
                                @click="handleRemovePart(row.number)"
                              >
                                <UIcon name="i-lucide-x" class="w-3.5 h-3.5" />
                              </button>
                            </template>
                          </div>
                        </td>
                        <td
                          v-if="showModelColumn"
                          class="px-4 py-2.5 text-muted truncate max-w-[14rem]"
                          :title="row.modelName"
                        >
                          {{ row.modelName }}
                        </td>
                        <td
                          class="px-4 py-2.5 text-right text-body tabular-nums"
                        >
                          {{ row.qty }}
                        </td>
                        <td
                          class="px-4 py-2.5 text-right text-muted tabular-nums"
                        >
                          {{ formatDim(row.thicknessM) }}
                        </td>
                        <td
                          class="px-4 py-2.5 text-right text-body tabular-nums"
                        >
                          {{ formatDim(row.widthM) }}
                        </td>
                        <td
                          class="px-4 py-2.5 text-right text-body tabular-nums"
                        >
                          {{ formatDim(row.lengthM) }}
                        </td>
                        <td class="px-4 py-2.5">
                          <div v-if="activeId" class="flex items-center gap-1">
                            <!-- Unlocked state: plain icon button -->
                            <button
                              v-if="!row.grainLock"
                              type="button"
                              aria-label="Grain unlocked. Click to lock grain."
                              title="Free rotation — click to lock grain"
                              class="flex items-center px-1.5 py-0.5 rounded text-xs text-dim hover:text-muted transition-colors"
                              @click="
                                requestGrainLockChange(
                                  row.number,
                                  row.grainLock,
                                  {
                                    material: row.material,
                                    thicknessM: row.thicknessM,
                                    widthM: row.widthM,
                                    lengthM: row.lengthM,
                                  },
                                )
                              "
                            >
                              <UIcon
                                name="i-lucide-lock-open"
                                class="w-3.5 h-3.5"
                              />
                            </button>
                            <!-- Locked state: chip with cycle + clear -->
                            <div
                              v-else
                              class="inline-flex items-center rounded-full bg-teal-400/10 border border-teal-400/25"
                            >
                              <button
                                type="button"
                                :aria-label="
                                  row.grainLock === 'length'
                                    ? 'Grain locked to length. Click to lock width.'
                                    : 'Grain locked to width. Click to lock length.'
                                "
                                :title="
                                  row.grainLock === 'length'
                                    ? 'Length with grain (↕) — click to lock width'
                                    : 'Width with grain (↔) — click to lock length'
                                "
                                class="flex items-center gap-1 pl-2 pr-1 py-0.5 text-xs text-teal-400 hover:text-teal-300 transition-colors"
                                @click="
                                  requestGrainLockChange(
                                    row.number,
                                    row.grainLock,
                                    {
                                      material: row.material,
                                      thicknessM: row.thicknessM,
                                      widthM: row.widthM,
                                      lengthM: row.lengthM,
                                    },
                                  )
                                "
                              >
                                <UIcon
                                  name="i-lucide-lock"
                                  class="w-3.5 h-3.5 shrink-0"
                                />
                                <UIcon
                                  v-if="row.grainLock === 'length'"
                                  name="i-ri-arrow-up-down-line"
                                  class="w-3.5 h-3.5 shrink-0"
                                />
                                <UIcon
                                  v-else
                                  name="i-ri-arrow-left-right-line"
                                  class="w-3.5 h-3.5 shrink-0"
                                />
                              </button>
                              <button
                                type="button"
                                aria-label="Clear grain lock"
                                title="Clear grain lock"
                                class="flex items-center pr-1.5 pl-0.5 py-0.5 text-teal-400/60 hover:text-teal-300 transition-colors"
                                @click="
                                  updatePartGrainLock(
                                    activeId!,
                                    row.number,
                                    undefined,
                                  )
                                "
                              >
                                <UIcon name="i-lucide-x" class="w-3 h-3" />
                              </button>
                            </div>
                          </div>
                        </td>
                      </tr>
                    </template>
                  </template>
                </tbody>
              </table>
            </div>

            <!-- No search results -->
            <div
              v-else-if="allRows.length > 0 && search.trim()"
              class="flex flex-col items-center gap-2 py-8 text-sm text-muted"
            >
              <UIcon name="i-lucide-search-x" class="w-5 h-5 text-dim" />
              No parts matching "{{ search }}"
            </div>
          </template>
        </template>

        <p v-else class="text-center p-4 text-muted">
          Create a project to get started.
        </p>
      </div>

      <template v-if="activeProject && hasModelPreview">
        <div
          role="separator"
          :aria-orientation="isNarrow ? 'horizontal' : 'vertical'"
          aria-label="Resize preview panel"
          :class="[
            'relative shrink-0 select-none group touch-none',
            isNarrow ? 'h-3 cursor-row-resize' : 'w-3 cursor-col-resize',
          ]"
          @pointerdown="startPreviewResize"
        >
          <!-- Track line -->
          <div
            :class="[
              'absolute transition-colors bg-mist-700/55',
              isNarrow
                ? 'inset-x-0 top-1/2 h-px -translate-y-1/2'
                : 'inset-y-0 left-1/2 w-px -translate-x-1/2',
              isResizingPreview
                ? 'bg-teal-400/85'
                : 'group-hover:bg-teal-400/65',
            ]"
          />
          <!-- Grip pill -->
          <div
            :class="[
              'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full transition-colors bg-mist-700/60',
              isNarrow ? 'w-14 h-1' : 'h-14 w-1',
              isResizingPreview
                ? 'bg-teal-400/90'
                : 'group-hover:bg-teal-400/70',
            ]"
          />
        </div>

        <aside
          class="relative shrink-0 min-h-0 bg-mist-950 border-b border-subtle md:border-b-0 md:shadow-[-1px_0_0_0_rgba(57,68,71,0.35)]"
          :style="
            isNarrow
              ? { height: `${previewPanelSize}px`, width: '100%' }
              : { width: `${previewPanelSize}px` }
          "
          @mouseleave="clearBomHover"
        >
          <ModelTab read-only default-scene-preview />
        </aside>
      </template>
    </div>

    <!-- Add Part modal -->
    <UModal v-model:open="showAddForm">
      <template #content>
        <div
          class="p-6 flex flex-col gap-4 bg-elevated border border-default rounded-lg"
        >
          <div class="flex items-center justify-between">
            <h2 class="text-lg font-semibold text-hi">Add Part</h2>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              class="rounded-full"
              @click="showAddForm = false"
            />
          </div>
          <ManualPartRow
            :materials="materials"
            @save="handleAddPart"
            @cancel="showAddForm = false"
          />
        </div>
      </template>
    </UModal>
  </div>
</template>
