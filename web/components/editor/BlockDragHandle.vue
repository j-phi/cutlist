<script lang="ts" setup>
/**
 * Drag handle for every embed block. ProseMirror picks this up via
 * `[data-drag-handle]`; without it the inner `contenteditable="false"`
 * content swallows the drag. The hover-reveal needs the parent to set
 * `group/embed` for `group-hover/embed:` to fire.
 */
import { useEditable } from '~/lib/editor/useEditable';

const editable = useEditable();
</script>

<template>
  <div
    v-if="editable"
    data-drag-handle
    contenteditable="false"
    draggable="true"
    class="absolute -left-8 top-2 w-6 h-6 flex items-center justify-center rounded text-dim hover:text-body hover:bg-elevated cursor-grab active:cursor-grabbing opacity-0 group-hover/embed:opacity-100 transition-opacity"
    title="Drag to reorder"
  >
    <UIcon name="i-lucide-grip-vertical" class="w-4 h-4" />
  </div>
</template>
