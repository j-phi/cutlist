<script lang="ts" setup>
import { PROJECT_TABS } from '~/utils/projectTabs';

const tab = useProjectTab();
const { isComputing } = useBoardLayoutsQuery();

const items = computed(() =>
  PROJECT_TABS.map((definition) => ({
    key: definition.id,
    label: definition.label,
    icon: definition.icon,
    active: tab.value === definition.id,
    onSelect: () => void (tab.value = definition.id),
  })),
);

const tabScroller = ref<HTMLElement | null>(null);

function scrollToActiveTab(behavior: ScrollBehavior = 'auto') {
  const el = tabScroller.value;
  if (!el) return;
  const active = el.querySelector<HTMLElement>('[data-tab-active="true"]');
  if (!active) return;
  active.scrollIntoView({ inline: 'center', block: 'nearest', behavior });
}

onMounted(() => {
  nextTick(() => scrollToActiveTab('auto'));
});

watch(tab, () => {
  nextTick(() => scrollToActiveTab('smooth'));
});
</script>

<template>
  <header class="flex flex-col shrink-0 relative z-10 bg-base">
    <div class="flex items-center border-b border-subtle">
      <div
        ref="tabScroller"
        class="flex-1 min-w-0 overflow-x-auto tab-nav-scroller"
      >
        <ul
          role="tablist"
          aria-label="Project sections"
          class="flex w-max pl-2"
        >
          <li
            v-for="item in items"
            :key="item.key"
            :data-tab-active="item.active ? 'true' : null"
            class="shrink-0"
          >
            <button
              role="tab"
              :aria-selected="item.active"
              :aria-label="item.label"
              class="group relative flex items-center gap-2 px-3 h-10 text-sm whitespace-nowrap transition-colors"
              :class="
                item.active ? 'text-teal-400' : 'text-muted hover:text-body'
              "
              @click="item.onSelect"
            >
              <span
                class="shrink-0 inline-flex items-center justify-center"
                style="width: 16px; height: 16px"
                aria-hidden="true"
              >
                <UIcon :name="item.icon" class="w-4 h-4" />
              </span>
              <span>{{ item.label }}</span>
              <span
                v-if="item.active"
                class="absolute inset-x-2 bottom-0 h-0.5 bg-teal-400 rounded-full"
                aria-hidden="true"
              />
            </button>
          </li>
        </ul>
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
      <ExportPdfButton class="shrink-0 mr-2" />
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
</style>
