<script lang="ts" setup>
/**
 * Caption input shared by every embed block. Transparent at rest,
 * fills to a subtle surface on focus.
 */
defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [value: string];
}>();

function onInput(e: Event) {
  emit('update:modelValue', (e.target as HTMLInputElement).value);
}
</script>

<template>
  <input
    type="text"
    :value="modelValue"
    placeholder="Add a caption…"
    class="w-full px-2 py-1 bg-transparent text-sm text-muted placeholder:text-dim focus:outline-none focus:bg-surface focus:text-body rounded"
    @input="onInput"
  />
</template>
