<script lang="ts" setup>
import type { BoardLayout } from 'cutlist';
import { Distance } from 'cutlist';

const props = defineProps<{
  layouts: BoardLayout[];
}>();

const getPx = useGetPx();
const gap = getPx(new Distance('4 in').m);
const formatDistance = useFormatDistance();

function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

interface LayoutGroup {
  key: string;
  material: string;
  thickness: string;
  layouts: BoardLayout[];
  /** Original indices for board numbering */
  indices: number[];
}

const groups = computed<LayoutGroup[]>(() => {
  // Stable sort: material → thickness → fuller boards first
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
        layouts: [],
        indices: [],
      };
      map.set(key, entry);
    }
    entry.layouts.push(layout);
    entry.indices.push(i);
  }

  return [...map.values()];
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
        <div
          class="zoom-stable flex items-baseline gap-3 mb-6 origin-bottom-left"
        >
          <h2 class="text-2xl font-bold text-teal-400">
            {{ group.material }}
          </h2>
          <span class="text-2xl font-bold text-muted">{{
            group.thickness
          }}</span>
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
