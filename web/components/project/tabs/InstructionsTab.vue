<script lang="ts" setup>
import BuildDocEditor from '~/components/editor/BuildDocEditor.vue';

const { activeProject } = useProjects();
const { html, title, setHtml, setTitle, flush } = useBuildDoc();

// `title` is optional on the doc record. While it's `undefined` (never set)
// the input shows the project name as a placeholder so the page feels
// prefilled. Once the user types — even clearing back to "" — we persist
// the explicit value and stop falling back.

function onTitleInput(e: Event) {
  setTitle((e.target as HTMLInputElement).value);
}

onBeforeUnmount(() => {
  void flush();
});
</script>

<template>
  <div class="h-full overflow-y-auto bg-base">
    <article class="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <template v-if="activeProject">
        <header class="mb-6">
          <input
            type="text"
            :value="title ?? ''"
            :placeholder="activeProject.name"
            aria-label="Build doc title"
            class="w-full bg-transparent text-3xl sm:text-4xl font-bold text-hi placeholder:text-dim leading-tight border-0 p-0 focus:outline-none focus:ring-0"
            @input="onTitleInput"
            @blur="flush"
          />
        </header>

        <BuildDocEditor
          :model-value="html"
          placeholder="Write your build…"
          @update:model-value="setHtml"
          @blur="flush"
        />
      </template>

      <div
        v-else
        class="flex flex-col items-center justify-center gap-3 py-24 text-center"
      >
        <UIcon name="i-lucide-book-open" class="w-10 h-10 text-dim" />
        <p class="text-sm text-muted">Create a project to get started.</p>
      </div>
    </article>
  </div>
</template>
