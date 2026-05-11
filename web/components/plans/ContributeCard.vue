<script lang="ts" setup>
const SUBMIT_URL =
  'https://docs.google.com/forms/d/e/1FAIpQLSdnFqLkjyWvz_9rPZwnqymUHqMTKOmAFkYxhGkXUFHK_Zp2cQ/viewform';

const steps = [
  {
    n: '01',
    icon: 'i-lucide-package',
    title: 'Export',
    body: 'Finish your project in Studio and hit Export to grab the .cutlist file.',
  },
  {
    n: '02',
    icon: 'i-lucide-send',
    title: 'Submit',
    body: 'Drop it in the form with a title, a few photos, and a short blurb. Pick a license below.',
  },
  {
    n: '03',
    icon: 'i-lucide-sparkles',
    title: 'Ship',
    body: 'We review, polish, and publish. Your name goes on the card — and the world gets to build it.',
  },
];
</script>

<template>
  <section
    class="relative overflow-hidden rounded-2xl border border-subtle bg-surface px-6 py-12 sm:px-12 sm:py-14 flex flex-col items-center text-center"
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
      <code class="font-mono text-dim">.cutlist</code> export and a photo or two
      — the rest is on us.
    </p>

    <ol
      class="mt-10 grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 w-full max-w-3xl text-left"
    >
      <li
        v-for="step in steps"
        :key="step.n"
        class="relative rounded-xl border border-subtle bg-base/60 backdrop-blur p-5"
      >
        <span class="absolute top-3 right-3 text-xs font-mono text-dim">{{
          step.n
        }}</span>
        <UIcon :name="step.icon" class="w-5 h-5 text-teal-400" />
        <p class="mt-3 text-body font-semibold">{{ step.title }}</p>
        <p class="mt-1 text-sm text-muted">{{ step.body }}</p>
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
      Google sign-in required to attach your
      <code class="font-mono">.cutlist</code> file
    </p>

    <div
      class="mt-10 w-full max-w-3xl text-left rounded-xl border border-subtle bg-base/40 backdrop-blur p-5 sm:p-6"
    >
      <div class="flex items-center gap-2">
        <UIcon name="i-lucide-scale" class="w-4 h-4 text-teal-400" />
        <h3 class="text-sm font-semibold text-body uppercase tracking-wider">
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
            <span class="text-body font-medium">Anyone can build it</span> —
            modify it, share it, even sell what they make from it.
          </span>
        </li>
        <li class="flex gap-3">
          <UIcon
            name="i-lucide-check"
            class="w-4 h-4 mt-0.5 shrink-0 text-teal-400"
          />
          <span>
            <span class="text-body font-medium">They have to credit you</span>
            whenever they share or remix the plan.
          </span>
        </li>
        <li class="flex gap-3">
          <UIcon
            name="i-lucide-check"
            class="w-4 h-4 mt-0.5 shrink-0 text-teal-400"
          />
          <span>
            <span class="text-body font-medium">You keep the copyright.</span>
            You're granting permission, not handing it over.
          </span>
        </li>
      </ul>
      <p class="mt-4 text-xs text-dim">
        Prefer a different license (CC-BY-SA, CC-BY-NC, all rights reserved)?
        Mention it in the form and we'll work with you.
      </p>
    </div>
  </section>
</template>

<style scoped>
.contribute-cta:hover {
  box-shadow: 0 0 40px -8px rgba(20, 184, 166, 0.45);
}
</style>
