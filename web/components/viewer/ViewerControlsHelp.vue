<script lang="ts" setup>
/**
 * Compact help popover that explains the viewer's input controls.
 *
 * Mouse legend renders on hover-capable / fine-pointer devices; touch
 * legend renders on coarse-pointer / no-hover devices. The swap uses
 * CSS media queries rather than JS so SSR/hydration is irrelevant and
 * hybrid devices show whichever legend matches the current pointer.
 */
const open = ref(false);
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'top', align: 'end', sideOffset: 4 }"
  >
    <UButton
      size="sm"
      variant="soft"
      color="neutral"
      icon="i-lucide-circle-help"
      :ui="{ base: 'rounded-lg' }"
      title="Controls"
    />

    <template #content>
      <div class="px-3 py-2.5 flex flex-col gap-2 min-w-[160px]">
        <!-- Mouse legend (hover / fine pointer) -->
        <div class="mouse-legend flex flex-col gap-2">
          <div class="flex items-center gap-2.5">
            <svg
              width="18"
              height="24"
              viewBox="0 0 18 24"
              fill="none"
              class="shrink-0 text-muted"
            >
              <rect
                x="1"
                y="1"
                width="16"
                height="22"
                rx="8"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <path
                d="M17 13H9V5a8 8 0 0 1 8 8Z"
                fill="currentColor"
                fill-opacity="0.5"
              />
              <line
                x1="9"
                y1="5"
                x2="9"
                y2="13"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <rect
                x="6.5"
                y="6"
                width="5"
                height="5"
                rx="2"
                fill="currentColor"
                fill-opacity="0.3"
              />
            </svg>
            <span class="text-xs text-muted">Right-drag</span>
            <span class="text-xs text-body ml-auto pl-3">Orbit</span>
          </div>
          <div class="flex items-center gap-2.5">
            <svg
              width="18"
              height="24"
              viewBox="0 0 18 24"
              fill="none"
              class="shrink-0 text-muted"
            >
              <rect
                x="1"
                y="1"
                width="16"
                height="22"
                rx="8"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <line
                x1="9"
                y1="5"
                x2="9"
                y2="13"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <rect
                x="6.5"
                y="6"
                width="5"
                height="5"
                rx="2"
                fill="currentColor"
                fill-opacity="0.6"
              />
              <path
                d="M9 16v3M7 17l2 2 2-2"
                stroke="currentColor"
                stroke-width="1.25"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class="text-xs text-muted">Mid-drag</span>
            <span class="text-xs text-body ml-auto pl-3">Pan</span>
          </div>
          <div class="flex items-center gap-2.5">
            <svg
              width="18"
              height="24"
              viewBox="0 0 18 24"
              fill="none"
              class="shrink-0 text-muted"
            >
              <rect
                x="1"
                y="1"
                width="16"
                height="22"
                rx="8"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <line
                x1="9"
                y1="5"
                x2="9"
                y2="13"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <rect
                x="6.5"
                y="6"
                width="5"
                height="5"
                rx="2"
                fill="currentColor"
              />
            </svg>
            <span class="text-xs text-muted">Scroll</span>
            <span class="text-xs text-body ml-auto pl-3">Zoom</span>
          </div>
        </div>

        <!-- Touch legend (coarse pointer / no hover) -->
        <div class="touch-legend flex flex-col gap-2">
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-pointer" class="shrink-0 text-muted size-4" />
            <span class="text-xs text-muted">1 finger</span>
            <span class="text-xs text-body ml-auto pl-3">Orbit</span>
          </div>
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-move" class="shrink-0 text-muted size-4" />
            <span class="text-xs text-muted">2 fingers</span>
            <span class="text-xs text-body ml-auto pl-3">Pan</span>
          </div>
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-zoom-in" class="shrink-0 text-muted size-4" />
            <span class="text-xs text-muted">Pinch</span>
            <span class="text-xs text-body ml-auto pl-3">Zoom</span>
          </div>
        </div>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.mouse-legend,
.touch-legend {
  display: none;
}
@media (hover: hover) and (pointer: fine) {
  .mouse-legend {
    display: flex;
  }
}
@media (hover: none), (pointer: coarse) {
  .touch-legend {
    display: flex;
  }
}
</style>
