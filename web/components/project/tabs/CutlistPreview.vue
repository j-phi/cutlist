<script lang="ts" setup>
import type {
  SheetBoardLayout,
  LinearBoardLayout,
  SheetBoardLayoutPlacement,
} from 'cutlist';
import { projectPath } from '~/utils/projectTabs';

const { data, isComputing, error, partCountWarning } = useBoardLayoutsQuery();
const { activeId } = useProjects();
const { stocks } = useProjectSettings();
const { manualMode, isDragging, movePart, applyOverrides, resetOverrides } =
  useManualLayout();

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

const stockOptions = computed(() => {
  const seen = new Set<string>();
  const options: { label: string; value: string }[] = [];
  for (const layout of sheetLayouts.value) {
    const key = stockKey(layout.stock);
    if (!seen.has(key)) {
      seen.add(key);
      const thickness = formatDistance(layout.stock.thicknessUm);
      options.push({
        label: `${thickness} ${layout.stock.material}`,
        value: key,
      });
    }
  }
  return options;
});

const ALL = '__all__';
const selectedStock = ref(ALL);

watch(stockOptions, (opts) => {
  if (
    selectedStock.value !== ALL &&
    !opts.some((o) => o.value === selectedStock.value)
  ) {
    selectedStock.value = ALL;
  }
});

const filteredSheetLayouts = computed<SheetBoardLayout[]>(() => {
  if (selectedStock.value === ALL) return sheetLayouts.value;
  return sheetLayouts.value.filter(
    (l) => stockKey(l.stock) === selectedStock.value,
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
  };

  function cleanup() {
    document.removeEventListener('pointermove', onMove);
    document.removeEventListener('keydown', onKeyDown);
    isDragging.value = false;
    dragGhost.value = null;
  }

  const onUp = (e: PointerEvent) => {
    document.removeEventListener('pointerup', onUp);
    cleanup();

    // Temporarily hide the ghost so elementsFromPoint sees the board underneath.
    const ghost = ghostEl.value;
    if (ghost) ghost.style.display = 'none';
    const els = document.elementsFromPoint(e.clientX, e.clientY);
    if (ghost) ghost.style.display = '';

    const boardEl = els.find(
      (el) => (el as HTMLElement).dataset?.boardIndex != null,
    ) as HTMLElement | undefined;

    if (boardEl) {
      const targetBoardIndex = parseInt(boardEl.dataset.boardIndex!);
      const rect = boardEl.getBoundingClientRect();
      const u = (e.clientX - rect.left) / rect.width;
      const v = (e.clientY - rect.top) / rect.height;
      const target = filteredSheetLayouts.value[targetBoardIndex];
      if (target) {
        const xUm = u * target.stock.widthUm;
        const yUm = (1 - v) * target.stock.lengthUm;
        const w = placement.rightUm - placement.leftUm;
        const h = placement.topUm - placement.bottomUm;
        movePart(
          placement.partNumber,
          placement.instanceNumber,
          targetBoardIndex,
          xUm - w / 2,
          yUm - h / 2,
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
</script>

<template>
  <div class="relative h-full overflow-hidden">
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
                v-if="displaySheetLayouts.length > 0"
                :layouts="displaySheetLayouts"
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
        (partCountWarning || showLeftoverBanner || unusedStockNames.length > 0)
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
        <PreviewToolbar />
      </div>

      <div class="flex items-center gap-2 ml-auto">
        <div
          v-if="stockOptions.length > 1"
          class="bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2 flex items-center gap-2"
        >
          <label class="text-xs text-muted whitespace-nowrap">Stock</label>
          <USelect
            v-model="selectedStock"
            :items="[{ label: 'All', value: ALL }, ...stockOptions]"
            size="xs"
            class="w-36"
          />
        </div>
        <ExportPdfButton />
      </div>
    </div>

    <!-- Sheet shopping list summary -->
    <div
      v-if="!error && data && filteredSheetLayouts.length > 0"
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
</template>

<style scoped>
.canvas-plane {
  position: relative;
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
