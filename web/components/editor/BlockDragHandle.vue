<script lang="ts" setup>
/**
 * Drag handle shared by every embed block (image, scene). ProseMirror
 * picks this up via `[data-drag-handle]`; without it the inner
 * `contenteditable="false"` content swallows the drag and drops never
 * land on a valid block position.
 *
 * Hover-reveal is driven by the parent's `group/embed` modifier — every
 * embed block must wrap with that group name so this handle fades in
 * when the user hovers the block.
 */
</script>

<template>
  <div
    data-drag-handle
    contenteditable="false"
    draggable="true"
    class="absolute -left-8 top-2 w-6 h-6 flex items-center justify-center rounded text-dim hover:text-body hover:bg-elevated cursor-grab active:cursor-grabbing opacity-0 group-hover/embed:opacity-100 transition-opacity"
    title="Drag to reorder"
  >
    <UIcon name="i-lucide-grip-vertical" class="w-4 h-4" />
  </div>
</template>
