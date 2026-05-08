<script lang="ts" setup>
const { data, isComputing, error, partCountWarning } = useBoardLayoutsQuery();
const tab = useProjectTab();

const container = ref<HTMLDivElement>();
const gridEl = ref<HTMLDivElement>();
const { scale, resetZoom, zoomIn, zoomOut } = usePanZoom(container, gridEl);

const formatDistance = useFormatDistance();

function goToStock() {
  tab.value = 'boards';
}

function stockKey(stock: {
  material: string;
  thicknessM: number;
  widthM: number;
  lengthM: number;
}) {
  return `${stock.material}__${stock.thicknessM}__${stock.widthM}__${stock.lengthM}`;
}

const stockOptions = computed(() => {
  if (!data.value) return [];
  const seen = new Set<string>();
  const options: { label: string; value: string }[] = [];
  for (const layout of data.value.layouts) {
    const key = stockKey(layout.stock);
    if (!seen.has(key)) {
      seen.add(key);
      const thickness = formatDistance(layout.stock.thicknessM);
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

const filteredLayouts = computed(() => {
  if (!data.value) return [];
  if (selectedStock.value === ALL) return data.value.layouts;
  return data.value.layouts.filter(
    (l) => stockKey(l.stock) === selectedStock.value,
  );
});

const unplacedCount = computed(() => data.value?.leftovers.length ?? 0);

const showLeftoverBanner = computed(
  () => unplacedCount.value > 0 && filteredLayouts.value.length > 0,
);
</script>

<template>
  <div class="relative h-full overflow-hidden">
    <!-- Cutlist Preview -->
    <div class="absolute inset-0 overflow-none flex bg-mist-900 shadow-lg">
      <p v-if="error" class="m-auto text-red-400">{{ error }}</p>

      <template v-else-if="data">
        <div
          v-if="filteredLayouts.length === 0"
          class="m-auto max-w-sm text-center bg-base border border-default rounded-lg p-6"
        >
          <UIcon name="i-lucide-layers" class="w-8 h-8 text-dim mx-auto mb-3" />
          <h3 class="text-base text-hi font-medium mb-1">
            {{
              unplacedCount > 0 ? 'No matching stock' : 'No board layouts yet'
            }}
          </h3>
          <p class="text-sm text-muted mb-4">
            {{
              unplacedCount > 0
                ? "We couldn't find any boards in your stock that match the thicknesses your parts need."
                : 'Add parts in the BOM tab to generate cut layouts.'
            }}
          </p>
          <UButton
            v-if="unplacedCount > 0"
            size="sm"
            color="primary"
            icon="i-lucide-warehouse"
            @click="goToStock"
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
            <LayoutList :layouts="filteredLayouts" />
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

    <!-- Settings toolbar -->
    <div
      class="absolute top-3 left-3 z-10 bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2"
    >
      <PreviewToolbar />
    </div>

    <!-- Stock filter + print -->
    <div class="absolute top-3 right-3 z-10 flex items-center gap-2">
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

    <!-- Controls -->
    <div class="absolute bottom-4 right-4 flex gap-3 z-10">
      <RulerToggle
        class="bg-overlay backdrop-blur border border-subtle rounded-lg"
      />
      <ScaleController
        v-if="scale != null"
        class="bg-overlay backdrop-blur border border-subtle rounded-lg px-1"
        :scale="scale"
        @reset-zoom="resetZoom"
        @zoom-in="zoomIn"
        @zoom-out="zoomOut"
      />
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
