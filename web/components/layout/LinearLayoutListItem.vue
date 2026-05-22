<script lang="ts" setup>
import type { LinearBoardLayout } from 'cutlist';

const props = defineProps<{
  layout: LinearBoardLayout;
  boardIndex: number;
}>();

const formatDistance = useFormatDistance();
const getPx = useGetPx();
const { showPartNumbers, showBomName } = useProjectSettings();

const colors = computed(() => getMaterialColor(props.layout.stock.color));

const length = computed(
  () => formatDistance(props.layout.stock.lengthUm) ?? '',
);
const wasteLabel = computed(() =>
  props.layout.wasteEndUm > 0
    ? (formatDistance(props.layout.wasteEndUm) ?? '')
    : '',
);

const stickStyle = computed(() =>
  [
    `background:${colors.value.board}`,
    `--chip-color:${colors.value.part}`,
    `--chip-text:${colors.value.text}`,
    `width:${getPx(props.layout.stock.lengthUm)}`,
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
  const totalUm = props.layout.stock.lengthUm;
  if (totalUm <= 0) return [];
  return props.layout.placements.map((p) => {
    const lengthLabel = formatDistance(p.lengthUm) ?? '';
    const parts: string[] = [];
    if (showPartNumbers.value) parts.push(String(p.partNumber));
    if (showBomName.value) parts.push(p.name);
    parts.push(lengthLabel);
    return {
      key: `${p.partNumber}:${p.instanceNumber}`,
      leftPct: (p.offsetUm / totalUm) * 100,
      widthPct: (p.lengthUm / totalUm) * 100,
      allowancePct: (p.allowanceLengthUm / p.lengthUm) * 100,
      label: parts.join(' · '),
    };
  });
});

const wasteStyle = computed(() => {
  const totalUm = props.layout.stock.lengthUm;
  const waste = props.layout.wasteEndUm;
  if (totalUm <= 0 || waste <= 0) return null;
  const leftPct = ((totalUm - waste) / totalUm) * 100;
  const widthPct = (waste / totalUm) * 100;
  return `left:${leftPct}%;width:${widthPct}%`;
});
</script>

<template>
  <li
    class="flex flex-col gap-2 linear-stick"
    :aria-label="`Stick ${boardIndex + 1}: ${layout.stock.name} (${layout.stock.material}) ${length}`"
  >
    <div
      class="text-xs text-muted flex items-center gap-2 zoom-stable origin-bottom-left"
    >
      <span>#{{ boardIndex + 1 }}</span>
      <span class="text-body font-medium">{{ layout.stock.name }}</span>
      <span>{{ layout.stock.material }}</span>
      <span aria-hidden="true">&middot;</span>
      <span>{{ length }} stick</span>
      <span
        v-if="layout.stock.role === 'offcut'"
        class="text-[10px] font-semibold leading-none px-1.5 py-1 rounded bg-amber-500/20 text-amber-400 uppercase tracking-wider"
        title="From your existing offcut inventory"
        >Offcut</span
      >
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
