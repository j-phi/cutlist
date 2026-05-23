<script lang="ts" setup>
import {
  mmToUm,
  MM_PER_IN,
  type Algorithm,
  type SheetBoardLayout,
  type SheetStockMatrix,
  type StockMatrix,
} from 'cutlist';

const props = defineProps<{
  layouts: SheetBoardLayout[];
  unusedLayouts?: SheetBoardLayout[];
}>();

const getPx = useGetPx();
const gap = getPx(mmToUm(4 * MM_PER_IN));
const formatDistance = useFormatDistance();
const { stocks, defaultAlgorithm } = useProjectSettings();
const { panelOrder } = useOptimizationSettings();

const ALGORITHM_LABEL: Record<Algorithm, string> = {
  auto: 'Auto',
  tidy: 'Tidy',
  compact: 'Compact',
  cnc: 'CNC',
};
const ALGORITHM_ORDER: Algorithm[] = ['auto', 'tidy', 'compact', 'cnc'];

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size)
    chunks.push(arr.slice(i, i + size));
  return chunks;
}

interface LayoutGroup {
  key: string;
  material: string;
  thickness: string;
  thicknessUm: number;
  layouts: SheetBoardLayout[];
  /** Indices into `props.layouts` for board numbering. */
  indices: number[];
  /** Algorithm that produced this group's boards (never `'auto'`). */
  actualAlgorithm: Exclude<Algorithm, 'auto'>;
  /** User's effective preference (per-thickness override → project default). */
  preference: Algorithm;
}

// The algorithm picker on this view is sheet-only — linear stock has one
// strategy and ships in its own list.
const sheetStocks = computed<SheetStockMatrix[]>(() =>
  stocks.value.filter((m): m is SheetStockMatrix => m.kind === 'sheet'),
);

// `thicknessAlgorithms` is keyed by the mm thickness value stringified
// (e.g. `"18"` for 18 mm, `"19.05"` for 3/4").
function findThicknessKeyOnItem(
  item: SheetStockMatrix,
  thicknessUm: number,
): string | undefined {
  for (const size of item.sizes) {
    for (const t of size.thickness) {
      if (mmToUm(t) === thicknessUm) return String(t);
    }
  }
  return undefined;
}

function preferenceFor(material: string, thicknessUm: number): Algorithm {
  // Walk every row that names this material — the engine groups by
  // (material, thickness) so an override on any matching row applies.
  for (const item of sheetStocks.value) {
    if (item.material !== material) continue;
    const key = findThicknessKeyOnItem(item, thicknessUm);
    if (!key) continue;
    const override = item.thicknessAlgorithms?.[key];
    if (override) return override;
  }
  return defaultAlgorithm.value ?? 'auto';
}

const groups = computed<LayoutGroup[]>(() => {
  // Attach original indices before sorting so boardIndex stays stable.
  const withOrig = props.layouts.map((layout, origIdx) => ({
    layout,
    origIdx,
  }));

  // Sort: material → thickness, then a tiebreak chosen by panelOrder.
  // 'board' (default) leaves the packer's board order intact — Array.sort is
  // stable, so returning 0 keeps origIdx order and panels never shift when a
  // part is dragged between boards in manual placement. 'fullest' puts the
  // most-filled boards first.
  withOrig.sort((a, b) => {
    const mat = a.layout.stock.material.localeCompare(b.layout.stock.material);
    if (mat !== 0) return mat;
    const thick = a.layout.stock.thicknessUm - b.layout.stock.thicknessUm;
    if (thick !== 0) return thick;
    if (panelOrder.value !== 'fullest') return 0;
    const areaA = a.layout.placements.reduce(
      (s, p) => s + p.widthUm * p.lengthUm,
      0,
    );
    const areaB = b.layout.placements.reduce(
      (s, p) => s + p.widthUm * p.lengthUm,
      0,
    );
    return areaB - areaA;
  });

  const map = new Map<string, LayoutGroup>();
  for (let i = 0; i < withOrig.length; i++) {
    const { layout, origIdx } = withOrig[i];
    const key = `${layout.stock.material}__${layout.stock.thicknessUm}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        key,
        material: layout.stock.material,
        thickness: formatDistance(layout.stock.thicknessUm) ?? '',
        thicknessUm: layout.stock.thicknessUm,
        layouts: [],
        indices: [],
        actualAlgorithm: layout.algorithm,
        preference: preferenceFor(
          layout.stock.material,
          layout.stock.thicknessUm,
        ),
      };
      map.set(key, entry);
    }
    entry.layouts.push(layout);
    // Use the original index so boardIndex always maps back to props.layouts.
    entry.indices.push(origIdx);
  }
  return [...map.values()];
});

function setOverride(material: string, thicknessUm: number, alg: Algorithm) {
  // Apply to every row matching (material, thickness) — the engine groups
  // across rows, so writing only the first would split the resolution.
  const inherited = defaultAlgorithm.value ?? 'auto';
  stocks.value = stocks.value.map((item): StockMatrix => {
    if (item.kind !== 'sheet' || item.material !== material) return item;
    const key = findThicknessKeyOnItem(item, thicknessUm);
    if (!key) return item;
    const algorithms = { ...item.thicknessAlgorithms };
    if (alg === inherited) delete algorithms[key];
    else algorithms[key] = alg;
    const next: SheetStockMatrix = { ...item, thicknessAlgorithms: algorithms };
    if (Object.keys(algorithms).length === 0) delete next.thicknessAlgorithms;
    return next;
  });
}

function algorithmMenu(group: LayoutGroup) {
  return ALGORITHM_ORDER.map((alg) => ({
    label: ALGORITHM_LABEL[alg],
    icon: alg === group.preference ? 'i-lucide-check' : undefined,
    onSelect: () => setOverride(group.material, group.thicknessUm, alg),
  }));
}

interface UnusedGroup {
  key: string;
  material: string;
  thickness: string;
  thicknessUm: number;
  layouts: SheetBoardLayout[];
}

const unusedGroups = computed<UnusedGroup[]>(() => {
  const map = new Map<string, UnusedGroup>();
  for (const layout of props.unusedLayouts ?? []) {
    const key = `${layout.stock.material}__${layout.stock.thicknessUm}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        key,
        material: layout.stock.material,
        thickness: formatDistance(layout.stock.thicknessUm) ?? '',
        thicknessUm: layout.stock.thicknessUm,
        layouts: [],
      };
      map.set(key, entry);
    }
    entry.layouts.push(layout);
  }
  return [...map.values()];
});

function unusedForGroup(group: LayoutGroup): SheetBoardLayout[] {
  const key = `${group.material}__${group.thicknessUm}`;
  return unusedGroups.value.find((g) => g.key === key)?.layouts ?? [];
}

const orphanUnusedGroups = computed<UnusedGroup[]>(() => {
  const usedKeys = new Set(groups.value.map((g) => g.key));
  return unusedGroups.value.filter((g) => !usedKeys.has(g.key));
});
</script>

<template>
  <div class="flex items-start m-16" :style="`gap:${gap}`">
    <template v-for="(group, gi) in groups" :key="group.key">
      <div
        v-if="gi > 0"
        class="self-stretch flex flex-col items-center shrink-0 mx-6"
      >
        <div class="w-px flex-1 bg-mist-600/50" />
      </div>

      <div class="shrink-0">
        <div class="zoom-stable mb-6 origin-bottom-left">
          <div class="flex items-baseline gap-3">
            <h2 class="text-2xl font-bold text-teal-400">
              {{ group.material }}
            </h2>
            <span class="text-2xl font-bold text-muted">{{
              group.thickness
            }}</span>
          </div>
          <div class="mt-1.5">
            <UDropdownMenu :items="algorithmMenu(group)">
              <UButton
                size="xs"
                variant="soft"
                color="neutral"
                trailing-icon="i-lucide-chevron-down"
                :title="
                  group.preference === 'auto'
                    ? `Auto picked ${ALGORITHM_LABEL[group.actualAlgorithm]} for this group. Click to pin a different algorithm.`
                    : `Pinned to ${ALGORITHM_LABEL[group.actualAlgorithm]}. Click to change.`
                "
              >
                {{ ALGORITHM_LABEL[group.actualAlgorithm] }}
                <span
                  v-if="group.preference === 'auto'"
                  class="ml-1 text-[10px] text-dim font-mono"
                  >auto</span
                >
              </UButton>
            </UDropdownMenu>
          </div>
        </div>
        <div
          v-for="(row, ri) in chunkArray(group.layouts, 10)"
          :key="ri"
          class="flex"
          :style="`gap:${gap}` + (ri > 0 ? `;margin-top:${gap}` : '')"
        >
          <LayoutListItem
            v-for="(layout, i) of row"
            :key="group.indices[ri * 10 + i]"
            :layout="layout"
            :board-index="group.indices[ri * 10 + i]"
          />
        </div>

        <!-- Unused offcuts in this group -->
        <template v-if="unusedForGroup(group).length > 0">
          <div
            class="zoom-stable mt-4 origin-bottom-left flex items-center gap-2"
          >
            <div class="h-px flex-1 bg-mist-700/50" />
            <span class="text-[10px] uppercase tracking-wider text-dim shrink-0"
              >Available offcuts</span
            >
            <div class="h-px flex-1 bg-mist-700/50" />
          </div>
          <div
            v-for="(row, ri) in chunkArray(unusedForGroup(group), 10)"
            :key="`unused-${ri}`"
            class="flex mt-4 opacity-50"
            :style="`gap:${gap}`"
          >
            <LayoutListItem
              v-for="(layout, i) of row"
              :key="`unused-${group.key}-${ri * 10 + i}`"
              :layout="layout"
              :board-index="-1"
              :read-only="true"
            />
          </div>
        </template>
      </div>
    </template>

    <!-- Orphan unused groups (material+thickness with no placed layouts) -->
    <template
      v-for="uGroup in orphanUnusedGroups"
      :key="`orphan-${uGroup.key}`"
    >
      <div class="self-stretch flex flex-col items-center shrink-0 mx-6">
        <div class="w-px flex-1 bg-mist-600/50" />
      </div>

      <div class="shrink-0 opacity-50">
        <div class="zoom-stable mb-6 origin-bottom-left">
          <div class="flex items-baseline gap-3">
            <h2 class="text-2xl font-bold text-teal-400">
              {{ uGroup.material }}
            </h2>
            <span class="text-2xl font-bold text-muted">{{
              uGroup.thickness
            }}</span>
          </div>
          <div class="mt-1.5 text-xs text-dim">Available offcuts</div>
        </div>
        <div
          v-for="(row, ri) in chunkArray(uGroup.layouts, 10)"
          :key="ri"
          class="flex"
          :style="`gap:${gap}` + (ri > 0 ? `;margin-top:${gap}` : '')"
        >
          <LayoutListItem
            v-for="(layout, i) of row"
            :key="`orphan-item-${ri * 10 + i}`"
            :layout="layout"
            :board-index="-1"
            :read-only="true"
          />
        </div>
      </div>
    </template>
  </div>
</template>
