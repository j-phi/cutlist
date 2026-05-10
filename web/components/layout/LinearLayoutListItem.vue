<script lang="ts" setup>
import type { LinearBoardLayout } from 'cutlist';

const props = defineProps<{
  layout: LinearBoardLayout;
  boardIndex: number;
  /** Longest stick in the same material group, used to scale this stick's
   *  rendered width so different stock lengths read at relative size. */
  maxLengthM: number;
}>();

const formatDistance = useFormatDistance();

const colors = computed(() => getMaterialColor(props.layout.stock.color));

const length = computed(() => formatDistance(props.layout.stock.lengthM) ?? '');
const wasteLabel = computed(() =>
  props.layout.wasteEndM > 0
    ? (formatDistance(props.layout.wasteEndM) ?? '')
    : '',
);

const stickStyle = computed(() => {
  const widthPct =
    props.maxLengthM > 0
      ? (props.layout.stock.lengthM / props.maxLengthM) * 100
      : 100;
  return [
    `background:${colors.value.board}`,
    `--chip-color:${colors.value.part}`,
    `--chip-text:${colors.value.text}`,
    `width:${widthPct}%`,
  ].join(';');
});

const cutCount = computed(() => props.layout.placements.length);

interface ChipView {
  key: string;
  leftPct: number;
  widthPct: number;
  label: string;
}

const chips = computed<ChipView[]>(() => {
  const totalM = props.layout.stock.lengthM;
  if (totalM <= 0) return [];
  return props.layout.placements.map((p) => ({
    key: `${p.partNumber}:${p.instanceNumber}`,
    leftPct: (p.offsetM / totalM) * 100,
    widthPct: (p.lengthM / totalM) * 100,
    label: `${p.partNumber} · ${formatDistance(p.lengthM) ?? ''}`,
  }));
});

const wasteStyle = computed(() => {
  const totalM = props.layout.stock.lengthM;
  const waste = props.layout.wasteEndM;
  if (totalM <= 0 || waste <= 0) return null;
  const leftPct = ((totalM - waste) / totalM) * 100;
  const widthPct = (waste / totalM) * 100;
  return `left:${leftPct}%;width:${widthPct}%`;
});
</script>

<template>
  <li
    class="flex flex-col gap-1.5 linear-stick"
    :aria-label="`Stick ${boardIndex + 1}: ${layout.stock.material} ${length}`"
  >
    <div
      class="stick-bar relative h-10 rounded overflow-hidden shadow-md shadow-black/30 border border-subtle"
      :style="stickStyle"
    >
      <div
        v-for="chip in chips"
        :key="chip.key"
        class="cut-chip absolute top-0 bottom-0 flex items-center justify-center px-1 border-r border-black/30 last:border-r-0"
        :style="`left:${chip.leftPct}%;width:${chip.widthPct}%`"
        :title="chip.label"
      >
        <span class="chip-label text-[11px] font-semibold whitespace-nowrap">
          {{ chip.label }}
        </span>
      </div>
      <div
        v-if="wasteStyle"
        class="waste-tail absolute top-0 bottom-0 pointer-events-none"
        :style="wasteStyle"
        :aria-label="`waste ${wasteLabel}`"
      />
    </div>
    <div class="text-xs text-muted flex items-center gap-2">
      <span>#{{ boardIndex + 1 }}</span>
      <span>{{ length }} stick</span>
      <span aria-hidden="true">&middot;</span>
      <span>{{ cutCount }} {{ cutCount === 1 ? 'cut' : 'cuts' }}</span>
      <template v-if="wasteLabel">
        <span aria-hidden="true">&middot;</span>
        <span>{{ wasteLabel }} waste</span>
      </template>
    </div>
  </li>
</template>

<style scoped>
.cut-chip {
  background: var(--chip-color, #67787c);
  color: var(--chip-text, #222);
}
.chip-label {
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 100%;
}
.waste-tail {
  background-image: repeating-linear-gradient(
    45deg,
    rgba(255, 255, 255, 0.08),
    rgba(255, 255, 255, 0.08) 4px,
    rgba(0, 0, 0, 0.35) 4px,
    rgba(0, 0, 0, 0.35) 8px
  );
  border-left: 1px dashed rgba(255, 255, 255, 0.25);
}
</style>
