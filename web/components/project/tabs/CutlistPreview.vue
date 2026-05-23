<script lang="ts" setup>
import type {
  SheetBoardLayout,
  LinearBoardLayout,
  SheetBoardLayoutPlacement,
} from 'cutlist';
import { reduceStockMatrix, isSheetStock } from 'cutlist';
import { projectPath } from '~/utils/projectTabs';
import {
  STORAGE_KEYS,
  getLocalStorageJson,
  setLocalStorageJson,
} from '~/utils/localStorage';
import { computeAlignmentSnap } from '~/composables/useManualLayout';

const { data, isComputing, error, partCountWarning } = useBoardLayoutsQuery();
const { activeId } = useProjects();
const { stocks, bladeWidth, margin } = useProjectSettings();
const {
  manualMode,
  isDragging,
  snapping,
  movePart,
  applyOverrides,
  resetOverrides,
} = useManualLayout();

const container = ref<HTMLDivElement>();
const gridEl = ref<HTMLDivElement>();
const { scale, resetZoom, zoomIn, zoomOut } = usePanZoom(container, gridEl);

const formatDistance = useFormatDistance();

const stockTabPath = computed(() => projectPath(activeId.value, 'boards'));

function stockKey(stock: {
  material: string;
  thicknessUm: number;
  widthUm: number;
  lengthUm: number;
}) {
  return `${stock.material}__${stock.thicknessUm}__${stock.widthUm}__${stock.lengthUm}`;
}

const sheetLayouts = computed<SheetBoardLayout[]>(
  () => data.value?.layouts ?? [],
);
const linearLayouts = computed<LinearBoardLayout[]>(
  () => data.value?.linearLayouts ?? [],
);

// Clear overrides when the engine produces a new result.
watch(data, () => resetOverrides());

const OFFCUTS_KEY = '__offcuts__';

const stockOptions = computed(() => {
  const seen = new Set<string>();
  const options: {
    label: string;
    sublabel: string;
    value: string;
    role: string;
  }[] = [];
  let offcutCount = 0;

  for (const layout of sheetLayouts.value) {
    if (layout.stock.role === 'offcut') {
      offcutCount++;
      continue;
    }
    const key = stockKey(layout.stock);
    if (!seen.has(key)) {
      seen.add(key);
      const w = formatDistance(layout.stock.widthUm);
      const l = formatDistance(layout.stock.lengthUm);
      options.push({
        label: layout.stock.name,
        sublabel: `${w} × ${l}`,
        value: key,
        role: 'general',
      });
    }
  }

  if (offcutCount > 0) {
    options.push({
      label: 'Offcuts',
      sublabel: `${offcutCount} board${offcutCount !== 1 ? 's' : ''}`,
      value: OFFCUTS_KEY,
      role: 'offcut',
    });
  }

  return options;
});

const appliedKeys = ref(new Set<string>());
const pendingKeys = ref(new Set<string>());
const stockDropdownOpen = ref(false);

watch(stockOptions, (opts) => {
  const validKeys = new Set(opts.map((o) => o.value));
  if (appliedKeys.value.size > 0) {
    const next = new Set(
      [...appliedKeys.value].filter((k) => validKeys.has(k)),
    );
    if (next.size !== appliedKeys.value.size) appliedKeys.value = next;
  }
  if (pendingKeys.value.size > 0) {
    const next = new Set(
      [...pendingKeys.value].filter((k) => validKeys.has(k)),
    );
    if (next.size !== pendingKeys.value.size) pendingKeys.value = next;
  }
});

watch(stockDropdownOpen, (open) => {
  if (open) pendingKeys.value = new Set(appliedKeys.value);
});

const selectedLabel = computed(() => {
  if (appliedKeys.value.size === 0) return 'All';
  if (appliedKeys.value.size === 1) {
    const key = [...appliedKeys.value][0];
    return stockOptions.value.find((o) => o.value === key)?.label ?? 'Stock';
  }
  return `${appliedKeys.value.size} selected`;
});

function togglePending(key: string) {
  const next = new Set(pendingKeys.value);
  if (next.has(key)) next.delete(key);
  else next.add(key);
  pendingKeys.value = next;
}

function applyFilter() {
  appliedKeys.value = new Set(pendingKeys.value);
  stockDropdownOpen.value = false;
}

const filteredSheetLayouts = computed<SheetBoardLayout[]>(() => {
  if (appliedKeys.value.size === 0) return sheetLayouts.value;
  return sheetLayouts.value.filter((l) =>
    l.stock.role === 'offcut'
      ? appliedKeys.value.has(OFFCUTS_KEY)
      : appliedKeys.value.has(stockKey(l.stock)),
  );
});

// Apply manual overrides on top of engine layouts.
const displaySheetLayouts = computed<SheetBoardLayout[]>(() =>
  manualMode.value
    ? applyOverrides(filteredSheetLayouts.value)
    : filteredSheetLayouts.value,
);

// Drag-ghost state.
interface DragGhost {
  placement: SheetBoardLayoutPlacement;
  sourceBoardIndex: number;
  x: number;
  y: number;
}
const dragGhost = ref<DragGhost | null>(null);
const ghostEl = ref<HTMLDivElement | null>(null);

// Drop-preview state — which board the cursor is over during a drag.
const hoverBoardIndex = ref<number | null>(null);
const hoverBoardRect = ref<DOMRect | null>(null);

const ghostColor = computed(() => {
  if (!dragGhost.value) return '#67787c';
  const layout = filteredSheetLayouts.value[dragGhost.value.sourceBoardIndex];
  return getMaterialColor(layout?.stock.color).part;
});

const PX_PER_UM = 1 / 2000;
const ghostSize = computed(() => {
  if (!dragGhost.value) return { w: 40, h: 40 };
  const { placement } = dragGhost.value;
  const zoom = scale.value ?? 1;
  const raw = {
    w: (placement.rightUm - placement.leftUm) * PX_PER_UM * zoom,
    h: (placement.topUm - placement.bottomUm) * PX_PER_UM * zoom,
  };
  // Cap so the ghost stays usable at extreme zoom levels.
  const maxDim = Math.max(raw.w, raw.h);
  const factor = maxDim > 160 ? 160 / maxDim : maxDim < 24 ? 24 / maxDim : 1;
  return { w: raw.w * factor, h: raw.h * factor };
});

interface DragPreview {
  boardIndex: number;
  leftUm: number;
  bottomUm: number;
  widthUm: number;
  heightUm: number;
}

const dragPreviewData = computed<DragPreview | null>(() => {
  if (
    !dragGhost.value ||
    hoverBoardIndex.value === null ||
    !hoverBoardRect.value
  )
    return null;
  const target = displaySheetLayouts.value[hoverBoardIndex.value];
  if (!target) return null;

  const rect = hoverBoardRect.value;
  const u = (dragGhost.value.x - rect.left) / rect.width;
  const v = (dragGhost.value.y - rect.top) / rect.height;
  const xUm = u * target.stock.widthUm;
  const yUm = (1 - v) * target.stock.lengthUm;

  const { placement } = dragGhost.value;
  const w = placement.rightUm - placement.leftUm;
  const h = placement.topUm - placement.bottomUm;
  const rawLeft = xUm - w / 2;
  const rawBottom = yUm - h / 2;

  let leftUm: number;
  let bottomUm: number;

  if (snapping.value) {
    const snapped = computeAlignmentSnap(
      rawLeft,
      rawBottom,
      w,
      h,
      target,
      bladeWidth.value ?? 0,
      placement.partNumber,
      placement.instanceNumber,
    );
    leftUm = snapped.leftUm;
    bottomUm = snapped.bottomUm;
  } else {
    leftUm = rawLeft;
    bottomUm = rawBottom;
  }

  const maxLeft = Math.max(0, target.stock.widthUm - w);
  const maxBottom = Math.max(0, target.stock.lengthUm - h);

  return {
    boardIndex: hoverBoardIndex.value,
    leftUm: Math.max(0, Math.min(leftUm, maxLeft)),
    bottomUm: Math.max(0, Math.min(bottomUm, maxBottom)),
    widthUm: w,
    heightUm: h,
  };
});

provide('dragPreview', dragPreviewData);

function startPartDrag(
  placement: SheetBoardLayoutPlacement,
  sourceBoardIndex: number,
  event: PointerEvent,
) {
  dragGhost.value = {
    placement,
    sourceBoardIndex,
    x: event.clientX,
    y: event.clientY,
  };
  isDragging.value = true;

  const onMove = (e: PointerEvent) => {
    if (dragGhost.value) {
      dragGhost.value = { ...dragGhost.value, x: e.clientX, y: e.clientY };
    }

    // Find which board element the cursor is over using elementsFromPoint.
    // Hide the ghost element first so it doesn't intercept the hit test.
    const ghostDivEl = ghostEl.value;
    if (ghostDivEl) ghostDivEl.style.display = 'none';
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    if (ghostDivEl) ghostDivEl.style.display = '';

    const boardEl = els.find(
      (el) => (el as HTMLElement).dataset?.boardIndex != null,
    ) as HTMLElement | undefined;

    if (boardEl) {
      hoverBoardIndex.value = parseInt(boardEl.dataset.boardIndex!);
      hoverBoardRect.value = boardEl.getBoundingClientRect();
    } else {
      hoverBoardIndex.value = null;
      hoverBoardRect.value = null;
    }
  };

  function cleanup() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('keydown', onKeyDown);
    isDragging.value = false;
    hoverBoardIndex.value = null;
    hoverBoardRect.value = null;
    dragGhost.value = null;
  }

  const onUp = (e: PointerEvent) => {
    cleanup();

    // Temporarily hide the ghost so elementsFromPoint sees the board underneath.
    const ghost = ghostEl.value;
    let els: Element[] = [];
    try {
      if (ghost) ghost.style.display = 'none';
      els = document.elementsFromPoint(e.clientX, e.clientY);
    } finally {
      if (ghost) ghost.style.display = '';
    }

    const boardEl = els.find(
      (el) => (el as HTMLElement).dataset?.boardIndex != null,
    ) as HTMLElement | undefined;

    if (boardEl) {
      const targetBoardIndex = parseInt(boardEl.dataset.boardIndex!);
      const rect = boardEl.getBoundingClientRect();
      const u = (e.clientX - rect.left) / rect.width;
      const v = (e.clientY - rect.top) / rect.height;
      const target = displaySheetLayouts.value[targetBoardIndex];
      if (target) {
        const xUm = u * target.stock.widthUm;
        const yUm = (1 - v) * target.stock.lengthUm;
        const w = placement.rightUm - placement.leftUm;
        const h = placement.topUm - placement.bottomUm;
        const rawLeft = xUm - w / 2;
        const rawBottom = yUm - h / 2;

        let finalLeft = rawLeft;
        let finalBottom = rawBottom;

        if (snapping.value) {
          const snapped = computeAlignmentSnap(
            rawLeft,
            rawBottom,
            w,
            h,
            target,
            bladeWidth.value ?? 0,
            placement.partNumber,
            placement.instanceNumber,
          );
          finalLeft = snapped.leftUm;
          finalBottom = snapped.bottomUm;
        }

        movePart(
          placement.partNumber,
          placement.instanceNumber,
          targetBoardIndex,
          finalLeft,
          finalBottom,
        );
      }
    }
  };

  const onKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      document.removeEventListener('pointerup', onUp);
      cleanup();
    }
  };

  document.addEventListener('pointermove', onMove);
  document.addEventListener('pointerup', onUp, { once: true });
  document.addEventListener('keydown', onKeyDown);
}

provide('startPartDrag', startPartDrag);

const totalVisibleLayouts = computed(
  () => filteredSheetLayouts.value.length + linearLayouts.value.length,
);

const unplacedCount = computed(() => data.value?.leftovers.length ?? 0);

const showLeftoverBanner = computed(
  () => unplacedCount.value > 0 && totalVisibleLayouts.value > 0,
);

// Stock materials that are configured but produce no layouts — show them as
// "unneeded" so the user can audit their stock list.
const unusedStockNames = computed<string[]>(() => {
  if (!data.value) return [];
  const used = new Set([
    ...sheetLayouts.value.map((l) => l.stock.material),
    ...linearLayouts.value.map((l) => l.stock.material),
  ]);
  return stocks.value
    .map((s) => s.material)
    .filter((m, i, arr) => !used.has(m) && arr.indexOf(m) === i);
});

const emptyState = computed(() => {
  if (stocks.value.length === 0) {
    return {
      icon: 'i-lucide-warehouse',
      title: 'No stock configured',
      body: 'Add stock materials so we can generate cut layouts for your parts.',
      cta: true,
    };
  }
  if (unplacedCount.value > 0) {
    return {
      icon: 'i-lucide-layers',
      title: 'No matching stock',
      body: "We couldn't find any boards in your stock that match the thicknesses your parts need.",
      cta: true,
    };
  }
  return {
    icon: 'i-lucide-layers',
    title: 'No board layouts yet',
    body: 'Add parts in the BOM tab to generate cut layouts.',
    cta: false,
  };
});

function loadHelpCollapsed(projectId: string): boolean {
  const stored = getLocalStorageJson<boolean>(
    STORAGE_KEYS.ui.projectLayoutHelpCollapsed(projectId),
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
      STORAGE_KEYS.ui.projectLayoutHelpCollapsed(activeId.value),
      value,
    );
  }
});

function loadShoppingListHidden(projectId: string): boolean {
  const stored = getLocalStorageJson<boolean>(
    STORAGE_KEYS.ui.projectLayoutShoppingListHidden(projectId),
  );
  return typeof stored === 'boolean' ? stored : false;
}

const shoppingListHidden = ref(
  activeId.value ? loadShoppingListHidden(activeId.value) : false,
);

watch(activeId, (id) => {
  if (id) shoppingListHidden.value = loadShoppingListHidden(id);
});

watch(shoppingListHidden, (value) => {
  if (activeId.value) {
    setLocalStorageJson(
      STORAGE_KEYS.ui.projectLayoutShoppingListHidden(activeId.value),
      value,
    );
  }
});

function loadShowUnused(projectId: string): boolean {
  const stored = getLocalStorageJson<boolean>(
    STORAGE_KEYS.ui.projectLayoutShowUnused(projectId),
  );
  return typeof stored === 'boolean' ? stored : false;
}

const showUnused = ref(activeId.value ? loadShowUnused(activeId.value) : false);

watch(activeId, (id) => {
  if (id) showUnused.value = loadShowUnused(id);
});

watch(showUnused, (value) => {
  if (activeId.value) {
    setLocalStorageJson(
      STORAGE_KEYS.ui.projectLayoutShowUnused(activeId.value),
      value,
    );
  }
});

const unusedOffcutLayouts = computed<SheetBoardLayout[]>(() => {
  if (!showUnused.value) return [];
  const allStock = reduceStockMatrix(stocks.value).filter(isSheetStock);
  const offcutStock = allStock.filter((s) => s.role === 'offcut');
  const result: SheetBoardLayout[] = [];
  for (const stock of offcutStock) {
    const usedCount = sheetLayouts.value.filter(
      (l) =>
        l.stock.role === 'offcut' &&
        l.stock.material === stock.material &&
        l.stock.widthUm === stock.width &&
        l.stock.lengthUm === stock.length &&
        l.stock.thicknessUm === stock.thickness,
    ).length;
    const available = stock.quantity ?? 1;
    for (let i = usedCount; i < available; i++) {
      result.push({
        kind: 'sheet',
        stock: {
          name: stock.name ?? stock.material,
          material: stock.material,
          widthUm: stock.width,
          lengthUm: stock.length,
          thicknessUm: stock.thickness,
          color: stock.color,
          role: 'offcut',
        },
        placements: [],
        marginUm: (margin.value ?? 0) as import('cutlist').Micrometres,
        algorithm: 'tidy',
      });
    }
  }
  return result;
});
</script>

<template>
  <div class="h-full overflow-hidden grid grid-cols-[auto_1fr]">
    <ViewerSidePanel
      title="How layouts work"
      :collapsed="helpCollapsed"
      @update:collapsed="(v) => (helpCollapsed = v)"
    >
      <LayoutHelpContent />
    </ViewerSidePanel>

    <div class="relative overflow-hidden">
      <!-- Cutlist Preview -->
      <div class="absolute inset-0 overflow-none flex bg-mist-900 shadow-lg">
        <p v-if="error" class="m-auto text-red-400">{{ error }}</p>

        <template v-else-if="data">
          <div
            v-if="totalVisibleLayouts === 0"
            class="m-auto max-w-sm text-center bg-base border border-default rounded-lg p-6"
          >
            <UIcon
              :name="emptyState.icon"
              class="w-8 h-8 text-dim mx-auto mb-3"
            />
            <h3 class="text-base text-hi font-medium mb-1">
              {{ emptyState.title }}
            </h3>
            <p class="text-sm text-muted mb-4">
              {{ emptyState.body }}
            </p>
            <UButton
              v-if="emptyState.cta"
              size="sm"
              color="primary"
              icon="i-lucide-warehouse"
              :to="stockTabPath"
            >
              Configure stock
            </UButton>
          </div>
          <template v-else>
            <div ref="gridEl" class="canvas-grid" />
            <div
              ref="container"
              class="canvas-plane"
              :style="`--zoom:${scale ?? 1}`"
            >
              <div class="grid grid-flow-col auto-cols-max items-start">
                <LayoutList
                  v-if="
                    displaySheetLayouts.length > 0 ||
                    unusedOffcutLayouts.length > 0
                  "
                  :layouts="displaySheetLayouts"
                  :unused-layouts="unusedOffcutLayouts"
                />
                <LinearLayoutList
                  v-if="linearLayouts.length > 0"
                  :layouts="linearLayouts"
                />
              </div>
            </div>
          </template>
        </template>

        <div
          v-else-if="isComputing"
          class="m-auto flex items-center gap-2 text-muted"
        >
          <UIcon name="i-lucide-loader-2" class="w-5 h-5 animate-spin" />
          <span class="text-sm">Computing layouts&hellip;</span>
        </div>
      </div>

      <!-- Warning banners -->
      <div
        v-if="
          !error &&
          (partCountWarning ||
            showLeftoverBanner ||
            unusedStockNames.length > 0)
        "
        class="absolute bottom-14 left-1/2 -translate-x-1/2 z-10 flex flex-col items-center gap-2 max-w-md"
      >
        <div
          v-if="partCountWarning"
          class="bg-amber-500/15 border border-amber-500/30 rounded-lg px-4 py-2 flex items-center gap-2"
        >
          <UIcon
            name="i-lucide-triangle-alert"
            class="w-4 h-4 text-amber-500 shrink-0"
          />
          <span class="text-xs text-amber-500">{{ partCountWarning }}</span>
        </div>
        <div
          v-if="showLeftoverBanner"
          class="bg-amber-500/15 border border-amber-500/30 rounded-lg px-4 py-2 flex items-center gap-2"
        >
          <UIcon
            name="i-lucide-triangle-alert"
            class="w-4 h-4 text-amber-500 shrink-0"
          />
          <span class="text-xs text-amber-500">
            {{ unplacedCount }}
            {{ unplacedCount === 1 ? 'part' : 'parts' }} could not be placed on
            matching stock
          </span>
        </div>
        <div
          v-if="unusedStockNames.length > 0"
          class="bg-mist-800/80 border border-subtle rounded-lg px-4 py-2 flex items-center gap-2"
        >
          <UIcon name="i-lucide-package-x" class="w-4 h-4 text-dim shrink-0" />
          <span class="text-xs text-muted">
            Not needed:
            <span v-for="(name, i) in unusedStockNames" :key="name"
              >{{ name
              }}<span v-if="i < unusedStockNames.length - 1">, </span></span
            >
          </span>
        </div>
      </div>

      <!-- Single row so the right group wraps below the left on narrow
         viewports instead of overlapping it. -->
      <div
        class="absolute top-3 left-3 right-3 z-10 flex flex-wrap items-start justify-between gap-2"
      >
        <div
          class="bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2"
        >
          <PreviewToolbar v-model:show-unused="showUnused" />
        </div>

        <div class="flex items-center gap-2 ml-auto">
          <div
            v-if="stockOptions.length > 1"
            data-testid="stock-filter"
            class="bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2 flex items-center gap-2"
          >
            <label class="text-xs text-muted whitespace-nowrap">Stock</label>
            <UPopover
              v-model:open="stockDropdownOpen"
              :content="{ side: 'bottom', align: 'end', sideOffset: 4 }"
            >
              <UButton
                size="xs"
                color="neutral"
                variant="soft"
                trailing-icon="i-lucide-chevron-down"
                class="min-w-[110px] justify-between"
              >
                {{ selectedLabel }}
              </UButton>
              <template #content>
                <div
                  class="min-w-[220px] max-h-80 overflow-y-auto flex flex-col"
                >
                  <!-- Apply button pinned at top -->
                  <div
                    class="sticky top-0 z-10 px-2 py-2 border-b border-subtle bg-elevated"
                  >
                    <UButton
                      size="xs"
                      color="primary"
                      block
                      @click="applyFilter"
                    >
                      Apply
                    </UButton>
                  </div>
                  <!-- All option -->
                  <button
                    type="button"
                    class="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-mist-700/50 transition-colors text-left"
                    @click="pendingKeys = new Set()"
                  >
                    <div
                      class="w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors"
                      :class="
                        pendingKeys.size === 0
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-mist-600'
                      "
                    >
                      <UIcon
                        v-if="pendingKeys.size === 0"
                        name="i-lucide-check"
                        class="w-2.5 h-2.5 text-white"
                      />
                    </div>
                    <span
                      :class="
                        pendingKeys.size === 0
                          ? 'text-hi font-medium'
                          : 'text-body'
                      "
                      >All</span
                    >
                  </button>
                  <!-- Individual stock options -->
                  <button
                    v-for="opt in stockOptions"
                    :key="opt.value"
                    type="button"
                    class="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-mist-700/50 transition-colors text-left"
                    @click="togglePending(opt.value)"
                  >
                    <div
                      class="w-4 h-4 rounded border shrink-0 flex items-center justify-center transition-colors"
                      :class="
                        pendingKeys.has(opt.value)
                          ? 'bg-primary-500 border-primary-500'
                          : 'border-mist-600'
                      "
                    >
                      <UIcon
                        v-if="pendingKeys.has(opt.value)"
                        name="i-lucide-check"
                        class="w-2.5 h-2.5 text-white"
                      />
                    </div>
                    <div class="flex-1 min-w-0">
                      <div
                        class="truncate"
                        :class="
                          pendingKeys.has(opt.value)
                            ? 'text-hi font-medium'
                            : 'text-body'
                        "
                      >
                        {{ opt.label }}
                      </div>
                      <div class="text-xs text-dim">{{ opt.sublabel }}</div>
                    </div>
                  </button>
                </div>
              </template>
            </UPopover>
          </div>
          <ExportPdfButton />
        </div>
      </div>

      <!-- Sheet shopping list summary -->
      <div
        v-if="
          !error &&
          data &&
          filteredSheetLayouts.length > 0 &&
          !shoppingListHidden
        "
        class="absolute top-16 right-3 z-10 max-w-xs bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2"
      >
        <SheetShoppingList :layouts="filteredSheetLayouts" :stocks="stocks" />
      </div>

      <!-- Drag ghost (follows cursor while a part is being dragged) -->
      <Teleport to="body">
        <div
          v-if="dragGhost"
          ref="ghostEl"
          class="fixed pointer-events-none z-[9999] rounded-xs shadow-xl opacity-80 border border-white/20"
          :style="{
            left: `${dragGhost.x - ghostSize.w / 2}px`,
            top: `${dragGhost.y - ghostSize.h / 2}px`,
            width: `${ghostSize.w}px`,
            height: `${ghostSize.h}px`,
            background: ghostColor,
          }"
        />
      </Teleport>

      <!-- Controls -->
      <div class="absolute bottom-4 right-4 flex gap-3 z-10">
        <div
          v-if="!error && data && filteredSheetLayouts.length > 0"
          class="bg-overlay backdrop-blur border border-subtle rounded-lg"
        >
          <UButton
            :title="shoppingListHidden ? 'Show buy list' : 'Hide buy list'"
            square
            size="lg"
            :color="shoppingListHidden ? 'neutral' : 'primary'"
            :variant="shoppingListHidden ? 'ghost' : 'solid'"
            @click="shoppingListHidden = !shoppingListHidden"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              class="w-5 h-5"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            >
              <path d="M16 5H3" />
              <path d="M16 12H3" />
              <path d="M11 19H3" />
              <path d="m15 18 2 2 4-4" />
            </svg>
          </UButton>
        </div>
        <RulerToggle
          class="bg-overlay backdrop-blur border border-subtle rounded-lg"
        />
        <div
          v-if="scale != null"
          class="bg-overlay backdrop-blur border border-subtle rounded-lg px-1 flex gap-1"
        >
          <UButton
            title="Zoom out"
            square
            size="lg"
            color="neutral"
            variant="ghost"
            icon="i-lucide-minus"
            @click="zoomOut"
          />
          <UButton
            :title="`${Math.round(scale * 100)}% - Click to reset to 100%`"
            class="w-20 justify-center text-teal-400"
            size="lg"
            color="neutral"
            variant="ghost"
            @click="resetZoom"
          >
            {{ Math.round(scale * 100) }}%
          </UButton>
          <UButton
            title="Zoom in"
            square
            size="lg"
            color="neutral"
            variant="ghost"
            icon="i-lucide-plus"
            @click="zoomIn"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.canvas-plane {
  position: relative;
  user-select: none;
}

.canvas-grid {
  position: absolute;
  inset: 0;
  pointer-events: none;
  background-image: radial-gradient(
    circle closest-side,
    #394447 8.33%,
    transparent 8.33%
  );
}
</style>
