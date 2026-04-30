<script lang="ts" setup>
/**
 * Inline-editable callout label. Renders inside `AnnotationLabels` so the
 * parent positions it at the projected label point.
 *
 * Two paths drive the textarea:
 *   - `draft` prop is true for a brand-new annotation that the author flow
 *     just created with empty text. Esc removes the row.
 *   - Internal `editing` ref toggles when the user clicks an existing label.
 *     Esc just exits edit mode — the persisted text is kept.
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

const editing = ref(false);
const text = ref(props.annotation.text);
const inputEl = ref<HTMLTextAreaElement | null>(null);
// Esc / Enter / blur all want to settle the draft once. Without this, an
// Enter-then-blur sequence would write twice and an Esc would be undone by
// a trailing blur.
let committed = false;

const isEditable = computed(() => props.draft || editing.value);

watch(
  () => props.annotation.text,
  (t) => {
    if (!isEditable.value) text.value = t;
  },
);

watch(
  isEditable,
  async (active) => {
    if (!active) return;
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
  editing.value = false;
  await annotationsApi.update(props.annotation.id, { text: trimmed });
}

async function cancel(): Promise<void> {
  if (committed) return;
  committed = true;
  if (editing.value) {
    // Existing annotation — bail out of edit mode without touching IDB.
    editing.value = false;
    return;
  }
  // Brand-new draft never settled — discard the row.
  await annotationsApi.remove(props.annotation.id);
}

function startEditing(): void {
  if (isEditable.value) return;
  editing.value = true;
}

async function onDelete(event: MouseEvent): Promise<void> {
  event.stopPropagation();
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
    class="callout-label group relative bg-elevated text-hi rounded-2xl px-3 py-1.5 text-sm shadow border border-subtle max-w-[280px]"
    :class="{ 'callout-draft': isEditable }"
    :style="{
      pointerEvents: 'auto',
      whiteSpace: 'pre-wrap',
      wordBreak: 'break-word',
      cursor: isEditable ? 'text' : 'pointer',
    }"
    @click="startEditing"
  >
    <textarea
      v-if="isEditable"
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
    <button
      v-if="!isEditable"
      type="button"
      data-testid="annotation-delete"
      aria-label="Delete annotation"
      class="absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-elevated border border-subtle text-muted hover:text-hi shadow"
      @click="onDelete"
    >
      <UIcon name="i-lucide-x" class="size-3" />
    </button>
  </div>
</template>
