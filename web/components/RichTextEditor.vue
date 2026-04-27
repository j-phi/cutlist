<script lang="ts" setup>
import { EditorContent } from '@tiptap/vue-3';
import { useTiptapEditor } from '~/composables/useTiptapEditor';

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const { editor, addLink } = useTiptapEditor({
  modelValue: () => props.modelValue,
  onUpdate: (html) => emit('update:modelValue', html),
  placeholder: () => props.placeholder,
});
</script>

<template>
  <div class="rounded-md border border-subtle bg-surface overflow-hidden">
    <!-- Toolbar -->
    <div
      class="flex items-center gap-0.5 px-2 py-1 border-b border-subtle bg-default"
    >
      <UButton
        size="xs"
        icon="i-lucide-bold"
        color="neutral"
        :variant="editor?.isActive('bold') ? 'soft' : 'ghost'"
        @click="editor?.chain().focus().toggleBold().run()"
      />
      <UButton
        size="xs"
        icon="i-lucide-italic"
        color="neutral"
        :variant="editor?.isActive('italic') ? 'soft' : 'ghost'"
        @click="editor?.chain().focus().toggleItalic().run()"
      />
      <UButton
        size="xs"
        icon="i-lucide-list"
        color="neutral"
        :variant="editor?.isActive('bulletList') ? 'soft' : 'ghost'"
        @click="editor?.chain().focus().toggleBulletList().run()"
      />
      <UButton
        size="xs"
        icon="i-lucide-list-ordered"
        color="neutral"
        :variant="editor?.isActive('orderedList') ? 'soft' : 'ghost'"
        @click="editor?.chain().focus().toggleOrderedList().run()"
      />
      <div class="w-px h-4 bg-subtle mx-0.5" />
      <UButton
        size="xs"
        icon="i-lucide-link"
        color="neutral"
        :variant="editor?.isActive('link') ? 'soft' : 'ghost'"
        @click="addLink"
      />
    </div>
    <EditorContent :editor="editor" />
  </div>
</template>

<style>
.tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: var(--ui-text-dimmed);
}
</style>
