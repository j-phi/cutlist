<script lang="ts" setup>
import {
  aggregateSheetShoppingList,
  reduceStockMatrix,
  type SheetBoardLayout,
  type StockMatrix,
} from 'cutlist';

const props = defineProps<{
  layouts: SheetBoardLayout[];
  /** Project stock matrix — used to report total offcuts available. */
  stocks?: StockMatrix[];
}>();

const formatDistance = useFormatDistance();

interface DisplayGroup {
  material: string;
  /** Present only when offcuts exist for this group. */
  offcutSummary: string | null;
  buySummary: string;
}

const groups = computed<DisplayGroup[]>(() => {
  const expanded = props.stocks ? reduceStockMatrix(props.stocks) : undefined;
  return aggregateSheetShoppingList(props.layouts, expanded).map((g) => {
    const offcutSummary =
      g.offcutsAvailable > 0
        ? `Offcuts used: ${g.offcutsUsed}/${g.offcutsAvailable}`
        : null;

    const buyParts = g.generalSizes.map(
      (s) =>
        `${s.count}× ${formatDistance(s.widthUm) ?? ''} × ${
          formatDistance(s.lengthUm) ?? ''
        }`,
    );
    const buySummary =
      buyParts.length > 0 ? `Buy: ${buyParts.join(', ')}` : 'Buy: none';

    return {
      material: g.material,
      offcutSummary,
      buySummary,
    };
  });
});
</script>

<template>
  <div v-if="groups.length > 0" class="flex flex-col gap-3">
    <section
      v-for="group in groups"
      :key="group.material"
      class="flex flex-col"
    >
      <h3 class="text-sm font-semibold text-teal-400">{{ group.material }}</h3>
      <p v-if="group.offcutSummary" class="text-xs text-muted mt-0.5">
        {{ group.offcutSummary }}
      </p>
      <p class="text-xs text-body mt-0.5">{{ group.buySummary }}</p>
    </section>
  </div>
</template>
