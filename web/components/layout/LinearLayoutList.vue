<script lang="ts" setup>
import { aggregateLinearShoppingList, type LinearBoardLayout } from 'cutlist';

const props = defineProps<{
  layouts: LinearBoardLayout[];
}>();

const formatDistance = useFormatDistance();

interface DisplayGroup {
  key: string;
  material: string;
  shoppingSummary: string;
  totalSticks: number;
  layouts: LinearBoardLayout[];
  /** Indices into `layouts`, for stable per-stick numbering across the group. */
  indices: number[];
}

const groups = computed<DisplayGroup[]>(() => {
  const aggregated = aggregateLinearShoppingList(props.layouts);
  return aggregated.map((g) => {
    const parts = g.lengths.map(
      (l) => `${l.count}× ${formatDistance(l.lengthM) ?? ''}`,
    );
    const summary = `${parts.join(', ')} (${g.totalSticks} ${
      g.totalSticks === 1 ? 'stick' : 'sticks'
    } total)`;
    return {
      key: g.material,
      material: g.material,
      shoppingSummary: summary,
      totalSticks: g.totalSticks,
      layouts: g.layouts,
      indices: g.layouts.map((_, i) => i),
    };
  });
});
</script>

<template>
  <div class="flex flex-col gap-8 m-16 max-w-3xl">
    <section
      v-for="group in groups"
      :key="group.key"
      class="flex flex-col gap-3"
    >
      <header class="zoom-stable origin-top-left">
        <h2 class="text-2xl font-bold text-teal-400">
          {{ group.material }}
        </h2>
        <p class="text-sm text-muted mt-1">{{ group.shoppingSummary }}</p>
      </header>
      <ul class="flex flex-col gap-2">
        <LinearLayoutListItem
          v-for="(layout, i) in group.layouts"
          :key="group.indices[i]"
          :layout="layout"
          :board-index="group.indices[i]"
        />
      </ul>
    </section>
  </div>
</template>
