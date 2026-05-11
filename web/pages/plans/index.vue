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

useHead({
  title: 'Free Woodworking Plans — Cutlist Studio',
  meta: [
    {
      name: 'description',
      content:
        'Free, downloadable woodworking plans for tables, shelves, cabinets, beds and more. Each plan opens straight in Cutlist Studio with a 3D model, build instructions, and a ready-to-cut bill of materials. Released under Creative Commons — no sign-up required.',
    },
    {
      name: 'keywords',
      content:
        'free woodworking plans, downloadable woodworking plans, DIY furniture plans, woodworking project plans, cutlist, bill of materials, 3D woodworking plans, open-source woodworking, creative commons woodworking, table plans, shelf plans, cabinet plans',
    },
    {
      property: 'og:title',
      content: 'Free Woodworking Plans — Cutlist Studio',
    },
    {
      property: 'og:description',
      content:
        'A growing library of free woodworking plans. Each one ships with a 3D model, build doc, and ready-to-cut bill of materials.',
    },
    { property: 'og:type', content: 'website' },
  ],
});
</script>

<template>
  <div>
    <section
      class="relative overflow-hidden flex flex-col items-center text-center px-4 pt-20 pb-16"
    >
      <HeroBackdrop position="top" />
      <div class="relative z-10 max-w-2xl">
        <h1 class="text-3xl font-bold text-hi">Free woodworking plans</h1>
        <p class="text-muted mt-3">
          A growing collection of woodworking projects you can open straight in
          Cutlist Studio. Each plan ships with the model, build doc, and a
          ready-to-cut bill of materials. This is just the beginning!
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
    </div>

    <!-- ───────────────────────────────────────────────────────────────────── -->
    <!-- WHAT'S IN A PLAN                                                      -->
    <!-- ───────────────────────────────────────────────────────────────────── -->
    <section class="py-20 px-4 border-t border-subtle">
      <div class="max-w-3xl mx-auto text-center">
        <h2
          class="text-teal-400 text-xs font-semibold uppercase tracking-wider mb-3"
        >
          What's in a plan
        </h2>
        <p class="text-2xl font-bold text-hi mb-4">
          More than a PDF — a complete project file
        </p>
        <p class="text-sm text-muted max-w-xl mx-auto">
          Most free woodworking plans online stop at a sketch and a few
          dimensions. Cutlist plans give you the whole project: an interactive
          3D model, build steps, and a bill of materials that's already
          optimized for the boards you'll buy.
        </p>
      </div>

      <div
        class="mt-12 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 max-w-5xl mx-auto"
      >
        <div class="flex flex-col gap-2">
          <UIcon name="i-lucide-box" class="w-5 h-5 text-teal-400" />
          <p class="text-body font-medium text-hi">Interactive 3D model</p>
          <p class="text-sm text-muted">
            Orbit, isolate, and explode the assembly to understand exactly how
            it goes together before you make a single cut.
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <UIcon name="i-lucide-list-checks" class="w-5 h-5 text-teal-400" />
          <p class="text-body font-medium text-hi">Bill of materials</p>
          <p class="text-sm text-muted">
            Every part listed with dimensions, grain direction, and material —
            ready to drop straight into the cutting optimizer.
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <UIcon name="i-lucide-layout-grid" class="w-5 h-5 text-teal-400" />
          <p class="text-body font-medium text-hi">Optimized cut layouts</p>
          <p class="text-sm text-muted">
            Pre-computed board layouts that minimise waste across plywood, MDF,
            and dimensional lumber.
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <UIcon name="i-lucide-book-open" class="w-5 h-5 text-teal-400" />
          <p class="text-body font-medium text-hi">Build instructions</p>
          <p class="text-sm text-muted">
            Step-by-step build doc with photos and embedded model scenes,
            written by the maker who designed the piece.
          </p>
        </div>
      </div>
    </section>

    <ContributeCard />
  </div>
</template>
