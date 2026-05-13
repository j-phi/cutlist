<script lang="ts" setup>
import type { SheetBoardLayout, LinearBoardLayout } from 'cutlist';
import { projectPath } from '~/utils/projectTabs';

const { data, isComputing, error, partCountWarning } = useBoardLayoutsQuery();
const { activeId } = useProjects();
const { stocks } = useProjectSettings();

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

const totalVisibleLayouts = computed(
  () => filteredSheetLayouts.value.length + linearLayouts.value.length,
);

const unplacedCount = computed(() => data.value?.leftovers.length ?? 0);

const showLeftoverBanner = computed(
  () => unplacedCount.value > 0 && totalVisibleLayouts.value > 0,
);

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
                v-if="filteredSheetLayouts.length > 0"
                :layouts="filteredSheetLayouts"
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
      v-if="!error && (partCountWarning || showLeftoverBanner)"
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
