<script lang="ts" setup>
/**
 * Inline-editable callout label. Renders inside `AnnotationLabels` so the
 * parent positions it at the projected label point.
 *
 * Authoring loop is single-step: drop the callout, the textarea takes
 * focus, type a label (newlines allowed), blur or Cmd/Ctrl+Enter commits,
 * Esc removes the draft. The draft row was created by
 * `createCalloutHandler` with `text: ''` so an inline edit just patches it.
 *
 * The wrapper overlay disables pointer events globally so right-button
 * orbit still falls through to the canvas. The textarea opts back in via
 * `pointer-events: auto` while it's draft.
 *
 * Auto-grow: relies on CSS `field-sizing: content` (Chrome 123+, Safari 18)
 * with a `scrollHeight` fallback applied on input for older engines.
 */
import type { IdbCallout } from '~/composables/useIdb';
import { useAnnotations } from '~/composables/useAnnotations';

const props = defineProps<{
  annotation: IdbCallout;
  draft: boolean;
}>();

const annotationsApi = useAnnotations();

const text = ref(props.annotation.text);
const inputEl = ref<HTMLTextAreaElement | null>(null);
// Esc / Enter / blur all want to settle the draft once. Without this, an
// Enter-then-blur sequence would write twice and an Esc would be undone by
// a trailing blur.
let committed = false;

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
    committed = false;
    await nextTick();
    inputEl.value?.focus();
    inputEl.value?.select();
    autoResize();
  },
  { immediate: true },
);

async function commit(): Promise<void> {
  if (committed) return;
  committed = true;
  const trimmed = text.value.trim();
  await annotationsApi.update(props.annotation.id, { text: trimmed });
}

async function cancel(): Promise<void> {
  if (committed) return;
  committed = true;
  await annotationsApi.remove(props.annotation.id);
}

function autoResize(): void {
  const el = inputEl.value;
  if (!el) return;
  // Modern engines (`field-sizing: content`) auto-size from CSS — this
  // path is the fallback for browsers that ignore it. Setting height to
  // 'auto' first forces a shrink-to-fit before reading scrollHeight.
  el.style.height = 'auto';
  el.style.height = `${el.scrollHeight}px`;
}
</script>

<template>
  <div
    class="callout-label bg-elevated text-hi rounded-2xl px-3 py-1.5 text-sm shadow border border-subtle max-w-[280px]"
    :class="{ 'callout-draft': draft }"
    :style="{
      pointerEvents: draft ? 'auto' : 'none',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
    }"
  >
    <textarea
      v-if="draft"
      ref="inputEl"
      v-model="text"
      rows="1"
      class="bg-transparent outline-none w-full resize-none text-hi placeholder:text-dim block"
      style="field-sizing: content"
      placeholder="Untitled"
      @input="autoResize"
      @blur="commit"
      @keydown.escape.prevent="cancel"
      @keydown.meta.enter.prevent="commit"
      @keydown.ctrl.enter.prevent="commit"
    />
    <span v-else class="block">{{ annotation.text || 'Untitled' }}</span>
  </div>
</template>
