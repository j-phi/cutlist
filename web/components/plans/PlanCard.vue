<script lang="ts" setup>
import type { PlanSummary } from '~/utils/plans/types';

defineProps<{ plan: PlanSummary }>();
</script>

<template>
  <NuxtLink
    :to="`/plans/${plan.slug}`"
    class="group flex flex-col rounded-xl border border-subtle bg-surface hover:border-mist-700 transition-colors overflow-hidden"
  >
    <div
      class="aspect-[4/3] bg-mist-950 overflow-hidden border-b border-subtle"
    >
      <img
        v-if="plan.hero"
        :src="plan.hero"
        :alt="plan.title"
        class="w-full h-full object-cover group-hover:scale-[1.02] transition-transform"
        loading="lazy"
      />
      <div
        v-else
        class="w-full h-full flex items-center justify-center text-dim"
      >
        <UIcon name="i-lucide-hammer" class="w-8 h-8" />
      </div>
    </div>

    <div class="p-4 flex flex-col gap-2 flex-1">
      <h3 class="text-hi font-semibold text-base">{{ plan.title }}</h3>
      <p class="text-sm text-muted line-clamp-3 flex-1">
        {{ plan.description }}
      </p>
      <div v-if="plan.tags.length" class="flex flex-wrap gap-1.5 mt-1">
        <span
          v-for="tag in plan.tags"
          :key="tag"
          class="text-xs text-dim px-2 py-0.5 rounded-full bg-mist-900 border border-subtle"
        >
          {{ tag }}
        </span>
      </div>
      <p v-if="plan.credit" class="text-xs text-dim mt-1">
        by {{ plan.credit }}
      </p>
    </div>
  </NuxtLink>
</template>
