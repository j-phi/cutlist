import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { effectScope, nextTick, ref, type EffectScope, type Ref } from 'vue';

// ── Fake editor + Tiptap module mocks ────────────────────────────────────────

type Updater = (ctx: { editor: FakeEditor }) => void;

interface FakeEditorOpts {
  content?: string;
  onUpdate?: Updater;
  extensions?: unknown[];
  editorProps?: unknown;
}

class FakeEditor {
  contentHtml = '';
  isEmpty = true;
  destroyed = false;
  updateHandler: Updater | null = null;
  linkAttrs: Record<string, string> = {};

  // Spies for chain commands.
  focus = vi.fn().mockReturnThis();
  extendMarkRange = vi.fn().mockReturnThis();
  unsetLink = vi.fn().mockReturnThis();
  setLink = vi.fn().mockReturnThis();
  run = vi.fn().mockReturnValue(true);

  // Convenience hooks for tests.
  setContentSpy = vi.fn();
  destroySpy = vi.fn();

  constructor(opts: FakeEditorOpts) {
    this.contentHtml = opts.content ?? '';
    this.isEmpty = !this.contentHtml;
    this.updateHandler = opts.onUpdate ?? null;
  }

  chain() {
    return this;
  }

  isActive(_name: string) {
    return false;
  }

  getHTML() {
    return this.contentHtml;
  }

  setHTML(html: string) {
    this.contentHtml = html;
    this.isEmpty = !html;
  }

  getAttributes(name: string) {
    return name === 'link' ? this.linkAttrs : {};
  }

  commands = {
    setContent: (val: string, opts?: unknown) => {
      this.setContentSpy(val, opts);
      this.contentHtml = val;
      this.isEmpty = !val;
    },
  };

  destroy() {
    this.destroyed = true;
    this.destroySpy();
  }

  fireUpdate(html: string) {
    this.contentHtml = html;
    this.isEmpty = !html;
    this.updateHandler?.({ editor: this });
  }
}

let lastEditorOpts: FakeEditorOpts | null = null;
let lastEditor: FakeEditor | null = null;
const useEditorSpy = vi.fn((opts: FakeEditorOpts) => {
  lastEditorOpts = opts;
  lastEditor = new FakeEditor(opts);
  return ref(lastEditor);
});

vi.mock('@tiptap/vue-3', () => ({
  useEditor: (opts: FakeEditorOpts) => useEditorSpy(opts),
  EditorContent: { name: 'EditorContent', render: () => null },
}));

const starterKitConfigure = vi.fn(
  (opts: Record<string, unknown>) =>
    ({ name: 'StarterKit', opts }) as { name: string; opts: typeof opts },
);
vi.mock('@tiptap/starter-kit', () => ({
  default: {
    configure: (opts: Record<string, unknown>) => starterKitConfigure(opts),
  },
}));

const linkConfigure = vi.fn(
  (opts: Record<string, unknown>) =>
    ({ name: 'Link', opts }) as { name: string; opts: typeof opts },
);
vi.mock('@tiptap/extension-link', () => ({
  default: {
    configure: (opts: Record<string, unknown>) => linkConfigure(opts),
  },
}));

const placeholderConfigure = vi.fn(
  (opts: Record<string, unknown>) =>
    ({ name: 'Placeholder', opts }) as { name: string; opts: typeof opts },
);
vi.mock('@tiptap/extension-placeholder', () => ({
  default: {
    configure: (opts: Record<string, unknown>) => placeholderConfigure(opts),
  },
}));

// Import after mocks are set up.
import { useTiptapEditor } from '../useTiptapEditor';

// ── Helpers ─────────────────────────────────────────────────────────────────

function setup(initial = '<p>start</p>', placeholder?: string) {
  const modelValue = ref(initial);
  const placeholderRef = ref<string | undefined>(placeholder);
  const onUpdate = vi.fn<(html: string) => void>();
  const scope = effectScope();
  const result = scope.run(() =>
    useTiptapEditor({
      modelValue: () => modelValue.value,
      onUpdate,
      placeholder: () => placeholderRef.value,
    }),
  )!;
  return { modelValue, placeholderRef, onUpdate, scope, result };
}

beforeEach(() => {
  lastEditorOpts = null;
  lastEditor = null;
  useEditorSpy.mockClear();
  starterKitConfigure.mockClear();
  linkConfigure.mockClear();
  placeholderConfigure.mockClear();
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

      expect(useEditorSpy).toHaveBeenCalledTimes(1);
      expect(lastEditorOpts?.content).toBe('<p>hello</p>');
    });

    it('Should configure StarterKit with heading/codeBlock/blockquote/horizontalRule disabled', () => {
      const ctx = setup();
      scope = ctx.scope;

      expect(starterKitConfigure).toHaveBeenCalledWith({
        heading: false,
        codeBlock: false,
        blockquote: false,
        horizontalRule: false,
      });
    });

    it('Should configure Link with openOnClick: false', () => {
      const ctx = setup();
      scope = ctx.scope;

      expect(linkConfigure).toHaveBeenCalledWith({ openOnClick: false });
    });

    it('Should configure Placeholder with the provided placeholder text', () => {
      const ctx = setup('<p>x</p>', 'My placeholder');
      scope = ctx.scope;

      expect(placeholderConfigure).toHaveBeenCalledWith({
        placeholder: 'My placeholder',
      });
    });

    it('Should fall back to the default placeholder when none is provided', () => {
      const ctx = setup('<p>x</p>');
      scope = ctx.scope;

      expect(placeholderConfigure).toHaveBeenCalledWith({
        placeholder: 'Description...',
      });
    });

    it('Should pass the StarterKit, Link, and Placeholder configured outputs as extensions', () => {
      const ctx = setup();
      scope = ctx.scope;

      const extensions = lastEditorOpts?.extensions as Array<{ name: string }>;
      expect(extensions.map((e) => e.name)).toEqual([
        'StarterKit',
        'Link',
        'Placeholder',
      ]);
    });
  });

  describe('onUpdate callback', () => {
    let scope: EffectScope;

    afterEach(() => {
      scope?.stop();
    });

    it('Should forward the editor HTML to onUpdate when the editor fires an update', () => {
      const { onUpdate, scope: s } = setup('<p>start</p>');
      scope = s;

      lastEditor!.fireUpdate('<p>edited</p>');

      expect(onUpdate).toHaveBeenCalledWith('<p>edited</p>');
    });

    it('Should pass an empty string when the editor reports isEmpty', () => {
      const { onUpdate, scope: s } = setup('<p>start</p>');
      scope = s;

      // Simulate an empty editor: clear content but invoke the handler.
      lastEditor!.contentHtml = '';
      lastEditor!.isEmpty = true;
      lastEditor!.updateHandler?.({ editor: lastEditor! });

      expect(onUpdate).toHaveBeenCalledWith('');
    });
  });

  describe('modelValue watcher', () => {
    let scope: EffectScope;

    afterEach(() => {
      scope?.stop();
    });

    it('Should call commands.setContent with emitUpdate: false when the getter changes to a different value', async () => {
      const { modelValue, scope: s } = setup('<p>same</p>');
      scope = s;
      lastEditor!.setContentSpy.mockClear();

      modelValue.value = '<p>different</p>';
      await nextTick();

      expect(lastEditor!.setContentSpy).toHaveBeenCalledWith(
        '<p>different</p>',
        { emitUpdate: false },
      );
    });

    it('Should not call commands.setContent when the new value matches the current HTML', async () => {
      const { modelValue, scope: s } = setup('<p>same</p>');
      scope = s;
      lastEditor!.setContentSpy.mockClear();

      // Same value, watcher must still not call setContent.
      modelValue.value = '<p>same</p>';
      await nextTick();

      expect(lastEditor!.setContentSpy).not.toHaveBeenCalled();
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

    function setPrompt(value: string | null) {
      const spy = vi.fn().mockReturnValue(value);
      window.prompt = spy as unknown as PromptFn;
      return spy;
    }

    it('Should be a no-op when prompt returns null', () => {
      setPrompt(null);
      const { result, scope: s } = setup();
      scope = s;

      result.addLink();

      expect(lastEditor!.setLink).not.toHaveBeenCalled();
      expect(lastEditor!.unsetLink).not.toHaveBeenCalled();
    });

    it('Should call unsetLink when prompt returns an empty string', () => {
      setPrompt('');
      const { result, scope: s } = setup();
      scope = s;

      result.addLink();

      expect(lastEditor!.unsetLink).toHaveBeenCalled();
      expect(lastEditor!.setLink).not.toHaveBeenCalled();
      expect(lastEditor!.run).toHaveBeenCalled();
    });

    it('Should call setLink with { href: url } when prompt returns a URL', () => {
      setPrompt('https://example.com');
      const { result, scope: s } = setup();
      scope = s;

      result.addLink();

      expect(lastEditor!.setLink).toHaveBeenCalledWith({
        href: 'https://example.com',
      });
      expect(lastEditor!.run).toHaveBeenCalled();
    });

    it('Should pass the existing link href as the prompt default', () => {
      const promptSpy = setPrompt('https://new.example');
      const { result, scope: s } = setup();
      scope = s;
      lastEditor!.linkAttrs = { href: 'https://prev.example' };

      result.addLink();

      expect(promptSpy).toHaveBeenCalledWith('URL', 'https://prev.example');
    });
  });

  describe('Lifecycle', () => {
    it('Should call destroy when the effect scope is stopped', () => {
      const { scope } = setup();
      const editorRef = lastEditor!;
      expect(editorRef.destroyed).toBe(false);

      scope.stop();

      expect(editorRef.destroyed).toBe(true);
      expect(editorRef.destroySpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Return value', () => {
    let scope: EffectScope;

    afterEach(() => {
      scope?.stop();
    });

    it('Should expose the editor ref and addLink', () => {
      const { result, scope: s } = setup();
      scope = s;

      const editor = result.editor as unknown as Ref<FakeEditor | null>;
      // Vue may wrap the FakeEditor in a reactive proxy; compare via a known property.
      expect(editor.value?.destroySpy).toBe(lastEditor!.destroySpy);
      expect(typeof result.addLink).toBe('function');
    });
  });
});
