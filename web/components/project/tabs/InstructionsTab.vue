<script lang="ts" setup>
import BuildDocEditor from '~/components/editor/BuildDocEditor.vue';

const { activeProject } = useProjects();
const { doc, title, setDoc, setTitle, flush } = useBuildDoc();

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
            :value="title"
            :placeholder="activeProject.name"
            aria-label="Build doc title"
            class="w-full bg-transparent text-3xl sm:text-4xl font-bold text-hi placeholder:text-dim leading-tight border-0 p-0 focus:outline-none focus:ring-0"
            @input="onTitleInput"
            @blur="flush"
          />
        </header>

        <BuildDocEditor
          :model-value="doc"
          placeholder="Write your build…"
          @update:model-value="setDoc"
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
