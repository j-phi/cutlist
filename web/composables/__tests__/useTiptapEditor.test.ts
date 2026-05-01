/**
 * Outcome-based tests. Pattern: real Tiptap `Editor` (instantiated synchronously)
 * with real StarterKit/Link/Placeholder extensions, plus thin recording wrappers
 * around each extension's `configure()` so we can observe the option payloads
 * the SUT sends. Editor state (HTML, isEmpty, link attrs) is queried directly
 * rather than via mock metadata.
 *
 * Why a stubbed `useEditor`? The real one from `@tiptap/vue-3` calls
 * `onMounted`, which only fires inside a mounted component — and we test the
 * composable in a bare `effectScope`. The stub keeps the surface identical
 * (`{ content, extensions, onUpdate }` → `Ref<Editor>`) while skipping the
 * lifecycle plumbing.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope, type Ref } from 'vue';
import { Editor } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Placeholder from '@tiptap/extension-placeholder';

// ── Recording wrappers around real extensions ───────────────────────────────
//
// Each call site pushes its options into an array, then forwards to the real
// `configure()` so the editor still renders correctly. Tests assert against
// the captured arrays.

const starterKitConfigureCalls: Array<Record<string, unknown>> = [];
const linkConfigureCalls: Array<Record<string, unknown>> = [];
const placeholderConfigureCalls: Array<Record<string, unknown>> = [];

interface UseEditorOptions {
  content?: string;
  extensions?: unknown[];
  editorProps?: unknown;
  // Tiptap's onUpdate signature includes `transaction` and
  // `appendedTransactions`, but the SUT only reads `editor`. Accept the
  // broader signature so the type matches Tiptap's `EditorOptions`.
  onUpdate?: (props: {
    editor: Editor;
    transaction: unknown;
    appendedTransactions: unknown[];
  }) => void;
}

interface UseEditorCall {
  content?: string;
  extensions: unknown[];
  editor: Editor;
}
const useEditorCalls: UseEditorCall[] = [];

function resetRecordings() {
  starterKitConfigureCalls.length = 0;
  linkConfigureCalls.length = 0;
  placeholderConfigureCalls.length = 0;
  useEditorCalls.length = 0;
}

vi.mock('@tiptap/starter-kit', async () => {
  const actual = await vi.importActual<typeof import('@tiptap/starter-kit')>(
    '@tiptap/starter-kit',
  );
  return {
    default: {
      ...actual.default,
      configure: (opts: Record<string, unknown>) => {
        starterKitConfigureCalls.push(opts);
        return actual.default.configure(opts);
      },
    },
  };
});

vi.mock('@tiptap/extension-link', async () => {
  const actual = await vi.importActual<typeof import('@tiptap/extension-link')>(
    '@tiptap/extension-link',
  );
  return {
    default: {
      ...actual.default,
      configure: (opts: Record<string, unknown>) => {
        linkConfigureCalls.push(opts);
        return actual.default.configure(opts);
      },
    },
  };
});

vi.mock('@tiptap/extension-placeholder', async () => {
  const actual = await vi.importActual<
    typeof import('@tiptap/extension-placeholder')
  >('@tiptap/extension-placeholder');
  return {
    default: {
      ...actual.default,
      configure: (opts: Record<string, unknown>) => {
        placeholderConfigureCalls.push(opts);
        return actual.default.configure(opts);
      },
    },
  };
});

// `useEditor` from @tiptap/vue-3 calls `onMounted`, which doesn't fire outside
// a component. Replace it with a synchronous real-Editor factory that records
// the call so tests can introspect the inputs the composable provided.
vi.mock('@tiptap/vue-3', async () => {
  const actual =
    await vi.importActual<typeof import('@tiptap/vue-3')>('@tiptap/vue-3');
  return {
    ...actual,
    useEditor: (opts: UseEditorOptions) => {
      // Cast the new-Editor options through `unknown`: the @tiptap/vue-3
      // `Editor` extends @tiptap/core `Editor` with reactive props, and
      // the onUpdate signatures are nominally typed against @tiptap/core's
      // Editor — TypeScript can't see they're structurally compatible here.
      const editor = new actual.Editor({
        content: opts.content,
        extensions: opts.extensions,
        editorProps: opts.editorProps,
        onUpdate: opts.onUpdate,
      } as unknown as ConstructorParameters<typeof actual.Editor>[0]);
      useEditorCalls.push({
        content: opts.content,
        extensions: opts.extensions ?? [],
        editor,
      });
      return ref(editor);
    },
  };
});

// Import after mocks are set up.
import { useTiptapEditor } from '../useTiptapEditor';

// ── Helpers ─────────────────────────────────────────────────────────────────

function setup(initial = '<p>start</p>', placeholder?: string) {
  const modelValue = ref(initial);
  const placeholderRef = ref<string | undefined>(placeholder);
  const updates: string[] = [];
  const scope = effectScope();
  const result = scope.run(() =>
    useTiptapEditor({
      modelValue: () => modelValue.value,
      onUpdate: (html) => updates.push(html),
      placeholder: () => placeholderRef.value,
    }),
  )!;
  // The composable returns the same ref the stub pushed into useEditorCalls.
  const editor = useEditorCalls.at(-1)!.editor;
  return { modelValue, placeholderRef, updates, scope, result, editor };
}

beforeEach(() => {
  resetRecordings();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ── Tests ───────────────────────────────────────────────────────────────────

describe('useTiptapEditor', () => {
  describe('Initialization', () => {
    let scope: EffectScope;

    afterEach(() => {
      scope?.stop();
    });

    it('Should call useEditor with content from the modelValue getter', () => {
      const ctx = setup('<p>hello</p>');
      scope = ctx.scope;

      expect(useEditorCalls).toHaveLength(1);
      expect(useEditorCalls[0]!.content).toBe('<p>hello</p>');
      // Real editor renders the content.
      expect(ctx.editor.getHTML()).toContain('hello');
    });

    it('Should configure StarterKit with heading/codeBlock/blockquote/horizontalRule disabled', () => {
      const ctx = setup();
      scope = ctx.scope;

      expect(starterKitConfigureCalls).toEqual([
        {
          heading: false,
          codeBlock: false,
          blockquote: false,
          horizontalRule: false,
        },
      ]);
    });

    it('Should configure Link with openOnClick: false', () => {
      const ctx = setup();
      scope = ctx.scope;

      expect(linkConfigureCalls).toEqual([{ openOnClick: false }]);
    });

    it('Should configure Placeholder with the provided placeholder text', () => {
      const ctx = setup('<p>x</p>', 'My placeholder');
      scope = ctx.scope;

      expect(placeholderConfigureCalls).toEqual([
        { placeholder: 'My placeholder' },
      ]);
    });

    it('Should fall back to the default placeholder when none is provided', () => {
      const ctx = setup('<p>x</p>');
      scope = ctx.scope;

      expect(placeholderConfigureCalls).toEqual([
        { placeholder: 'Description...' },
      ]);
    });

    it('Should pass exactly three configured extension entries — StarterKit, Link, Placeholder — to useEditor', () => {
      const ctx = setup();
      scope = ctx.scope;

      const extensions = useEditorCalls[0]!.extensions;
      // StarterKit.configure → array of node/mark extensions; Link and
      // Placeholder.configure → single extension instances. The composable
      // forwards them to useEditor in this exact order.
      expect(extensions).toHaveLength(3);

      // Sanity-check that the resulting editor has Placeholder registered —
      // that's the one extension uniquely contributed here (StarterKit
      // bundles its own Link, but Placeholder isn't part of StarterKit).
      const names = new Set(
        ctx.editor.extensionManager.extensions.map((e) => e.name),
      );
      expect(names.has('placeholder')).toBe(true);
      expect(names.has('paragraph')).toBe(true);
      expect(names.has('heading')).toBe(false);
    });
  });

  describe('onUpdate callback', () => {
    let scope: EffectScope;

    afterEach(() => {
      scope?.stop();
    });

    it('Should forward the editor HTML to onUpdate when the editor content changes', () => {
      const { editor, updates, scope: s } = setup('<p>start</p>');
      scope = s;

      editor.commands.setContent('<p>edited</p>', { emitUpdate: true });

      expect(updates).toHaveLength(1);
      expect(updates[0]).toContain('edited');
    });

    it('Should pass an empty string when the editor reports isEmpty', () => {
      const { editor, updates, scope: s } = setup('<p>start</p>');
      scope = s;

      editor.commands.setContent('', { emitUpdate: true });

      expect(editor.isEmpty).toBe(true);
      expect(updates).toEqual(['']);
    });
  });

  describe('modelValue watcher', () => {
    let scope: EffectScope;

    afterEach(() => {
      scope?.stop();
    });

    it("Should update the editor's HTML and suppress onUpdate when the getter changes", async () => {
      const { editor, modelValue, updates, scope: s } = setup('<p>same</p>');
      scope = s;

      modelValue.value = '<p>different</p>';
      await nextTick();

      // The watcher applied the new content...
      expect(editor.getHTML()).toContain('different');
      // ...and used emitUpdate: false to keep onUpdate silent (otherwise we'd
      // get an infinite v-model echo loop).
      expect(updates).toEqual([]);
    });

    it('Should not touch the editor when the new value matches the current HTML', async () => {
      const { editor, modelValue, updates, scope: s } = setup('<p>same</p>');
      scope = s;
      const beforeHtml = editor.getHTML();

      modelValue.value = '<p>same</p>';
      await nextTick();

      // Still the same content, no update fired.
      expect(editor.getHTML()).toBe(beforeHtml);
      expect(updates).toEqual([]);
    });
  });

  describe('#addLink', () => {
    type PromptFn = (message?: string, _default?: string) => string | null;
    let originalPrompt: PromptFn;
    let scope: EffectScope;

    beforeEach(() => {
      originalPrompt = window.prompt;
    });

    afterEach(() => {
      window.prompt = originalPrompt;
      scope?.stop();
    });

    /** Replace `window.prompt` with a recorder that returns `value`. */
    function setPrompt(value: string | null) {
      const calls: Array<{ message?: string; default?: string }> = [];
      window.prompt = ((message?: string, def?: string) => {
        calls.push({ message, default: def });
        return value;
      }) as unknown as PromptFn;
      return calls;
    }

    /** Place the cursor on selectable text so chain commands have somewhere to act. */
    function focusSomeText(editor: Editor) {
      editor.commands.setContent('<p>Click here</p>');
      editor.commands.selectAll();
    }

    it('Should be a no-op when prompt returns null', () => {
      setPrompt(null);
      const { result, editor, scope: s } = setup();
      scope = s;
      focusSomeText(editor);

      result.addLink();

      // No link mark applied to the (fully-selected) text.
      expect(editor.getHTML()).not.toContain('<a ');
    });

    it('Should clear the link when prompt returns an empty string', () => {
      setPrompt('');
      const { result, editor, scope: s } = setup();
      scope = s;
      focusSomeText(editor);
      // Apply a link first so we have something to clear.
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: 'https://to-be-removed.example' })
        .run();
      expect(editor.getHTML()).toContain('<a ');

      result.addLink();

      expect(editor.getHTML()).not.toContain('<a ');
    });

    it('Should apply a link with the entered URL', () => {
      setPrompt('https://example.com');
      const { result, editor, scope: s } = setup();
      scope = s;
      focusSomeText(editor);

      result.addLink();

      const html = editor.getHTML();
      expect(html).toContain('href="https://example.com"');
    });

    it('Should pass the existing link href as the prompt default', () => {
      const calls = setPrompt('https://new.example');
      const { result, editor, scope: s } = setup();
      scope = s;
      focusSomeText(editor);
      // Pre-existing link on the selection.
      editor
        .chain()
        .focus()
        .extendMarkRange('link')
        .setLink({ href: 'https://prev.example' })
        .run();

      result.addLink();

      expect(calls).toHaveLength(1);
      expect(calls[0]).toEqual({
        message: 'URL',
        default: 'https://prev.example',
      });
    });
  });

  describe('Lifecycle', () => {
    it('Should destroy the underlying editor when the effect scope is stopped', () => {
      const { editor, scope } = setup();
      expect(editor.isDestroyed).toBe(false);

      scope.stop();

      expect(editor.isDestroyed).toBe(true);
    });
  });

  describe('Return value', () => {
    let scope: EffectScope;

    afterEach(() => {
      scope?.stop();
    });

    it('Should expose the editor ref and addLink', () => {
      const { result, editor, scope: s } = setup();
      scope = s;

      const editorRef = result.editor as unknown as Ref<Editor | null>;
      expect(editorRef.value).toBe(editor);
      expect(typeof result.addLink).toBe('function');
    });
  });
});
