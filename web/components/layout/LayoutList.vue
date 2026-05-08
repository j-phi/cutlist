<script lang="ts" setup>
import type { Algorithm, BoardLayout, StockMatrix } from 'cutlist';
import { Distance } from 'cutlist';
import YAML from 'js-yaml';
import { parseStock } from '~/utils/parseStock';

const props = defineProps<{
  layouts: BoardLayout[];
}>();

const getPx = useGetPx();
const gap = getPx(new Distance('4 in').m);
const formatDistance = useFormatDistance();
const { stock, defaultAlgorithm } = useProjectSettings();

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
  thicknessM: number;
  layouts: BoardLayout[];
  /** Indices into `props.layouts` for board numbering. */
  indices: number[];
  /** Algorithm that produced this group's boards (never `'auto'`). */
  actualAlgorithm: Exclude<Algorithm, 'auto'>;
  /** User's effective preference (per-thickness override → project default). */
  preference: Algorithm;
}

/** Single parse of the project's stock YAML; used for picker state. */
const parsedMatrix = computed<StockMatrix[]>(() => {
  const yaml = stock.value;
  if (!yaml) return [];
  try {
    return parseStock(yaml);
  } catch {
    return [];
  }
});

/**
 * Match a layout's `thicknessM` back to the YAML thickness key it came from.
 * Keys in `thicknessAlgorithms` use the as-written representation, e.g.
 * `"18"` for `18mm` or `"0.75"` for `0.75in`.
 */
function findThicknessKey(
  matrix: StockMatrix[],
  material: string,
  thicknessM: number,
): string | undefined {
  const item = matrix.find((m) => m.material === material);
  if (!item) return undefined;
  const unit = item.unit ?? 'mm';
  for (const size of item.sizes) {
    for (const t of size.thickness) {
      const inMeters =
        typeof t === 'string' ? new Distance(t).m : new Distance(t + unit).m;
      if (Math.abs(inMeters - thicknessM) < 1e-5) return String(t);
    }
  }
  return undefined;
}

function preferenceFor(material: string, thicknessM: number): Algorithm {
  const matrix = parsedMatrix.value;
  const item = matrix.find((m) => m.material === material);
  if (!item) return defaultAlgorithm.value ?? 'auto';
  const key = findThicknessKey(matrix, material, thicknessM);
  const perThickness = key ? item.thicknessAlgorithms?.[key] : undefined;
  return perThickness ?? defaultAlgorithm.value ?? 'auto';
}

const groups = computed<LayoutGroup[]>(() => {
  // Stable sort: material → thickness → fuller boards first.
  const sorted = [...props.layouts].sort((a, b) => {
    const mat = a.stock.material.localeCompare(b.stock.material);
    if (mat !== 0) return mat;
    const thick = a.stock.thicknessM - b.stock.thicknessM;
    if (thick !== 0) return thick;
    const areaA = a.placements.reduce((s, p) => s + p.widthM * p.lengthM, 0);
    const areaB = b.placements.reduce((s, p) => s + p.widthM * p.lengthM, 0);
    return areaB - areaA;
  });

  const map = new Map<string, LayoutGroup>();
  for (let i = 0; i < sorted.length; i++) {
    const layout = sorted[i];
    const key = `${layout.stock.material}__${layout.stock.thicknessM}`;
    let entry = map.get(key);
    if (!entry) {
      entry = {
        key,
        material: layout.stock.material,
        thickness: formatDistance(layout.stock.thicknessM) ?? '',
        thicknessM: layout.stock.thicknessM,
        layouts: [],
        indices: [],
        actualAlgorithm: layout.algorithm,
        preference: preferenceFor(
          layout.stock.material,
          layout.stock.thicknessM,
        ),
      };
      map.set(key, entry);
    }
    entry.layouts.push(layout);
    entry.indices.push(i);
  }
  return [...map.values()];
});

function setOverride(material: string, thicknessM: number, alg: Algorithm) {
  const yaml = stock.value;
  if (!yaml) return;
  let matrix: StockMatrix[];
  try {
    matrix = parseStock(yaml);
  } catch {
    return;
  }
  const target = matrix.find((m) => m.material === material);
  if (!target) return;
  const key = findThicknessKey(matrix, material, thicknessM);
  if (!key) return;

  // Drop the entry when the choice matches the project default so the YAML
  // stays minimal; otherwise pin it explicitly.
  const inherited = defaultAlgorithm.value ?? 'auto';
  if (alg === inherited) {
    if (target.thicknessAlgorithms) {
      delete target.thicknessAlgorithms[key];
      if (Object.keys(target.thicknessAlgorithms).length === 0) {
        delete target.thicknessAlgorithms;
      }
    }
  } else {
    target.thicknessAlgorithms = {
      ...(target.thicknessAlgorithms ?? {}),
      [key]: alg,
    };
  }
  // JSON round-trip strips Vue reactivity wrappers before YAML.dump.
  stock.value = YAML.dump(JSON.parse(JSON.stringify(matrix)), {
    indent: 2,
    flowLevel: 3,
  });
}

function algorithmMenu(group: LayoutGroup) {
  return ALGORITHM_ORDER.map((alg) => ({
    label: ALGORITHM_LABEL[alg],
    icon: alg === group.preference ? 'i-lucide-check' : undefined,
    onSelect: () => setOverride(group.material, group.thicknessM, alg),
  }));
}
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
      </div>
    </template>
  </div>
</template>
