<script lang="ts" setup>
import { listPlans } from '~/utils/plans';
import type { PlanSummary } from '~/utils/plans/types';

const plans = ref<PlanSummary[]>([]);
const loading = ref(true);
const error = ref<string | null>(null);

onMounted(async () => {
  try {
    plans.value = await listPlans();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});
</script>

<template>
  <div>
    <section
      class="relative overflow-hidden flex flex-col items-center text-center px-4 pt-20 pb-16"
    >
      <HeroBackdrop />
      <div class="relative z-10 max-w-2xl">
        <h1 class="text-3xl font-bold text-hi">Plans</h1>
        <p class="text-muted mt-3">
          A growing collection of woodworking projects you can open straight in
          Cutlist Studio. Each plan ships with the model, build doc, and a
          ready-to-cut bill of materials.
        </p>
      </div>
    </section>

    <div class="max-w-6xl mx-auto px-4 pb-12 -mt-6">
      <div v-if="loading" class="text-muted">Loading plans…</div>

      <div v-else-if="error" class="text-red-400">
        Couldn't load plans: {{ error }}
      </div>

      <div
        v-else-if="plans.length === 0"
        class="rounded-xl border border-subtle bg-surface p-8 text-center"
      >
        <UIcon name="i-lucide-hammer" class="w-8 h-8 text-dim mx-auto mb-3" />
        <p class="text-body font-medium">No plans yet.</p>
        <p class="text-sm text-muted mt-1">
          Be the first to contribute — see below.
        </p>
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <PlanCard v-for="plan in plans" :key="plan.slug" :plan="plan" />
      </div>

      <ContributeCard class="mt-16" />
    </div>
  </div>
</template>
