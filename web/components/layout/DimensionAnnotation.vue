<script lang="ts" setup>
import type { Micrometres } from 'cutlist';
import type { RulerMeasurement } from '~/composables/useRulerStore';

const props = defineProps<{
  measurement: RulerMeasurement;
  boardWidthUm: Micrometres;
  boardLengthUm: Micrometres;
  preview?: boolean;
}>();

const emit = defineEmits<{
  remove: [];
  updateOffset: [offsetUm: Micrometres];
}>();

const formatDistance = useFormatDistance();
const getPx = useGetPx();

const ARROW_SIZE = 6;
const EXT_OVERSHOOT = 8;
const pendingRemove = ref(false);

const distanceUm = computed(
  () =>
    Math.abs(
      props.measurement.anchorBUm - props.measurement.anchorAUm,
    ) as Micrometres,
);
const label = computed(() => formatDistance(distanceUm.value) ?? '');
const minPx = computed(() =>
  parseFloat(
    getPx(
      Math.min(
        props.measurement.anchorAUm,
        props.measurement.anchorBUm,
      ) as Micrometres,
    ),
  ),
);
const maxPx = computed(() =>
  parseFloat(
    getPx(
      Math.max(
        props.measurement.anchorAUm,
        props.measurement.anchorBUm,
      ) as Micrometres,
    ),
  ),
);
const midPx = computed(() => (minPx.value + maxPx.value) / 2);
const offsetPx = computed(() => parseFloat(getPx(props.measurement.offsetUm)));
const isX = computed(() => props.measurement.axis === 'x');

function arrowH(tipX: number, y: number, direction: 1 | -1) {
  const bx = tipX - direction * ARROW_SIZE;
  return `${tipX},${y} ${bx},${y - ARROW_SIZE / 2} ${bx},${y + ARROW_SIZE / 2}`;
}
function arrowV(x: number, tipY: number, direction: 1 | -1) {
  const by = tipY - direction * ARROW_SIZE;
  return `${x},${tipY} ${x - ARROW_SIZE / 2},${by} ${x + ARROW_SIZE / 2},${by}`;
}

let dragging = false;

function onPointerDown(e: PointerEvent) {
  if (props.preview) return;
  e.stopPropagation();
  e.preventDefault();
  (e.target as SVGElement).closest('g')?.setPointerCapture(e.pointerId);
  dragging = true;
}

function onPointerMove(e: PointerEvent) {
  if (!dragging) return;
  const svgEl = (e.target as SVGElement).closest('svg');
  if (!svgEl) return;
  const rect = svgEl.getBoundingClientRect();

  const newOffsetUm = (
    isX.value
      ? ((rect.bottom - e.clientY) / rect.height) * props.boardLengthUm
      : ((e.clientX - rect.left) / rect.width) * props.boardWidthUm
  ) as Micrometres;
  const span = isX.value ? props.boardLengthUm : props.boardWidthUm;
  // Drag past either edge by 20 mm triggers remove on release.
  const slop = 20_000;
  pendingRemove.value = newOffsetUm < -slop || newOffsetUm > span + slop;
  emit('updateOffset', newOffsetUm);
}

function onPointerUp() {
  if (pendingRemove.value) emit('remove');
  pendingRemove.value = false;
  dragging = false;
}

function onLostPointerCapture() {
  if (pendingRemove.value) emit('remove');
  pendingRemove.value = false;
  dragging = false;
}
</script>

<template>
  <g
    :class="[
      preview
        ? 'dimension-preview'
        : pendingRemove
          ? 'dimension-removing'
          : 'dimension-annotation',
      !preview && 'cursor-grab active:cursor-grabbing',
    ]"
    :style="preview ? 'pointer-events: none' : 'pointer-events: all'"
    @pointerdown="onPointerDown"
    @pointermove="onPointerMove"
    @pointerup="onPointerUp"
    @lostpointercapture="onLostPointerCapture"
  >
    <template v-if="isX">
      <line
        :x1="minPx"
        :y1="0"
        :x2="minPx"
        :y2="offsetPx + EXT_OVERSHOOT"
        stroke="currentColor"
        stroke-width="1"
        stroke-opacity="0.4"
      />
      <line
        :x1="maxPx"
        :y1="0"
        :x2="maxPx"
        :y2="offsetPx + EXT_OVERSHOOT"
        stroke="currentColor"
        stroke-width="1"
        stroke-opacity="0.4"
      />
      <line
        :x1="minPx"
        :y1="offsetPx"
        :x2="maxPx"
        :y2="offsetPx"
        stroke="currentColor"
        stroke-width="2"
      />
      <polygon :points="arrowH(minPx, offsetPx, -1)" fill="currentColor" />
      <polygon :points="arrowH(maxPx, offsetPx, 1)" fill="currentColor" />
      <text
        :x="midPx"
        :y="offsetPx"
        text-anchor="middle"
        :transform="`scale(1,-1) translate(0,${-2 * offsetPx})`"
        dy="-6"
        fill="currentColor"
        font-size="14"
        font-family="ui-monospace, monospace"
      >
        {{ label }}
      </text>
    </template>

    <template v-else>
      <line
        :x1="0"
        :y1="minPx"
        :x2="offsetPx + EXT_OVERSHOOT"
        :y2="minPx"
        stroke="currentColor"
        stroke-width="1"
        stroke-opacity="0.4"
      />
      <line
        :x1="0"
        :y1="maxPx"
        :x2="offsetPx + EXT_OVERSHOOT"
        :y2="maxPx"
        stroke="currentColor"
        stroke-width="1"
        stroke-opacity="0.4"
      />
      <line
        :x1="offsetPx"
        :y1="minPx"
        :x2="offsetPx"
        :y2="maxPx"
        stroke="currentColor"
        stroke-width="2"
      />
      <polygon :points="arrowV(offsetPx, minPx, -1)" fill="currentColor" />
      <polygon :points="arrowV(offsetPx, maxPx, 1)" fill="currentColor" />
      <text
        :x="offsetPx"
        :y="midPx"
        text-anchor="middle"
        :transform="`rotate(-90,${offsetPx},${midPx}) scale(1,-1) translate(0,${-2 * midPx})`"
        dy="-6"
        fill="currentColor"
        font-size="14"
        font-family="ui-monospace, monospace"
      >
        {{ label }}
      </text>
    </template>
  </g>
</template>

<style scoped>
.dimension-annotation {
  color: #2dd4bf;
}
.dimension-removing {
  color: #ef4444;
}
.dimension-preview {
  color: #2dd4bf;
  opacity: 0.5;
}
</style>
