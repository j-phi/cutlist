<script lang="ts" setup>
import BuildDocEditor from '~/components/editor/BuildDocEditor.vue';
import { isBuildDocEmpty } from '~/composables/useBuildDoc';

const { activeProject } = useProjects();
const { doc, title, loadedId, setDoc, setTitle, flush } = useBuildDoc();

// 'view' renders read-only; 'edit' shows the toolbar + editable surface.
// We re-pick whenever the loaded project changes: an empty doc lands in
// the editor, a populated doc lands in the rendered view.
const mode = ref<'view' | 'edit'>('edit');

watch(
  loadedId,
  () => {
    mode.value = isBuildDocEmpty(doc.value) ? 'edit' : 'view';
  },
  { immediate: true },
);

// During a project switch `loadedId` lags `activeProject.id` while the
// next IDB read is in flight. We gate the whole header/editor block on
// this match so the user never sees (or types into) the placeholder
// EMPTY_DOC paired with the new project's identity.
const ready = computed(
  () => !!activeProject.value && loadedId.value === activeProject.value.id,
);

function onTitleInput(e: Event) {
  setTitle((e.target as HTMLInputElement).value);
}

function startEditing() {
  mode.value = 'edit';
}

function finishEditing() {
  void flush();
  mode.value = 'view';
}

onBeforeUnmount(() => {
  void flush();
});
</script>

<template>
  <div class="h-full overflow-y-auto bg-base">
    <article class="mx-auto max-w-3xl px-6 py-12 sm:py-16">
      <template v-if="ready && activeProject">
        <header class="mb-6 flex items-start justify-between gap-3">
          <input
            v-if="mode === 'edit'"
            type="text"
            :value="title"
            :placeholder="activeProject.name"
            aria-label="Build doc title"
            class="flex-1 min-w-0 bg-transparent text-3xl sm:text-4xl font-bold text-hi placeholder:text-dim leading-tight border-0 p-0 focus:outline-none focus:ring-0"
            @input="onTitleInput"
            @blur="flush"
          />
          <h1
            v-else
            class="flex-1 min-w-0 text-3xl sm:text-4xl font-bold text-hi leading-tight"
          >
            {{ title || activeProject.name }}
          </h1>

          <UButton
            v-if="mode === 'view'"
            size="sm"
            icon="i-lucide-pencil"
            color="neutral"
            variant="soft"
            label="Edit"
            class="shrink-0 mt-1"
            @click="startEditing"
          />
          <UButton
            v-else
            size="sm"
            icon="i-lucide-check"
            color="neutral"
            variant="soft"
            label="Done"
            class="shrink-0 mt-1"
            @click="finishEditing"
          />
        </header>

        <BuildDocEditor
          :model-value="doc"
          :project-id="activeProject.id"
          :editable="mode === 'edit'"
          placeholder="Write your build…"
          @update:model-value="setDoc"
          @blur="flush"
        />
      </template>

      <div
        v-else-if="!activeProject"
        class="flex flex-col items-center justify-center gap-3 py-24 text-center"
      >
        <UIcon name="i-lucide-book-open" class="w-10 h-10 text-dim" />
        <p class="text-sm text-muted">Create a project to get started.</p>
      </div>
    </article>
  </div>
</template>
