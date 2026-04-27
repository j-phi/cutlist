import { onScopeDispose, watch } from 'vue';
import { useEditor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

export interface UseTiptapEditorOptions {
  /** Getter for the current modelValue (the prop). */
  modelValue: () => string;
  /** Called with the new HTML when the editor content changes. */
  onUpdate: (html: string) => void;
  /** Optional getter for the placeholder text. */
  placeholder?: () => string | undefined;
}

/**
 * Wires up a Tiptap editor with the project's standard extensions
 * (StarterKit minus headings/code blocks/blockquote/horizontal rule,
 * Link with `openOnClick: false`, and Placeholder), keeps it in sync
 * with an external `modelValue` getter, and tears the editor down when
 * the surrounding effect scope (or component) is disposed.
 */
export function useTiptapEditor(options: UseTiptapEditorOptions) {
  const { modelValue, onUpdate, placeholder } = options;

  const editor = useEditor({
    content: modelValue(),
    extensions: [
      StarterKit.configure({
        // Only keep the basics — no headings, code blocks, etc.
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      }),
      Link.configure({
        openOnClick: false,
      }),
      Placeholder.configure({
        placeholder: placeholder?.() ?? 'Description...',
      }),
    ],
    editorProps: {
      attributes: {
        class:
          'focus:outline-none min-h-[8rem] px-3 py-2 text-sm text-body leading-relaxed [&_a]:text-teal-400 [&_a]:underline [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_li]:mt-0.5 [&_p+p]:mt-1.5',
      },
    },
    onUpdate({ editor }) {
      const html = editor.isEmpty ? '' : editor.getHTML();
      onUpdate(html);
    },
  });

  watch(modelValue, (val) => {
    if (!editor.value) return;
    const current = editor.value.isEmpty ? '' : editor.value.getHTML();
    if (val !== current) {
      editor.value.commands.setContent(val, { emitUpdate: false });
    }
  });

  function addLink() {
    if (!editor.value) return;
    const prev = editor.value.getAttributes('link').href ?? '';
    const url = window.prompt('URL', prev);
    if (url === null) return;
    if (url === '') {
      editor.value.chain().focus().extendMarkRange('link').unsetLink().run();
    } else {
      editor.value
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: url })
        .run();
    }
  }

  onScopeDispose(() => {
    editor.value?.destroy();
  });

  return { editor, addLink };
}
