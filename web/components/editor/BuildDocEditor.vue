<script lang="ts" setup>
import type { JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import FileHandler from '@tiptap/extension-file-handler';
import Typography from '@tiptap/extension-typography';
import { ImageBlock } from '~/lib/editor/imageBlock';
import { SceneBlock } from '~/lib/editor/sceneBlock';

const props = withDefaults(
  defineProps<{
    modelValue: JSONContent;
    projectId: string;
    placeholder?: string;
    editable?: boolean;
  }>(),
  { editable: true },
);

const emit = defineEmits<{
  'update:modelValue': [doc: JSONContent];
  blur: [];
}>();

const { uploadImageAsset } = useDocAssets();
const toast = useToast();

// ─── Editor ───────────────────────────────────────────────────────────────

// Tracks the last doc the editor emitted, so we can distinguish prop
// changes that originated inside the editor (we emitted them; the host
// echoed them back) from external writes (project switch) that need to
// be pushed into the editor. Reference equality is enough because we
// keep the same object identity through the round-trip.
let lastEmitted: JSONContent | null = null;

/**
 * Upload N files in parallel, then insert successful ones in order.
 * Each failure surfaces a toast (oversize, unsupported MIME, etc.)
 * without blocking the rest of the batch.
 */
async function insertImageFilesAt(files: File[], pos: number) {
  const projectId = props.projectId;
  if (!projectId || files.length === 0) return;

  // Uploads are independent — fire them in parallel.
  const uploads = await Promise.allSettled(
    files.map((f) => uploadImageAsset(f, projectId)),
  );

  // If the user switched projects mid-upload, the editor now displays a
  // different doc. Inserting an asset whose projectId belongs to the
  // previous project would create a dangling cross-project reference;
  // bail and leave the asset orphaned in its original project instead.
  if (props.projectId !== projectId) return;

  const ed = editor.value;
  if (!ed) return;

  let cursor = pos;
  for (const result of uploads) {
    if (result.status === 'rejected') {
      const message =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      toast.add({
        title: "Couldn't add image",
        description: message,
        color: 'error',
      });
      continue;
    }
    ed.chain()
      .insertContentAt(cursor, {
        type: 'imageBlock',
        attrs: { assetId: result.value.id, caption: '' },
      })
      .run();
    // Advance past the inserted atom block so subsequent images stack
    // below rather than overwriting each other.
    cursor = ed.state.selection.from;
  }
}

const editor = useEditor({
  content: props.modelValue,
  editable: props.editable,
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
    // Smart-quote / em-dash / ellipsis input rules for editorial prose.
    Typography,
    ImageBlock,
    SceneBlock,
    // Owns drop/paste detection for filesystem files: preventDefault,
    // posAtCoords, and the "is this an internal drag?" check are all
    // handled inside the extension. We just receive the File array and
    // a target position. `uploadImageAsset` enforces MIME + size.
    FileHandler.configure({
      onDrop: (_editor, files, pos) => {
        void insertImageFilesAt(files, pos);
      },
      onPaste: (editor, files) => {
        void insertImageFilesAt(files, editor.state.selection.from);
      },
    }),
  ],
  editorProps: {
    attributes: {
      class:
        'tiptap-doc focus:outline-none min-h-[60vh] text-base text-body leading-relaxed',
    },
  },
  onUpdate({ editor }) {
    const json = editor.getJSON();
    lastEmitted = json;
    emit('update:modelValue', json);
  },
  onBlur() {
    emit('blur');
  },
});

watch(
  () => props.modelValue,
  (value) => {
    if (!editor.value) return;
    if (value === lastEmitted) return;
    editor.value.commands.setContent(value, { emitUpdate: false });
    lastEmitted = value;
  },
);

watch(
  () => props.editable,
  (value) => {
    editor.value?.setEditable(value);
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
      v-if="editable"
      class="sticky top-0 z-10 -mx-2 px-2 py-2 bg-base backdrop-blur flex items-center gap-1 flex-wrap"
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
</style>
