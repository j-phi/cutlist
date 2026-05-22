<script lang="ts" setup>
import type {
  Micrometres,
  SheetBoardLayout,
  SheetBoardLayoutPlacement,
} from 'cutlist';
import { inject, computed, type ComputedRef } from 'vue';
import PartListItem from './PartListItem.vue';

const props = defineProps<{
  layout: SheetBoardLayout;
  boardIndex: number;
}>();

const getPx = useGetPx();
const formatDistance = useFormatDistance();
const { requestGrainLockChange } = useGrainLockConfirm();
const { isRulerActive, getMeasurementsForBoard } = useRulerStore();
const boardMeasurements = getMeasurementsForBoard(props.boardIndex);
const { manualMode, isDragging } = useManualLayout();

type StartPartDrag = (
  placement: SheetBoardLayoutPlacement,
  boardIndex: number,
  event: PointerEvent,
) => void;
const startPartDrag = inject<StartPartDrag>('startPartDrag', () => {});

interface DragPreview {
  boardIndex: number;
  leftUm: number;
  bottomUm: number;
  widthUm: number;
  heightUm: number;
}
const dragPreview = inject<ComputedRef<DragPreview | null>>(
  'dragPreview',
  computed(() => null),
);

const widthPx = computed(() => getPx(props.layout.stock.widthUm));
const heightPx = computed(() => getPx(props.layout.stock.lengthUm));

const width = computed(() => formatDistance(props.layout.stock.widthUm));
const length = computed(() => formatDistance(props.layout.stock.lengthUm));

const colors = computed(() => getMaterialColor(props.layout.stock.color));

const marginPx = computed(() => {
  const m = props.layout.marginUm;
  if (!m) return null;
  return getPx(m);
});

const boardStyle = computed(() =>
  [
    `width:${widthPx.value}`,
    `height:${heightPx.value}`,
    `background:${colors.value.board}`,
    `--part-color:${colors.value.part}`,
    `--part-hover:${colors.value.partHover}`,
    `--part-text:${colors.value.text}`,
    `--part-text-hover:${colors.value.textHover}`,
    `--part-grain:${colors.value.grain}`,
  ].join(';'),
);

const board = ref<HTMLDivElement>();
const hoveredIndex = ref<number | null>(null);
provide('layoutHoveredIndex', hoveredIndex);

function togglePartGrainLock(index: number) {
  const placement = props.layout.placements[index];
  if (!placement) return;
  requestGrainLockChange(placement.partNumber, placement.grainLock, placement);
}
provide('layoutToggleGrainLock', togglePartGrainLock);

function hitTest(e: PointerEvent): number | null {
  const el = board.value;
  if (!el) return null;
  const rect = el.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const u = (e.clientX - rect.left) / rect.width;
  const v = (e.clientY - rect.top) / rect.height;
  if (u < 0 || u > 1 || v < 0 || v > 1) return null;
  const { widthUm, lengthUm } = props.layout.stock;
  const xUm = u * widthUm;
  const yUm = (1 - v) * lengthUm;
  const placements = props.layout.placements;
  for (let i = 0; i < placements.length; i++) {
    const p = placements[i];
    if (
      xUm >= p.leftUm &&
      xUm <= p.rightUm &&
      yUm >= p.bottomUm &&
      yUm <= p.topUm
    ) {
      return i;
    }
  }
  return null;
}

function onPointerMove(e: PointerEvent) {
  hoveredIndex.value = isRulerActive.value ? null : hitTest(e);
}

function onPointerLeave() {
  hoveredIndex.value = null;
}

const CLICK_THRESHOLD = 5;

function onPointerDown(e: PointerEvent) {
  if (isRulerActive.value) return;
  const hit = hitTest(e);
  if (hit == null) return;
  const placement = props.layout.placements[hit];

  if (manualMode.value) {
    // In manual mode: drag to move the part; stationary click does nothing.
    const startX = e.clientX;
    const startY = e.clientY;
    let dragStarted = false;

    const onMove = (e2: PointerEvent) => {
      if (dragStarted) return;
      if (
        Math.hypot(e2.clientX - startX, e2.clientY - startY) >= CLICK_THRESHOLD
      ) {
        dragStarted = true;
        startPartDrag(placement, props.boardIndex, e2);
      }
    };
    const onUp = () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
    };
    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    return;
  }

  const startX = e.clientX;
  const startY = e.clientY;
  document.addEventListener(
    'pointerup',
    (e2) => {
      const dx = e2.clientX - startX;
      const dy = e2.clientY - startY;
      if (Math.hypot(dx, dy) >= CLICK_THRESHOLD) return;
      requestGrainLockChange(
        placement.partNumber,
        placement.grainLock,
        placement,
      );
    },
    { once: true },
  );
}

const hoveredPlacement = computed<SheetBoardLayoutPlacement | null>(() => {
  if (isDragging.value) return null;
  return hoveredIndex.value != null
    ? (props.layout.placements[hoveredIndex.value] ?? null)
    : null;
});

// Drop preview for this board during a drag.
const showPreview = computed(
  () => dragPreview.value?.boardIndex === props.boardIndex,
);

const previewStyle = computed(() => {
  if (!showPreview.value || !dragPreview.value) return null;
  const dp = dragPreview.value;
  return {
    left: getPx(dp.leftUm as Micrometres),
    bottom: getPx(dp.bottomUm as Micrometres),
    width: getPx(dp.widthUm as Micrometres),
    height: getPx(dp.heightUm as Micrometres),
  };
});

// Tooltip tracks the mouse cursor (teleported to body, fixed position).
const { x: mouseX, y: mouseY } = useMouse();
</script>

<template>
  <li
    class="flex flex-col items-center gap-3 shrink-0 board-li"
    :style="`contain-intrinsic-size:${widthPx} ${heightPx}`"
    :aria-label="`Board ${boardIndex + 1}: ${layout.stock.material} ${length} by ${width}`"
  >
    <span class="text-sm text-muted text-nowrap"
      >{{ length }} &times; {{ width }}</span
    >
    <div
      ref="board"
      class="rounded relative shadow-lg shadow-black/30"
      :style="boardStyle"
      :data-board-index="boardIndex"
      @pointermove="onPointerMove"
      @pointerleave="onPointerLeave"
      @pointerdown="onPointerDown"
    >
      <div
        v-if="marginPx"
        class="absolute border border-dashed border-white/25 rounded-sm pointer-events-none z-10"
        :style="{
          top: marginPx,
          left: marginPx,
          right: marginPx,
          bottom: marginPx,
        }"
      />
      <PartListItem
        v-for="(placement, i) of layout.placements"
        :key="`${placement.partNumber}-${i}`"
        :placement="placement"
        :index="i"
      />
      <BoardRulerOverlay
        v-if="isRulerActive || boardMeasurements.length > 0"
        :layout="layout"
        :board-index="boardIndex"
      />
      <!-- Snap indicator: shown while dragging a part over this board -->
      <div
        v-if="showPreview && previewStyle"
        data-snap-indicator
        class="absolute rounded-xs pointer-events-none border border-white/60"
        :style="{
          left: previewStyle.left,
          bottom: previewStyle.bottom,
          width: previewStyle.width,
          height: previewStyle.height,
          background: 'var(--part-color)',
          opacity: '0.35',
        }"
      />
    </div>
    <Teleport to="body">
      <div
        v-if="hoveredPlacement && (mouseX != 0 || mouseY != 0)"
        class="fixed w-px h-px z-50 pointer-events-none"
        :style="`left:${mouseX}px;top:${mouseY}px`"
      >
        <PartDetails
          class="translate-x-[-50%] translate-y-8 p-2 bg-elevated border border-default rounded shadow-xl w-max min-w-[256px] text-white"
          :part="hoveredPlacement"
          :placement="hoveredPlacement"
        />
      </div>
    </Teleport>
  </li>
</template>

<style scoped>
.board-li {
  content-visibility: auto;
}
</style>
