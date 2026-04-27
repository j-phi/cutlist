// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref, defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';

// ── Fake editor ──────────────────────────────────────────────────────────────

type Updater = (ctx: { editor: FakeEditor }) => void;

class FakeEditor {
  private updateHandler: Updater | null = null;
  private contentHtml = '';
  isEmpty = true;
  destroyed = false;

  // Spy hooks for chain commands.
  toggleBold = vi.fn().mockReturnThis();
  toggleItalic = vi.fn().mockReturnThis();
  toggleBulletList = vi.fn().mockReturnThis();
  toggleOrderedList = vi.fn().mockReturnThis();
  extendMarkRange = vi.fn().mockReturnThis();
  unsetLink = vi.fn().mockReturnThis();
  setLink = vi.fn().mockReturnThis();
  focus = vi.fn().mockReturnThis();
  run = vi.fn().mockReturnValue(true);

  // Convenience hooks for the test.
  setContentSpy = vi.fn();
  destroySpy = vi.fn();

  constructor(opts: { content?: string; onUpdate?: Updater }) {
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

  getAttributes(_name: string) {
    return {};
  }

  commands = {
    setContent: (val: string, _opts?: unknown) => {
      this.setContentSpy(val);
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

let currentEditor: FakeEditor | null = null;

vi.mock('@tiptap/vue-3', () => ({
  useEditor: (opts: { content?: string; onUpdate?: Updater }) => {
    currentEditor = new FakeEditor(opts);
    return ref(currentEditor);
  },
  EditorContent: defineComponent({
    props: ['editor'],
    setup() {
      return () => h('div', { 'data-testid': 'editor-content' });
    },
  }),
}));

vi.mock('@tiptap/starter-kit', () => ({
  default: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-link', () => ({
  default: { configure: () => ({}) },
}));
vi.mock('@tiptap/extension-placeholder', () => ({
  default: { configure: () => ({}) },
}));

// Import after mocks are set up.
import RichTextEditor from '../RichTextEditor.vue';

const UButtonStub = {
  inheritAttrs: false,
  props: ['icon'],
  template:
    '<button type="button" :data-icon="icon" v-bind="$attrs"><slot /></button>',
};

function getComponent(modelValue = '<p>hi</p>') {
  return mount(RichTextEditor, {
    props: { modelValue },
    global: {
      stubs: {
        UButton: UButtonStub,
      },
    },
  });
}

function clickIconButton(
  component: ReturnType<typeof getComponent>,
  icon: string,
) {
  const btn = component
    .findAll('button')
    .find((b) => b.attributes('data-icon') === icon);
  if (!btn) throw new Error(`No button with icon ${icon}`);
  return btn.trigger('click');
}

beforeEach(() => {
  currentEditor = null;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('RichTextEditor', () => {
  describe('Toolbar buttons', () => {
    it('Should call toggleBold().run() when the bold button is clicked', async () => {
      const component = getComponent();
      await clickIconButton(component, 'i-lucide-bold');

      expect(currentEditor!.toggleBold).toHaveBeenCalled();
      expect(currentEditor!.run).toHaveBeenCalled();
    });

    it('Should call toggleItalic().run() when the italic button is clicked', async () => {
      const component = getComponent();
      await clickIconButton(component, 'i-lucide-italic');
      expect(currentEditor!.toggleItalic).toHaveBeenCalled();
    });

    it('Should call toggleBulletList().run() for the bullet list button', async () => {
      const component = getComponent();
      await clickIconButton(component, 'i-lucide-list');
      expect(currentEditor!.toggleBulletList).toHaveBeenCalled();
    });

    it('Should call toggleOrderedList().run() for the ordered list button', async () => {
      const component = getComponent();
      await clickIconButton(component, 'i-lucide-list-ordered');
      expect(currentEditor!.toggleOrderedList).toHaveBeenCalled();
    });
  });

  describe('#addLink', () => {
    type PromptFn = (message?: string, _default?: string) => string | null;
    let originalPrompt: PromptFn;
    beforeEach(() => {
      originalPrompt = window.prompt;
    });
    afterEach(() => {
      window.prompt = originalPrompt;
    });

    function setPrompt(value: string | null) {
      const spy = vi.fn().mockReturnValue(value);
      window.prompt = spy as unknown as PromptFn;
      return spy;
    }

    it('Should call unsetLink when prompt returns an empty string', async () => {
      const promptSpy = setPrompt('');
      const component = getComponent();

      await clickIconButton(component, 'i-lucide-link');

      expect(promptSpy).toHaveBeenCalled();
      expect(currentEditor!.unsetLink).toHaveBeenCalled();
      expect(currentEditor!.setLink).not.toHaveBeenCalled();
    });

    it('Should call setLink with the typed URL', async () => {
      setPrompt('https://example.com');
      const component = getComponent();

      await clickIconButton(component, 'i-lucide-link');

      expect(currentEditor!.setLink).toHaveBeenCalledWith({
        href: 'https://example.com',
      });
    });

    it('Should do nothing when the prompt is dismissed', async () => {
      setPrompt(null);
      const component = getComponent();

      await clickIconButton(component, 'i-lucide-link');

      expect(currentEditor!.setLink).not.toHaveBeenCalled();
      expect(currentEditor!.unsetLink).not.toHaveBeenCalled();
    });
  });

  describe('Model value sync', () => {
    it('Should emit update:modelValue when the editor onUpdate fires', async () => {
      const component = getComponent('<p>start</p>');
      currentEditor!.fireUpdate('<p>edited</p>');
      await component.vm.$nextTick();

      expect(component.emitted('update:modelValue')).toEqual([
        ['<p>edited</p>'],
      ]);
    });

    it('Should call commands.setContent when the prop changes to a different value', async () => {
      const component = getComponent('<p>same</p>');
      currentEditor!.setContentSpy.mockClear();

      await component.setProps({ modelValue: '<p>different</p>' });

      expect(currentEditor!.setContentSpy).toHaveBeenCalledWith(
        '<p>different</p>',
      );
    });

    it('Should not call commands.setContent when the prop matches the current HTML', async () => {
      const component = getComponent('<p>same</p>');
      currentEditor!.setContentSpy.mockClear();

      await component.setProps({ modelValue: '<p>same</p>' });

      expect(currentEditor!.setContentSpy).not.toHaveBeenCalled();
    });
  });

  describe('Lifecycle', () => {
    it('Should call destroy on unmount', () => {
      const component = getComponent();
      const editor = currentEditor!;
      component.unmount();
      expect(editor.destroyed).toBe(true);
    });
  });
});

// TODO(test): isActive(...) toolbar variant flag — depends on Tiptap state we don't simulate.
// TODO(test): placeholder rendering — pure CSS / data-attribute presentation.
