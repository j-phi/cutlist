<script lang="ts" setup>
/**
 * Inline-editable callout pill. Renders inside `AnnotationLabels` so the
 * parent positions it at the projected label point.
 *
 * Authoring loop is single-step: drop the callout, the input takes focus,
 * type a label, blur or Enter commits, Esc removes the draft. The draft
 * row was created by `createCalloutHandler` with `text: ''` so an inline
 * edit just patches it.
 *
 * The wrapper overlay disables pointer events globally so right-button
 * orbit still falls through to the canvas. The input opts back in via
 * `pointer-events: auto` while it's draft.
 */
import type { IdbCallout } from '~/composables/useIdb';
import { useAnnotations } from '~/composables/useAnnotations';

const props = defineProps<{
  annotation: IdbCallout;
  draft: boolean;
}>();

const annotationsApi = useAnnotations();

const text = ref(props.annotation.text);
const inputEl = ref<HTMLInputElement | null>(null);

watch(
  () => props.annotation.text,
  (t) => {
    if (!props.draft) text.value = t;
  },
);

watch(
  () => props.draft,
  async (isDraft) => {
    if (!isDraft) return;
    text.value = props.annotation.text;
    await nextTick();
    inputEl.value?.focus();
    inputEl.value?.select();
  },
  { immediate: true },
);

async function commit(): Promise<void> {
  const trimmed = text.value.trim();
  await annotationsApi.update(props.annotation.id, { text: trimmed });
}

async function cancel(): Promise<void> {
  await annotationsApi.remove(props.annotation.id);
}
</script>

<template>
  <div
    class="callout-label bg-elevated text-hi rounded-full px-3 py-1 text-sm shadow border border-subtle"
    :class="{ 'callout-draft': draft }"
    :style="{ pointerEvents: draft ? 'auto' : 'none', whiteSpace: 'nowrap' }"
  >
    <input
      v-if="draft"
      ref="inputEl"
      v-model="text"
      class="bg-transparent outline-none w-32 text-hi placeholder:text-dim"
      placeholder="Untitled"
      type="text"
      @blur="commit"
      @keydown.enter.prevent="commit"
      @keydown.esc.prevent="cancel"
    />
    <span v-else>{{ annotation.text || 'Untitled' }}</span>
  </div>
</template>
