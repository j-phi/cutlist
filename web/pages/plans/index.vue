<script lang="ts" setup>
import { listPlans } from '~/utils/plans';
import type { PlanSummary } from '~/utils/plans/types';

// TODO(matt): swap for the real form URL before merging.
const SUBMIT_URL = 'https://forms.gle/REPLACE_ME';

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
  <AppShell>
    <ClientOnly>
      <div class="flex-1 overflow-y-auto">
        <section
          class="relative overflow-hidden flex flex-col items-center text-center px-4 pt-20 pb-16"
        >
          <HeroBackdrop />
          <div class="relative z-10 max-w-2xl">
            <h1 class="text-3xl font-bold text-hi">Plans</h1>
            <p class="text-muted mt-3">
              A growing collection of woodworking projects you can open straight
              in Cutlist Studio. Each plan ships with the model, build doc, and
              a ready-to-cut bill of materials.
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
            <UIcon
              name="i-lucide-hammer"
              class="w-8 h-8 text-dim mx-auto mb-3"
            />
            <p class="text-body font-medium">No plans yet.</p>
            <p class="text-sm text-muted mt-1">
              Be the first to contribute — see below.
            </p>
          </div>

          <div
            v-else
            class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6"
          >
            <PlanCard v-for="plan in plans" :key="plan.slug" :plan="plan" />
          </div>

          <section
            class="relative mt-16 overflow-hidden rounded-2xl border border-subtle bg-surface"
          >
            <div
              class="relative z-10 px-6 py-12 sm:px-12 sm:py-14 flex flex-col items-center text-center"
            >
              <span
                class="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-teal-400/30 bg-teal-400/10 text-teal-400 text-xs font-semibold uppercase tracking-wider"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-teal-400" />
                Open for submissions
              </span>

              <h2 class="mt-5 text-2xl sm:text-3xl font-bold text-hi">
                Built something good? Share it.
              </h2>
              <p class="mt-3 text-muted max-w-xl">
                Plans are hand-curated and free for everyone. Send us your
                <code class="font-mono text-dim">.cutlist</code> export and a
                photo or two — the rest is on us.
              </p>

              <ol
                class="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 w-full max-w-3xl text-left"
              >
                <li
                  class="relative rounded-xl border border-subtle bg-base/60 backdrop-blur p-5"
                >
                  <span
                    class="absolute top-3 right-3 text-xs font-mono text-dim"
                    >01</span
                  >
                  <UIcon
                    name="i-lucide-package"
                    class="w-5 h-5 text-teal-400"
                  />
                  <p class="mt-3 text-body font-semibold">Export</p>
                  <p class="mt-1 text-sm text-muted">
                    Finish your project in Studio and hit
                    <span class="text-body font-mono">Export</span> to grab the
                    <code class="font-mono text-dim">.cutlist</code> file.
                  </p>
                </li>
                <li
                  class="relative rounded-xl border border-subtle bg-base/60 backdrop-blur p-5"
                >
                  <span
                    class="absolute top-3 right-3 text-xs font-mono text-dim"
                    >02</span
                  >
                  <UIcon name="i-lucide-send" class="w-5 h-5 text-teal-400" />
                  <p class="mt-3 text-body font-semibold">Submit</p>
                  <p class="mt-1 text-sm text-muted">
                    Drop it in the form with a title, a few photos, and a short
                    blurb. Pick a license below.
                  </p>
                </li>
                <li
                  class="relative rounded-xl border border-subtle bg-base/60 backdrop-blur p-5"
                >
                  <span
                    class="absolute top-3 right-3 text-xs font-mono text-dim"
                    >03</span
                  >
                  <UIcon
                    name="i-lucide-sparkles"
                    class="w-5 h-5 text-teal-400"
                  />
                  <p class="mt-3 text-body font-semibold">Ship</p>
                  <p class="mt-1 text-sm text-muted">
                    We review, polish, and publish. Your name goes on the card —
                    and the world gets to build it.
                  </p>
                </li>
              </ol>

              <a
                :href="SUBMIT_URL"
                target="_blank"
                rel="noopener"
                class="contribute-cta group mt-10 inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-black font-semibold text-base transition-all"
              >
                <UIcon name="i-lucide-send" class="w-4 h-4" />
                Submit a plan
                <UIcon
                  name="i-lucide-arrow-right"
                  class="w-4 h-4 transition-transform group-hover:translate-x-0.5"
                />
              </a>
              <p class="mt-3 text-xs text-dim">
                Takes 2 minutes · no account needed
              </p>

              <div
                class="mt-10 w-full max-w-3xl text-left rounded-xl border border-subtle bg-base/40 backdrop-blur p-5 sm:p-6"
              >
                <div class="flex items-center gap-2">
                  <UIcon name="i-lucide-scale" class="w-4 h-4 text-teal-400" />
                  <h3
                    class="text-sm font-semibold text-body uppercase tracking-wider"
                  >
                    Licensing, in plain English
                  </h3>
                </div>
                <p class="mt-3 text-sm text-muted">
                  We publish plans under
                  <a
                    href="https://creativecommons.org/licenses/by/4.0/"
                    target="_blank"
                    rel="noopener"
                    class="text-teal-400 hover:text-teal-300 underline underline-offset-2"
                    >CC-BY 4.0</a
                  >
                  by default. That means:
                </p>
                <ul class="mt-3 space-y-2 text-sm text-muted">
                  <li class="flex gap-3">
                    <UIcon
                      name="i-lucide-check"
                      class="w-4 h-4 mt-0.5 shrink-0 text-teal-400"
                    />
                    <span>
                      <span class="text-body font-medium"
                        >Anyone can build it</span
                      >
                      — modify it, share it, even sell what they make from it.
                    </span>
                  </li>
                  <li class="flex gap-3">
                    <UIcon
                      name="i-lucide-check"
                      class="w-4 h-4 mt-0.5 shrink-0 text-teal-400"
                    />
                    <span>
                      <span class="text-body font-medium"
                        >They have to credit you</span
                      >
                      whenever they share or remix the plan.
                    </span>
                  </li>
                  <li class="flex gap-3">
                    <UIcon
                      name="i-lucide-check"
                      class="w-4 h-4 mt-0.5 shrink-0 text-teal-400"
                    />
                    <span>
                      <span class="text-body font-medium"
                        >You keep the copyright.</span
                      >
                      You're granting permission, not handing it over.
                    </span>
                  </li>
                </ul>
                <p class="mt-4 text-xs text-dim">
                  Prefer a different license (CC-BY-SA, CC-BY-NC, all rights
                  reserved)? Mention it in the form and we'll work with you.
                </p>
              </div>
            </div>
          </section>
        </div>
      </div>
    </ClientOnly>
  </AppShell>
</template>

<style scoped>
.contribute-cta {
  box-shadow: 0 0 0 0 rgba(20, 184, 166, 0);
}
.contribute-cta:hover {
  box-shadow: 0 0 40px -8px rgba(20, 184, 166, 0.45);
}
</style>
