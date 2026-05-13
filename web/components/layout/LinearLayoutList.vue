<script lang="ts" setup>
import { aggregateLinearShoppingList, type LinearBoardLayout } from 'cutlist';

const props = defineProps<{
  layouts: LinearBoardLayout[];
}>();

const formatDistance = useFormatDistance();

interface DisplayGroup {
  material: string;
  shoppingSummary: string;
  layouts: LinearBoardLayout[];
}

const groups = computed<DisplayGroup[]>(() =>
  aggregateLinearShoppingList(props.layouts).map((g) => {
    const parts = g.lengths.map(
      (l) => `${l.count}× ${formatDistance(l.lengthUm) ?? ''}`,
    );
    const summary = `${parts.join(', ')} (${g.totalSticks} ${
      g.totalSticks === 1 ? 'stick' : 'sticks'
    } total)`;
    return {
      material: g.material,
      shoppingSummary: summary,
      layouts: g.layouts,
    };
  }),
);
</script>

<template>
  <div class="flex items-start gap-16 m-16">
    <section
      v-for="group in groups"
      :key="group.material"
      class="flex flex-col"
    >
      <header class="zoom-stable origin-bottom-left mb-8">
        <h2 class="text-2xl font-bold text-teal-400">{{ group.material }}</h2>
        <p class="text-sm text-muted mt-1">{{ group.shoppingSummary }}</p>
      </header>
      <ul class="flex flex-col gap-6 items-start">
        <LinearLayoutListItem
          v-for="(layout, i) in group.layouts"
          :key="i"
          :layout="layout"
          :board-index="i"
        />
      </ul>
    </section>
  </div>
</template>
