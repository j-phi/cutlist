<script lang="ts" setup>
import { PROJECT_TABS, projectPath } from '~/utils/projectTabs';

const route = useRoute();
const { activeId } = useProjects();
const { isComputing } = useBoardLayoutsQuery();

const tabScroller = ref<HTMLElement | null>(null);
const canScrollLeft = ref(false);
const canScrollRight = ref(false);

function updateScrollState() {
  const el = tabScroller.value;
  if (!el) return;
  canScrollLeft.value = el.scrollLeft > 2;
  canScrollRight.value = el.scrollLeft + el.clientWidth < el.scrollWidth - 2;
}

function scrollBy(dir: -1 | 1) {
  tabScroller.value?.scrollBy({ left: dir * 120, behavior: 'smooth' });
}

function scrollToActiveTab(behavior: ScrollBehavior = 'auto') {
  const el = tabScroller.value;
  if (!el) return;
  const active = el.querySelector<HTMLElement>('.tab-link-active');
  if (!active) return;
  active.scrollIntoView({ inline: 'center', block: 'nearest', behavior });
}

let ro: ResizeObserver | null = null;

onMounted(() => {
  nextTick(() => scrollToActiveTab('auto'));
  const el = tabScroller.value;
  if (el) {
    el.addEventListener('scroll', updateScrollState, { passive: true });
    ro = new ResizeObserver(updateScrollState);
    ro.observe(el);
    updateScrollState();
  }
});

onBeforeUnmount(() => {
  const el = tabScroller.value;
  if (el) el.removeEventListener('scroll', updateScrollState);
  ro?.disconnect();
});

// Active-tab tracking for the auto-scroll behaviour. `route.path` changes
// on every tab navigation, which is what we want.
watch(
  () => route.path,
  () => {
    nextTick(() => {
      scrollToActiveTab('smooth');
      updateScrollState();
    });
  },
);
</script>

<template>
  <header class="flex flex-col shrink-0 relative z-10 bg-base">
    <div class="flex items-center border-b border-subtle">
      <div class="relative flex-1 min-w-0">
        <div ref="tabScroller" class="overflow-x-auto tab-nav-scroller">
          <ul
            role="tablist"
            aria-label="Project sections"
            class="flex w-max pl-2"
          >
            <li
              v-for="definition in PROJECT_TABS"
              :key="definition.id"
              class="shrink-0"
            >
              <NuxtLink
                :to="projectPath(activeId, definition.id)"
                replace
                role="tab"
                :aria-label="definition.label"
                active-class="text-teal-400 tab-link-active"
                :exact-active-class="
                  definition.urlSegment === ''
                    ? 'text-teal-400 tab-link-active'
                    : ''
                "
                class="group relative flex items-center gap-2 px-3 h-10 text-sm whitespace-nowrap transition-colors text-muted hover:text-body"
              >
                <span
                  class="shrink-0 inline-flex items-center justify-center"
                  style="width: 16px; height: 16px"
                  aria-hidden="true"
                >
                  <UIcon :name="definition.icon" class="w-4 h-4" />
                </span>
                <span>{{ definition.label }}</span>
              </NuxtLink>
            </li>
          </ul>
        </div>

        <!-- Left scroll arrow -->
        <Transition
          enter-active-class="transition-opacity duration-150"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-150"
          leave-to-class="opacity-0"
        >
          <button
            v-if="canScrollLeft"
            class="absolute left-0 top-0 z-10 flex items-center justify-center w-7 h-10 text-muted hover:text-body transition-colors bg-base border-r border-subtle"
            aria-label="Scroll tabs left"
            @click="scrollBy(-1)"
          >
            <UIcon name="i-lucide-chevron-left" class="w-4 h-4" />
          </button>
        </Transition>

        <!-- Right scroll arrow -->
        <Transition
          enter-active-class="transition-opacity duration-150"
          enter-from-class="opacity-0"
          leave-active-class="transition-opacity duration-150"
          leave-to-class="opacity-0"
        >
          <button
            v-if="canScrollRight"
            class="absolute right-0 top-0 z-10 flex items-center justify-center w-7 h-10 text-muted hover:text-body transition-colors bg-base border-l border-subtle"
            aria-label="Scroll tabs right"
            @click="scrollBy(1)"
          >
            <UIcon name="i-lucide-chevron-right" class="w-4 h-4" />
          </button>
        </Transition>
      </div>

      <Transition
        enter-active-class="transition-opacity duration-150"
        enter-from-class="opacity-0"
        enter-to-class="opacity-100"
        leave-active-class="transition-opacity duration-150"
        leave-from-class="opacity-100"
        leave-to-class="opacity-0"
      >
        <span
          v-if="isComputing"
          class="shrink-0 flex items-center gap-1.5 mx-2 text-xs text-muted"
          title="Recomputing layouts"
        >
          <UIcon
            name="i-lucide-loader-2"
            class="w-4 h-4 animate-spin text-teal-400"
          />
          <span class="hidden sm:inline">Updating&hellip;</span>
        </span>
      </Transition>
    </div>
  </header>
</template>

<style scoped>
.tab-nav-scroller {
  scrollbar-width: none;
}
.tab-nav-scroller::-webkit-scrollbar {
  display: none;
}
/* Active-tab underline. Doubles as the selector the auto-scroll uses to
   centre the active tab in the scroller. */
.tab-link-active {
  position: relative;
}
.tab-link-active::after {
  content: '';
  position: absolute;
  left: 0.5rem;
  right: 0.5rem;
  bottom: 0;
  height: 2px;
  background-color: rgb(45 212 191); /* teal-400 */
  border-radius: 9999px;
}
</style>
