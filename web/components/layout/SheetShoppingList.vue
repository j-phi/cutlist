<script lang="ts" setup>
import {
  aggregateSheetShoppingList,
  reduceStockMatrix,
  sheetShoppingProjectCost,
  type SheetBoardLayout,
  type StockMatrix,
} from 'cutlist';

const props = defineProps<{
  layouts: SheetBoardLayout[];
  /** Project stock matrix — used to report total offcuts available. */
  stocks?: StockMatrix[];
}>();

const formatDistance = useFormatDistance();

/** Plain numeric format for currency-agnostic costs (trim trailing zeros). */
function formatCost(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2);
}

interface DisplayGroup {
  material: string;
  /** Present only when offcuts exist for this group. */
  offcutSummary: string | null;
  buySummary: string;
  /** Yield percentage rounded to a whole point (e.g. "50%"). */
  yieldSummary: string;
  /** Present only when the group has priced stock (FR-COST-2). */
  costSummary: string | null;
}

const aggregated = computed(() => {
  const expanded = props.stocks ? reduceStockMatrix(props.stocks) : undefined;
  return aggregateSheetShoppingList(props.layouts, expanded);
});

const groups = computed<DisplayGroup[]>(() =>
  aggregated.value.map((g) => {
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
      yieldSummary: `Yield: ${Math.round(g.yieldRatio * 100)}%`,
      costSummary:
        g.materialCost === undefined
          ? null
          : `Cost: ${formatCost(g.materialCost)}`,
    };
  }),
);

/** Project material total — omitted when no group is priced (FR-COST-2). */
const projectCost = computed(() => {
  const total = sheetShoppingProjectCost(aggregated.value);
  return total === undefined
    ? null
    : `Total material cost: ${formatCost(total)}`;
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
      <p class="text-xs text-muted mt-0.5">{{ group.yieldSummary }}</p>
      <p v-if="group.costSummary" class="text-xs text-muted mt-0.5">
        {{ group.costSummary }}
      </p>
    </section>
    <p v-if="projectCost" class="text-xs font-medium text-body mt-1">
      {{ projectCost }}
    </p>
  </div>
</template>
