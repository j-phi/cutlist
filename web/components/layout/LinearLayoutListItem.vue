<script lang="ts" setup>
import type { LinearBoardLayout } from 'cutlist';

const props = defineProps<{
  layout: LinearBoardLayout;
  boardIndex: number;
}>();

const formatDistance = useFormatDistance();
const getPx = useGetPx();
const { showPartNumbers } = useProjectSettings();

const colors = computed(() => getMaterialColor(props.layout.stock.color));

const length = computed(() => formatDistance(props.layout.stock.lengthM) ?? '');
const wasteLabel = computed(() =>
  props.layout.wasteEndM > 0
    ? (formatDistance(props.layout.wasteEndM) ?? '')
    : '',
);

const stickStyle = computed(() =>
  [
    `background:${colors.value.board}`,
    `--chip-color:${colors.value.part}`,
    `--chip-text:${colors.value.text}`,
    `width:${getPx(props.layout.stock.lengthM)}`,
  ].join(';'),
);

const cutCount = computed(() => props.layout.placements.length);

interface ChipView {
  key: string;
  leftPct: number;
  widthPct: number;
  label: string;
  /** Width of the trailing allowance strip, as % of the chip. */
  allowancePct: number;
}

const chips = computed<ChipView[]>(() => {
  const totalM = props.layout.stock.lengthM;
  if (totalM <= 0) return [];
  return props.layout.placements.map((p) => {
    const lengthLabel = formatDistance(p.lengthM) ?? '';
    return {
      key: `${p.partNumber}:${p.instanceNumber}`,
      leftPct: (p.offsetM / totalM) * 100,
      widthPct: (p.lengthM / totalM) * 100,
      allowancePct: (p.allowanceLengthM / p.lengthM) * 100,
      label: showPartNumbers.value
        ? `${p.partNumber} · ${lengthLabel}`
        : lengthLabel,
    };
  });
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
    class="flex flex-col gap-2 linear-stick"
    :aria-label="`Stick ${boardIndex + 1}: ${layout.stock.material} ${length}`"
  >
    <div
      class="text-xs text-muted flex items-center gap-2 zoom-stable origin-bottom-left"
    >
      <span>#{{ boardIndex + 1 }}</span>
      <span>{{ length }} stick</span>
      <span aria-hidden="true">&middot;</span>
      <span>{{ cutCount }} {{ cutCount === 1 ? 'cut' : 'cuts' }}</span>
      <template v-if="wasteLabel">
        <span aria-hidden="true">&middot;</span>
        <span>{{ wasteLabel }} waste</span>
      </template>
    </div>
    <div
      class="stick-bar relative h-10 rounded overflow-hidden shadow-md shadow-black/30 border border-subtle"
      :style="stickStyle"
    >
      <div
        v-for="chip in chips"
        :key="chip.key"
        class="cut-chip absolute top-0 bottom-0 flex items-center justify-center"
        :style="`left:${chip.leftPct}%;width:${chip.widthPct}%`"
        :title="chip.label"
      >
        <div
          v-if="chip.allowancePct > 0"
          class="chip-allowance absolute top-0 bottom-0 right-0 pointer-events-none"
          :style="`width:${chip.allowancePct}%`"
          aria-hidden="true"
        />
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
  </li>
</template>

<style scoped>
.cut-chip {
  background: var(--chip-color, #67787c);
  color: var(--chip-text, #222);
}
.chip-allowance {
  background: rgb(99 102 241 / 0.7);
}
.chip-label {
  text-overflow: ellipsis;
  overflow: hidden;
  max-width: 100%;
}
.waste-tail {
  background: rgb(0 0 0 / 0.35);
}
</style>
