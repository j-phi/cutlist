<script lang="ts" setup>
/**
 * Collapsible side-panel chrome — outer container, header (title + collapse
 * toggle), body slot. When collapsed, renders a thin tab pinned to the host
 * edge with a vertical title that expands on click.
 *
 * The `side` prop ('left' | 'right') controls which edge gets the border
 * and which way the chevron points. The host is responsible for placing
 * the panel in the correct grid/flex slot.
 */
const props = defineProps<{
  title: string;
  side: 'left' | 'right';
  collapsed: boolean;
}>();

const emit = defineEmits<{
  'update:collapsed': [value: boolean];
}>();

function toggle() {
  emit('update:collapsed', !props.collapsed);
}

const expandIcon = computed(() =>
  props.side === 'left' ? 'i-lucide-chevron-right' : 'i-lucide-chevron-left',
);
const collapseIcon = computed(() =>
  props.side === 'left' ? 'i-lucide-chevron-left' : 'i-lucide-chevron-right',
);
</script>

<template>
  <button
    v-if="props.collapsed"
    type="button"
    :class="[
      'bg-base border-subtle py-3 px-1.5 flex flex-col items-center justify-center gap-2 text-muted hover:text-hi transition-colors min-h-0 overflow-hidden',
      props.side === 'left' ? 'border-r' : 'border-l',
    ]"
    :title="`Show ${props.title}`"
    @click="toggle"
  >
    <UIcon :name="expandIcon" class="text-base" />
    <span
      class="text-xs font-medium tracking-wider [writing-mode:vertical-rl] rotate-180"
    >
      {{ props.title }}
    </span>
  </button>

  <div
    v-else
    :class="[
      'bg-base flex flex-col overflow-hidden min-h-0 w-72',
      props.side === 'left'
        ? 'border-r border-subtle'
        : 'border-l border-subtle',
    ]"
  >
    <div
      class="px-3 py-2 border-b border-subtle flex items-center gap-1 shrink-0"
    >
      <span class="text-xs font-medium text-hi flex-1">{{ props.title }}</span>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        :icon="collapseIcon"
        :title="`Collapse ${props.title}`"
        @click="toggle"
      />
    </div>
    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <slot />
    </div>
  </div>
</template>
