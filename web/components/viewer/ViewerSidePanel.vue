<script lang="ts" setup>
/**
 * Collapsible left-side panel chrome — outer container, header (title +
 * collapse toggle), body slot. When collapsed, renders a thin tab pinned to
 * the panel edge with a vertical title that expands on click.
 */
const props = defineProps<{
  title: string;
  collapsed: boolean;
}>();

const emit = defineEmits<{
  'update:collapsed': [value: boolean];
}>();

function toggle() {
  emit('update:collapsed', !props.collapsed);
}
</script>

<template>
  <button
    v-if="props.collapsed"
    type="button"
    class="bg-base border-r border-subtle py-3 px-1.5 flex flex-col items-center justify-center gap-2 text-muted hover:text-hi transition-colors min-h-0 overflow-hidden"
    :title="`Show ${props.title}`"
    @click="toggle"
  >
    <UIcon name="i-lucide-chevron-right" class="text-base" />
    <span
      class="text-xs font-medium tracking-wider [writing-mode:vertical-rl] rotate-180"
    >
      {{ props.title }}
    </span>
  </button>

  <div
    v-else
    class="bg-base border-r border-subtle flex flex-col overflow-hidden min-h-0 w-72"
  >
    <div
      class="px-3 py-2 border-b border-subtle flex items-center gap-1 shrink-0"
    >
      <span class="text-xs font-medium text-hi flex-1">{{ props.title }}</span>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-chevron-left"
        :title="`Collapse ${props.title}`"
        @click="toggle"
      />
    </div>
    <div class="flex-1 min-h-0 flex flex-col overflow-hidden">
      <slot />
    </div>
  </div>
</template>
