<script lang="ts" setup>
import type { SortKey } from '~/composables/useBomFilter';

const props = withDefaults(
  defineProps<{
    columnKey: SortKey;
    label: string;
    currentSort: SortKey;
    sortDir: 'asc' | 'desc';
    align?: 'left' | 'right';
    widthClass?: string;
    paddingClass?: string;
    unitSuffix?: string;
  }>(),
  { align: 'left', widthClass: '', paddingClass: 'px-4', unitSuffix: '' },
);

const emit = defineEmits<{ toggle: [key: SortKey] }>();

const ariaSort = computed(() =>
  props.currentSort === props.columnKey
    ? props.sortDir === 'asc'
      ? 'ascending'
      : 'descending'
    : 'none',
);

const isActive = computed(() => props.currentSort === props.columnKey);
const directionIcon = computed(() =>
  props.sortDir === 'asc' ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down',
);

const thClass = computed(() => [
  'py-2.5 text-xs font-medium text-muted tracking-wide cursor-pointer select-none hover:text-body transition-colors',
  props.align === 'right' ? 'text-right' : 'text-left',
  props.paddingClass,
  props.widthClass,
]);

const inlineClass = computed(() => [
  'inline-flex items-center gap-0.5',
  props.align === 'right' ? 'justify-end' : '',
]);

function onActivate() {
  emit('toggle', props.columnKey);
}
</script>

<template>
  <th
    :class="thClass"
    :aria-sort="ariaSort"
    role="columnheader"
    tabindex="0"
    @click="onActivate"
    @keydown.enter.prevent="onActivate"
    @keydown.space.prevent="onActivate"
  >
    <span :class="inlineClass">
      {{ label
      }}<span v-if="unitSuffix" class="text-dim font-normal"
        >({{ unitSuffix }})</span
      >
      <UIcon
        v-if="isActive"
        :name="directionIcon"
        class="w-3 h-3 text-teal-400"
      />
    </span>
  </th>
</template>
