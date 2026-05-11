<script lang="ts" setup>
import type { JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Placeholder from '@tiptap/extension-placeholder';
import FileHandler from '@tiptap/extension-file-handler';
import Typography from '@tiptap/extension-typography';
import { ImageBlock } from '~/lib/editor/imageBlock';
import { SceneBlock } from '~/lib/editor/sceneBlock';
import { YoutubeBlock } from '~/lib/editor/youtubeBlock';
import { EDITOR_EDITABLE } from '~/lib/editor/editableInject';

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

// Embed NodeViews pull this to hide authoring chrome (drag handle,
// caption input, picker dropdowns) when the editor is in view mode.
provide(EDITOR_EDITABLE, toRef(props, 'editable'));

// In-flight drop/paste uploads. The toolbar-insert path has its own
// per-block "Compressing…" state inside `ImageBlockView`; this covers
// drop/paste, which otherwise gives no feedback during compression.
const pendingUploads = ref(0);

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

  pendingUploads.value += files.length;
  // Uploads are independent — fire them in parallel.
  const uploads = await Promise.allSettled(
    files.map((f) => uploadImageAsset(f, projectId)),
  );
  pendingUploads.value -= files.length;

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
    YoutubeBlock.configure({ nocookie: true, modestBranding: true }),
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

function insertYoutube() {
  const url = window.prompt('YouTube URL');
  if (!url) return;
  // `setYoutubeVideo` returns false (no insert) when the URL doesn't match
  // the YouTube regex — let the command be the single source of validation.
  const ok = editor.value?.chain().focus().setYoutubeVideo({ src: url }).run();
  if (ok === false) {
    toast.add({
      title: "Doesn't look like a YouTube URL",
      description: 'Paste a youtube.com or youtu.be link and try again.',
      color: 'error',
    });
  }
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
      <UButton
        size="xs"
        icon="i-lucide-youtube"
        color="neutral"
        variant="ghost"
        label="YouTube"
        @click="insertYoutube"
      />

      <div
        v-if="pendingUploads > 0"
        class="ml-auto flex items-center gap-2 text-xs text-muted"
        aria-live="polite"
      >
        <UIcon name="i-lucide-loader-circle" class="w-3.5 h-3.5 animate-spin" />
        <span>
          Compressing {{ pendingUploads }} image{{
            pendingUploads === 1 ? '' : 's'
          }}…
        </span>
      </div>
    </div>

    <EditorContent :editor="editor" />
  </div>
</template>

<!-- .tiptap-doc styles live in web/assets/css/build-doc.css so the
     read-only marketplace render uses the exact same surface. -->
