<script lang="ts" setup>
/**
 * Caption shared by every embed block. In edit mode it's a transparent
 * input that fills to a subtle surface on focus. In read-only mode it
 * renders as plain text — and renders nothing at all when empty, so
 * the unfilled placeholder doesn't leak into the published view.
 */
import { useEditable } from '~/lib/editor/useEditable';

defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

const editable = useEditable();

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    v-if="editable"
    type="text"
    :value="modelValue"
    placeholder="Add a caption…"
    class="w-full px-2 py-1 bg-transparent text-sm text-muted placeholder:text-dim focus:outline-none focus:bg-surface focus:text-body rounded"
    @input="onInput"
  />
  <p v-else-if="modelValue" class="px-2 py-1 text-sm text-muted text-center">
    {{ modelValue }}
  </p>
</template>
