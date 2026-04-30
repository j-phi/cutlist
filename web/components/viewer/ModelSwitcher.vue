<script lang="ts" setup>
/**
 * Dropdown listing every enabled (non-manual) source model. Only mounted by
 * the host when there's more than one — single-model projects don't need a
 * switcher. The host owns positioning.
 */
interface ModelOption {
  id: string;
  filename: string;
}

const props = defineProps<{
  models: readonly ModelOption[];
  focusedIdx: number;
}>();

const emit = defineEmits<{
  'update:focusedIdx': [idx: number];
}>();

function onChange(e: Event) {
  emit('update:focusedIdx', Number((e.target as HTMLSelectElement).value));
}
</script>

<template>
  <select
    :value="String(props.focusedIdx)"
    class="model-select bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2 text-sm text-body hover:text-hi cursor-pointer appearance-none pr-8 focus:outline-none focus:border-default"
    @change="onChange"
  >
    <option
      v-for="(m, i) in props.models"
      :key="m.id"
      :value="String(i)"
      style="background: #161b1d; color: #e3e7e8"
    >
      {{ m.filename }}
    </option>
  </select>
</template>

<style scoped>
.model-select {
  background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca8ab' stroke-width='2'><path d='M6 9l6 6 6-6'/></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
</style>
