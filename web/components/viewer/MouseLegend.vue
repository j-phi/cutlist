<script lang="ts" setup>
/**
 * Mouse / touch legend overlay shown bottom-right of the viewer.
 *
 * One component handles both desktop and mobile via the `variant` prop —
 * the host decides which to render based on its own breakpoint visibility
 * (the original ModelTab markup used `hidden sm:flex` / `flex sm:hidden`
 * pairs). Keeping `variant` explicit (vs internal viewport detection) lets
 * the parent control container classes without a second media query.
 */
const props = defineProps<{
  variant: 'desktop' | 'mobile';
}>();

void props;
</script>

<template>
  <div
    class="bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2.5 flex flex-col gap-2"
  >
    <template v-if="variant === 'desktop'">
      <!-- Right-drag → Orbit -->
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
            y="5"
            width="16"
            height="18"
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
            x="7"
            y="8"
            width="4"
            height="5"
            rx="2"
            fill="currentColor"
            fill-opacity="0.3"
          />
        </svg>
        <span class="text-xs text-muted">Right-drag</span>
        <span class="text-xs text-body ml-auto pl-3">Orbit</span>
      </div>
      <!-- Middle-drag → Pan -->
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
            y="5"
            width="16"
            height="18"
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
            x="7"
            y="8"
            width="4"
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
      <!-- Scroll → Zoom -->
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
            y="5"
            width="16"
            height="18"
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
          <rect x="7" y="8" width="4" height="5" rx="2" fill="currentColor" />
        </svg>
        <span class="text-xs text-muted">Scroll</span>
        <span class="text-xs text-body ml-auto pl-3">Zoom</span>
      </div>
    </template>
    <template v-else>
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
    </template>
  </div>
</template>
