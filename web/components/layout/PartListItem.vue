<script lang="ts" setup>
import {
  ONE_INCH_UM,
  type Micrometres,
  type SheetBoardLayoutPlacement,
} from 'cutlist';

const props = defineProps<{
  placement: SheetBoardLayoutPlacement;
  index: number;
}>();

const hoveredIndex = inject<Ref<number | null>>(
  'layoutHoveredIndex',
  ref(null),
);
const isHovered = computed(() => hoveredIndex.value === props.index);
const { manualMode } = useManualLayout();

const toggleGrainLock = inject<(index: number) => void>(
  'layoutToggleGrainLock',
  () => {},
);

function onKeyActivate() {
  toggleGrainLock(props.index);
}

const getPx = useGetPx();

const widthUm = computed(
  () => (props.placement.rightUm - props.placement.leftUm) as Micrometres,
);
const heightUm = computed(
  () => (props.placement.topUm - props.placement.bottomUm) as Micrometres,
);

const width = computed(() => getPx(widthUm.value));
const height = computed(() => getPx(heightUm.value));
const left = computed(() => getPx(props.placement.leftUm));
const bottom = computed(() => getPx(props.placement.bottomUm));

const allowanceWidthPx = computed(() =>
  props.placement.allowanceWidthUm > 0
    ? getPx(props.placement.allowanceWidthUm)
    : null,
);
const allowanceLengthPx = computed(() =>
  props.placement.allowanceLengthUm > 0
    ? getPx(props.placement.allowanceLengthUm)
    : null,
);

const fontSize = computed(() =>
  getPx(Math.min(widthUm.value / 2, ONE_INCH_UM) as Micrometres),
);

/** Clamped 14–28 px so the icon stays legible on tiny parts. */
const iconSize = computed(() => {
  const minDim = Math.min(widthUm.value, heightUm.value);
  const raw = parseFloat(getPx((minDim * 0.45) as Micrometres));
  return `${Math.max(14, Math.min(28, raw))}px`;
});

const { showPartNumbers, showBomName } = useProjectSettings();
</script>

<template>
  <div
    class="absolute"
    :class="{
      'is-hovered': isHovered,
      'cursor-grab': manualMode,
      'cursor-pointer': !manualMode,
    }"
    :style="`bottom:${bottom};left:${left}`"
    role="button"
    tabindex="0"
    :aria-label="`Part ${placement.partNumber}: ${placement.name}`"
    @keydown.enter.prevent="onKeyActivate"
    @keydown.space.prevent="onKeyActivate"
  >
    <div
      class="overflow-hidden relative rounded-xs part-piece transition-colors"
      :style="`width:${width};height:${height}`"
    >
      <div
        v-if="allowanceWidthPx"
        class="absolute top-0 right-0 bottom-0 part-allowance pointer-events-none"
        :style="`width:${allowanceWidthPx}`"
        aria-hidden="true"
      />
      <div
        v-if="allowanceLengthPx"
        class="absolute top-0 left-0 right-0 part-allowance pointer-events-none"
        :style="`height:${allowanceLengthPx}`"
        aria-hidden="true"
      />
      <p
        v-if="showPartNumbers"
        class="w-full text-clip part-number text-right p-px font-semibold"
        :style="`font-size:${fontSize};line-height:${fontSize}`"
      >
        {{ placement.partNumber }}
      </p>
      <p
        v-if="showBomName"
        class="absolute inset-x-0 bottom-0 part-name part-number text-center px-px pb-px font-medium overflow-hidden break-words"
        :style="`font-size:${fontSize};line-height:${fontSize}`"
        :title="placement.name"
      >
        {{ placement.name }}
      </p>
      <!-- Grain lock indicator (always visible when locked) -->
      <div
        v-if="placement.grainLock"
        class="absolute top-0.5 left-0.5 flex items-center gap-px part-grain"
      >
        <svg
          viewBox="0 0 24 24"
          :style="`width:${fontSize};height:${fontSize}`"
          aria-hidden="true"
        >
          <path
            v-if="placement.grainLock === 'length'"
            fill="currentColor"
            d="m11.95 7.95l-1.414 1.414L8 6.828V20H6V6.828L3.466 9.364L2.05 7.95L7 3zm10 8.1L17 21l-4.95-4.95l1.414-1.414l2.537 2.536L16 4h2v13.172l2.536-2.536z"
          />
          <path
            v-else
            fill="currentColor"
            d="M16.05 12.05L21 17l-4.95 4.95l-1.414-1.415L17.172 18H4v-2h13.172l-2.536-2.535zm-8.1-10l1.414 1.414l-2.536 2.535H20v2H6.828l2.536 2.536L7.95 11.95L3 7z"
          />
        </svg>
      </div>
      <!-- Affordance on hover: drag icon in manual mode, rotate icon otherwise -->
      <div
        v-if="isHovered"
        class="absolute inset-0 flex items-center justify-center pointer-events-none"
      >
        <svg
          v-if="manualMode"
          viewBox="0 0 24 24"
          :style="`width:${iconSize};height:${iconSize}`"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M13 6v5h5V7.75L22.25 12 18 16.25V13h-5v5h3.25L12 22.25 7.75 18H11v-5H6v3.25L1.75 12 6 7.75V11h5V6H7.75L12 1.75 16.25 6z"
          />
        </svg>
        <svg
          v-else
          viewBox="0 0 24 24"
          class="rotate-icon"
          :style="`width:${iconSize};height:${iconSize}`"
          aria-hidden="true"
        >
          <path
            fill="currentColor"
            d="M12 4a7.99 7.99 0 0 0-6.616 3.5H8v2H2v-6h2V6a9.98 9.98 0 0 1 8-4c5.523 0 10 4.477 10 10h-2a8 8 0 0 0-8-8m-8 8a8 8 0 0 0 14.616 4.5H16v-2h6v6h-2V18a9.98 9.98 0 0 1-8 4C6.477 22 2 17.523 2 12z"
          />
        </svg>
      </div>
    </div>
  </div>
</template>

<style scoped>
.part-piece {
  background: var(--part-color, #67787c);
}
.part-allowance {
  background: rgb(99 102 241 / 0.7);
}
.is-hovered .part-piece {
  background: var(--part-hover, #67787c);
}
.part-number {
  color: var(--part-text, #333);
}
.part-name {
  word-break: break-word;
  overflow-wrap: break-word;
  hyphens: auto;
}
.is-hovered .part-number {
  color: var(--part-text-hover, #111);
}
.part-grain {
  color: var(--part-grain, #555);
}
.is-hovered .part-grain {
  color: var(--part-text-hover, #111);
}

.rotate-icon {
  color: var(--part-text-hover, #111);
  animation: gentle-rock 1.8s ease-in-out infinite;
}

@keyframes gentle-rock {
  0%,
  100% {
    transform: rotate(0deg);
  }
  40% {
    transform: rotate(35deg);
  }
  60% {
    transform: rotate(25deg);
  }
}
</style>
