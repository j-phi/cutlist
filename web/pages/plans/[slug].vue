<script lang="ts" setup>
import { generateHTML } from '@tiptap/html';
import { loadPlan } from '~/utils/plans';
import type { PlanManifest } from '~/utils/plans/types';
import { marketplaceExtensions } from '~/lib/editor/marketplaceExtensions';

const route = useRoute();
const slug = computed(() => String(route.params.slug));

const { importFromFile } = useImportProject();
const toast = useToast();

const manifest = ref<PlanManifest | null>(null);
const loading = ref(true);
const error = ref<string | null>(null);
const opening = ref(false);

const docHtml = computed(() => {
  if (!manifest.value?.doc) return '';
  try {
    return generateHTML(manifest.value.doc, marketplaceExtensions);
  } catch (err) {
    console.error('Failed to render plan doc', err);
    return '';
  }
});

onMounted(async () => {
  try {
    manifest.value = await loadPlan(slug.value);
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
});

async function openPlan() {
  if (!manifest.value || opening.value) return;
  opening.value = true;
  try {
    const base = useRuntimeConfig().app.baseURL || '/';
    const url = `${base.replace(/\/$/, '')}${manifest.value.cutlistUrl}`;
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch plan (${response.status})`);
    }
    const blob = await response.blob();
    const file = new File([blob], `${slug.value}.cutlist`, {
      type: blob.type || 'application/gzip',
    });
    await importFromFile(file);
  } catch (err) {
    toast.add({
      title: "Couldn't open plan",
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    });
  } finally {
    opening.value = false;
  }
}
</script>

<template>
  <div class="max-w-3xl mx-auto px-4 py-12">
    <NuxtLink
      to="/plans"
      class="inline-flex items-center gap-1.5 text-sm text-muted hover:text-body mb-8"
    >
      <UIcon name="i-lucide-arrow-left" class="w-4 h-4" />
      All plans
    </NuxtLink>

    <div v-if="loading" class="text-muted">Loading…</div>

    <div v-else-if="error || !manifest" class="text-red-400">
      Couldn't load this plan: {{ error ?? 'Not found' }}
    </div>

    <template v-else>
      <header class="mb-8">
        <h1 class="text-3xl font-bold text-hi">{{ manifest.title }}</h1>
        <p class="text-muted mt-3 text-lg">{{ manifest.description }}</p>
        <div v-if="manifest.tags.length" class="flex flex-wrap gap-1.5 mt-4">
          <span
            v-for="tag in manifest.tags"
            :key="tag"
            class="text-xs text-dim px-2 py-0.5 rounded-full bg-mist-900 border border-subtle"
          >
            {{ tag }}
          </span>
        </div>
        <p v-if="manifest.credit" class="text-sm text-dim mt-4">
          Contributed by {{ manifest.credit }}
        </p>
      </header>

      <div class="flex gap-3 mb-10">
        <button
          class="px-4 py-2.5 rounded-lg bg-teal-500 hover:bg-teal-400 active:bg-teal-600 text-black font-semibold text-sm transition-colors disabled:opacity-60 inline-flex items-center gap-2"
          :disabled="opening"
          @click="openPlan"
        >
          <UIcon
            v-if="opening"
            name="i-lucide-loader-2"
            class="w-4 h-4 animate-spin"
          />
          <UIcon v-else name="i-lucide-folder-open" class="w-4 h-4" />
          {{ opening ? 'Opening…' : 'Open in Studio' }}
        </button>
        <a
          :href="manifest.cutlistUrl"
          :download="`${slug}.cutlist`"
          class="px-4 py-2.5 rounded-lg border border-subtle bg-surface hover:bg-mist-800 text-muted hover:text-body text-sm transition-colors inline-flex items-center gap-2"
        >
          <UIcon name="i-lucide-download" class="w-4 h-4" />
          Download .cutlist
        </a>
      </div>

      <article v-if="docHtml" class="tiptap-doc" v-html="docHtml" />
    </template>
  </div>
</template>
