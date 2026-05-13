<script lang="ts" setup>
import type { Micrometres, SheetBoardLayout } from 'cutlist';
import type { SnapEdge } from '~/composables/useRulerStore';

const props = defineProps<{
  layout: SheetBoardLayout;
  boardIndex: number;
}>();

const {
  isRulerActive,
  pendingClick,
  startMeasurement,
  completeMeasurement,
  removeMeasurement,
  updateMeasurementOffset,
  getMeasurementsForBoard,
} = useRulerStore();

const getPx = useGetPx();

const snapEdges = computed<SnapEdge[]>(() => {
  const idx = props.boardIndex;
  const { widthUm: wUm, lengthUm: lUm } = props.layout.stock;
  const zero = 0 as Micrometres;
  const edges: SnapEdge[] = [
    { axis: 'x', positionUm: zero, boardIndex: idx },
    { axis: 'x', positionUm: wUm, boardIndex: idx },
    { axis: 'y', positionUm: zero, boardIndex: idx },
    { axis: 'y', positionUm: lUm, boardIndex: idx },
  ];
  for (const p of props.layout.placements) {
    edges.push({ axis: 'x', positionUm: p.leftUm, boardIndex: idx });
    edges.push({ axis: 'x', positionUm: p.rightUm, boardIndex: idx });
    edges.push({ axis: 'y', positionUm: p.bottomUm, boardIndex: idx });
    edges.push({ axis: 'y', positionUm: p.topUm, boardIndex: idx });
  }
  const seen = new Set<string>();
  return edges.filter((e) => {
    const key = `${e.axis}:${e.positionUm}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
});
const boardMeasurements = getMeasurementsForBoard(props.boardIndex);

const widthUm = computed(() => props.layout.stock.widthUm);
const lengthUm = computed(() => props.layout.stock.lengthUm);
const widthPx = computed(() => getPx(widthUm.value));
const heightPx = computed(() => getPx(lengthUm.value));

const SNAP_THRESHOLD_PX = 15;

const preClickEdge = ref<SnapEdge | null>(null);
const hoveredEdge = ref<SnapEdge | null>(null);
const previewOffsetUm = ref<Micrometres>(0 as Micrometres);

const previewMeasurement = computed(() => {
  if (!pendingClick.value || !hoveredEdge.value) return null;
  if (pendingClick.value.boardIndex !== props.boardIndex) return null;
  return {
    id: '__preview__',
    boardIndex: props.boardIndex,
    axis: pendingClick.value.edge.axis,
    anchorAUm: pendingClick.value.edge.positionUm,
    anchorBUm: hoveredEdge.value.positionUm,
    offsetUm: previewOffsetUm.value,
  };
});

function pickPoint(event: MouseEvent) {
  const el = event.currentTarget as HTMLElement;
  const rect = el.getBoundingClientRect();
  const fracX = (event.clientX - rect.left) / rect.width;
  const fracY = (rect.bottom - event.clientY) / rect.height;
  const xUm = (fracX * widthUm.value) as Micrometres;
  const yUm = (fracY * lengthUm.value) as Micrometres;
  const thresholdUm = ((SNAP_THRESHOLD_PX * widthUm.value) /
    rect.width) as Micrometres;
  return { xUm, yUm, thresholdUm };
}

function findNearestEdge(
  xUm: Micrometres,
  yUm: Micrometres,
  edges: SnapEdge[],
  thresholdUm: Micrometres,
): SnapEdge | null {
  let best: SnapEdge | null = null;
  let bestDist = Infinity;
  for (const edge of edges) {
    const dist =
      edge.axis === 'x'
        ? Math.abs(xUm - edge.positionUm)
        : Math.abs(yUm - edge.positionUm);
    if (dist < bestDist && dist < thresholdUm) {
      bestDist = dist;
      best = edge;
    }
  }
  return best;
}

function handleMouseMove(event: MouseEvent) {
  if (!isRulerActive.value) return;
  const { xUm, yUm, thresholdUm } = pickPoint(event);

  if (!pendingClick.value) {
    preClickEdge.value = findNearestEdge(
      xUm,
      yUm,
      snapEdges.value,
      thresholdUm,
    );
    return;
  }

  if (pendingClick.value.boardIndex !== props.boardIndex) return;

  preClickEdge.value = null;
  const pendingAxis = pendingClick.value.edge.axis;
  const sameAxisEdges = snapEdges.value.filter((e) => e.axis === pendingAxis);
  const nearest = findNearestEdge(xUm, yUm, sameAxisEdges, thresholdUm);

  if (!nearest || nearest.positionUm === pendingClick.value.edge.positionUm) {
    hoveredEdge.value = null;
    return;
  }

  hoveredEdge.value = nearest;
  previewOffsetUm.value = pendingAxis === 'x' ? yUm : xUm;
}

function handleMouseLeave() {
  preClickEdge.value = null;
  hoveredEdge.value = null;
}

function handleBoardClick(event: MouseEvent) {
  if (!isRulerActive.value) return;
  const { xUm, yUm, thresholdUm } = pickPoint(event);
  const nearest = findNearestEdge(xUm, yUm, snapEdges.value, thresholdUm);
  if (!nearest) return;

  if (!pendingClick.value) {
    startMeasurement(nearest);
    preClickEdge.value = null;
  } else {
    const defaultOffset = (nearest.axis === 'x' ? yUm : xUm) as Micrometres;
    completeMeasurement(nearest, defaultOffset);
    hoveredEdge.value = null;
  }
}
</script>

<template>
  <svg
    class="absolute inset-0 overflow-visible z-10"
    :class="{
      'pointer-events-none': !isRulerActive && boardMeasurements.length === 0,
    }"
    :style="
      isRulerActive ? 'pointer-events: all; cursor: crosshair' : undefined
    "
    :width="widthPx"
    :height="heightPx"
    :viewBox="`0 0 ${parseFloat(widthPx)} ${parseFloat(heightPx)}`"
    @mousedown.stop
    @click.stop="handleBoardClick"
    @mousemove="handleMouseMove"
    @mouseleave="handleMouseLeave"
  >
    <rect
      v-if="isRulerActive"
      x="0"
      y="0"
      :width="widthPx"
      :height="heightPx"
      fill="transparent"
    />
    <g :transform="`scale(1,-1) translate(0,-${parseFloat(heightPx)})`">
      <template v-if="preClickEdge">
        <line
          v-if="preClickEdge.axis === 'x'"
          :x1="getPx(preClickEdge.positionUm)"
          y1="0"
          :x2="getPx(preClickEdge.positionUm)"
          :y2="heightPx"
          stroke="#2dd4bf"
          stroke-width="2"
          stroke-opacity="0.4"
          class="pointer-events-none"
        />
        <line
          v-else
          x1="0"
          :y1="getPx(preClickEdge.positionUm)"
          :x2="widthPx"
          :y2="getPx(preClickEdge.positionUm)"
          stroke="#2dd4bf"
          stroke-width="2"
          stroke-opacity="0.4"
          class="pointer-events-none"
        />
      </template>

      <template v-if="pendingClick && pendingClick.boardIndex === boardIndex">
        <line
          v-if="pendingClick.edge.axis === 'x'"
          :x1="getPx(pendingClick.edge.positionUm)"
          y1="0"
          :x2="getPx(pendingClick.edge.positionUm)"
          :y2="heightPx"
          stroke="#2dd4bf"
          stroke-width="2"
          stroke-dasharray="6,4"
          class="pointer-events-none"
        />
        <line
          v-else
          x1="0"
          :y1="getPx(pendingClick.edge.positionUm)"
          :x2="widthPx"
          :y2="getPx(pendingClick.edge.positionUm)"
          stroke="#2dd4bf"
          stroke-width="2"
          stroke-dasharray="6,4"
          class="pointer-events-none"
        />
      </template>

      <DimensionAnnotation
        v-if="previewMeasurement"
        :measurement="previewMeasurement"
        :board-width-um="widthUm"
        :board-length-um="lengthUm"
        preview
      />

      <DimensionAnnotation
        v-for="m in boardMeasurements"
        :key="m.id"
        :measurement="m"
        :board-width-um="widthUm"
        :board-length-um="lengthUm"
        @remove="removeMeasurement(m.id)"
        @update-offset="(offset) => updateMeasurementOffset(m.id, offset)"
      />
    </g>
  </svg>
</template>
