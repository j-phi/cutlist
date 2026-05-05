<script lang="ts" setup>
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import { ImageBlock } from '~/lib/editor/imageBlock';
import { SceneBlock } from '~/lib/editor/sceneBlock';

const props = defineProps<{
  modelValue: string;
  placeholder?: string;
}>();

const emit = defineEmits<{
  'update:modelValue': [html: string];
  blur: [];
}>();

// ─── Editor ───────────────────────────────────────────────────────────────

const editor = useEditor({
  content: props.modelValue,
  extensions: [
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      codeBlock: false,
      blockquote: false,
      horizontalRule: false,
      // StarterKit ships Link in v3 — configure it here rather than
      // re-adding `@tiptap/extension-link` (which logs a duplicate-name
      // warning at startup).
      link: { openOnClick: false },
    }),
    Placeholder.configure({
      placeholder: props.placeholder ?? 'Write something…',
    }),
    ImageBlock,
    SceneBlock,
  ],
  editorProps: {
    attributes: {
      class:
        'tiptap-doc focus:outline-none min-h-[60vh] text-base text-body leading-relaxed',
    },
  },
  onUpdate({ editor }) {
    emit('update:modelValue', editor.isEmpty ? '' : editor.getHTML());
  },
  onBlur() {
    emit('blur');
  },
});

// External writes (e.g. project switch, undo) flow through `modelValue` and
// are pushed into the editor without re-emitting `onUpdate`.
watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) return;
    const current = editor.value.isEmpty ? '' : editor.value.getHTML();
    if (value === current) return;
    editor.value.commands.setContent(value, { emitUpdate: false });
  },
);

onScopeDispose(() => {
  editor.value?.destroy();
});

// ─── Toolbar state ────────────────────────────────────────────────────────

type HeadingLevel = 0 | 1 | 2 | 3;

const activeHeading = computed<HeadingLevel>(() => {
  const e = editor.value;
  if (!e) return 0;
  if (e.isActive('heading', { level: 1 })) return 1;
  if (e.isActive('heading', { level: 2 })) return 2;
  if (e.isActive('heading', { level: 3 })) return 3;
  return 0;
});

function onHeadingChange(e: Event) {
  const level = Number((e.target as HTMLSelectElement).value) as HeadingLevel;
  const chain = editor.value?.chain().focus();
  if (!chain) return;
  if (level === 0) chain.setParagraph().run();
  else chain.toggleHeading({ level }).run();
}

function addLink() {
  const e = editor.value;
  if (!e) return;
  const prev = e.getAttributes('link').href ?? '';
  const url = window.prompt('URL', prev);
  if (url === null) return;
  const chain = e.chain().focus().extendMarkRange('link');
  if (url === '') chain.unsetLink().run();
  else chain.setLink({ href: url }).run();
}

function insertImage() {
  editor.value
    ?.chain()
    .focus()
    .insertContent({
      type: 'imageBlock',
      attrs: { assetId: '', caption: '' },
    })
    .run();
}

function insertScene() {
  editor.value
    ?.chain()
    .focus()
    .insertContent({
      type: 'sceneBlock',
      attrs: { modelId: '', sceneId: '', caption: '' },
    })
    .run();
}
</script>

<template>
  <div class="space-y-4">
    <!-- Single sticky toolbar — the only formatting affordance on the page. -->
    <div
      class="sticky top-0 z-10 -mx-2 px-2 py-2 bg-base/90 backdrop-blur flex items-center gap-1 flex-wrap"
    >
      <select
        :value="activeHeading"
        class="bg-transparent text-sm text-body border-0 focus:outline-none focus:ring-0 cursor-pointer pr-6 py-1"
        @change="onHeadingChange"
      >
        <option :value="0">Paragraph</option>
        <option :value="1">Heading 1</option>
        <option :value="2">Heading 2</option>
        <option :value="3">Heading 3</option>
      </select>

      <div class="w-px h-5 bg-subtle mx-1" />

      <UButton
        size="xs"
        icon="i-lucide-bold"
        color="neutral"
        :variant="editor?.isActive('bold') ? 'soft' : 'ghost'"
        @click="editor?.chain().focus().toggleBold().run()"
      />
      <UButton
        size="xs"
        icon="i-lucide-italic"
        color="neutral"
        :variant="editor?.isActive('italic') ? 'soft' : 'ghost'"
        @click="editor?.chain().focus().toggleItalic().run()"
      />
      <UButton
        size="xs"
        icon="i-lucide-list"
        color="neutral"
        :variant="editor?.isActive('bulletList') ? 'soft' : 'ghost'"
        @click="editor?.chain().focus().toggleBulletList().run()"
      />
      <UButton
        size="xs"
        icon="i-lucide-list-ordered"
        color="neutral"
        :variant="editor?.isActive('orderedList') ? 'soft' : 'ghost'"
        @click="editor?.chain().focus().toggleOrderedList().run()"
      />
      <UButton
        size="xs"
        icon="i-lucide-link"
        color="neutral"
        :variant="editor?.isActive('link') ? 'soft' : 'ghost'"
        @click="addLink"
      />

      <div class="w-px h-5 bg-subtle mx-1" />

      <UButton
        size="xs"
        icon="i-lucide-image"
        color="neutral"
        variant="ghost"
        label="Image"
        @click="insertImage"
      />
      <UButton
        size="xs"
        icon="i-lucide-box"
        color="neutral"
        variant="ghost"
        label="3D scene"
        @click="insertScene"
      />
    </div>

    <EditorContent :editor="editor" />
  </div>
</template>

<style>
/* ── Doc surface ─────────────────────────────────────────────────────── */

.tiptap-doc {
  /* Inline, transparent surface — no card chrome. */
  background: transparent;
  /* Modern serif for body copy. Headings, embeds, and UI chrome opt back
     into mono below — only paragraphs and lists read as editorial body. */
  font-family: var(--font-serif);
  font-size: 1.0625rem;
  line-height: 1.65;
  letter-spacing: -0.005em;
}

/* ── Headings ────────────────────────────────────────────────────────── */

.tiptap-doc h1,
.tiptap-doc h2,
.tiptap-doc h3 {
  /* Display headings stay in the app's UI font (JetBrains Mono) for
     contrast against the serif body. */
  font-family: var(--font-mono);
  letter-spacing: -0.02em;
  color: var(--ui-text-highlighted);
}
.tiptap-doc h1 {
  font-size: 2rem;
  line-height: 1.15;
  font-weight: 700;
  margin: 1.5em 0 0.4em;
}
.tiptap-doc h2 {
  font-size: 1.5rem;
  line-height: 1.2;
  font-weight: 700;
  margin: 1.2em 0 0.4em;
}
.tiptap-doc h3 {
  font-size: 1.2rem;
  line-height: 1.25;
  font-weight: 600;
  margin: 1em 0 0.3em;
}

/* ── Body blocks ─────────────────────────────────────────────────────── */

.tiptap-doc p {
  margin: 0 0 0.85em;
}
.tiptap-doc p:last-child {
  margin-bottom: 0;
}

.tiptap-doc ul {
  list-style: disc;
  padding-left: 1.25rem;
  margin: 0 0 0.85em;
}
.tiptap-doc ol {
  list-style: decimal;
  padding-left: 1.25rem;
  margin: 0 0 0.85em;
}
.tiptap-doc li {
  margin: 0.1em 0;
}

.tiptap-doc a {
  color: rgb(45 212 191); /* teal-400 */
  text-decoration: underline;
}
.tiptap-doc a:hover {
  color: rgb(94 234 212); /* teal-300 */
}

.tiptap-doc p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  float: left;
  height: 0;
  pointer-events: none;
  color: var(--ui-text-dimmed);
}

/* ── Embed blocks (image, scene) ─────────────────────────────────────── */

/*
 * `.doc-embed` is set on the live NodeViewWrapper of each embed block.
 * Tiptap's `parseHTML` / `renderHTML` round-trips them as `<image-block>`
 * and `<scene-block>` tags for storage; both selectors are unioned below
 * so saved-and-rehydrated content gets the same treatment in the rare
 * case it surfaces outside a node view.
 */
.tiptap-doc :is(.doc-embed, image-block, scene-block),
.tiptap-doc :is(.doc-embed, image-block, scene-block) * {
  /* Embed chrome (captions, picker dropdowns, helper text) keeps the UI
     mono so it doesn't pick up the serif body. */
  font-family: var(--font-mono);
  letter-spacing: normal;
}
.tiptap-doc :is(.doc-embed, image-block, scene-block) {
  font-size: 1rem;
  line-height: 1.5;
}

/*
 * Slight bleed: media blocks read as a half-step wider than the prose
 * column on viewports with room. The article wrapper has `px-6` (1.5rem)
 * padding, so we only bleed past the column once the viewport leaves
 * enough gutter to absorb it.
 */
@media (min-width: 64rem) {
  .tiptap-doc :is(.doc-embed, image-block, scene-block) {
    margin-left: -3rem;
    margin-right: -3rem;
  }
}
</style>
