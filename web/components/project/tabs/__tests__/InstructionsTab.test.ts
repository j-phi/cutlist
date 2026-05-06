// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, nextTick, ref } from 'vue';
import type { JSONContent } from '@tiptap/core';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import InstructionsTab from '../InstructionsTab.vue';

interface ActiveProject {
  id: string;
  name: string;
}

const EMPTY_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph' }],
};

const FILLED_DOC: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
};

const activeProject = ref<ActiveProject | null>(null);
const doc = ref<JSONContent>(EMPTY_DOC);
const title = ref('');
const loadedId = ref<string | null>(null);
const setDoc = vi.fn((next: JSONContent) => {
  doc.value = next;
});
const setTitle = vi.fn((next: string) => {
  title.value = next;
});
const flush = vi.fn(async () => {});

mockNuxtImport('useProjects', () => () => ({ activeProject }));
mockNuxtImport('useBuildDoc', () => () => ({
  doc,
  title,
  loadedId,
  setDoc,
  setTitle,
  flush,
}));

const stubs = {
  UIcon: true,
  UButton: defineComponent({
    name: 'UButton',
    props: { label: { type: String, default: '' } },
    emits: ['click'],
    setup(props, { emit, slots }) {
      return () =>
        h(
          'button',
          {
            'data-testid': `btn-${props.label.toLowerCase()}`,
            onClick: () => emit('click'),
          },
          slots.default?.() ?? props.label,
        );
    },
  }),
  // The editor is heavy; stub it out and just record what props/events flow.
  BuildDocEditor: defineComponent({
    name: 'BuildDocEditor',
    props: {
      modelValue: { type: Object as () => JSONContent, required: true },
      projectId: { type: String, required: true },
      placeholder: { type: String, default: '' },
      editable: { type: Boolean, default: true },
    },
    emits: ['update:modelValue', 'blur'],
    setup(props) {
      return () =>
        h('div', {
          'data-testid': 'editor',
          'data-doc-type': props.modelValue?.type ?? '',
          'data-editable': String(props.editable),
        });
    },
  }),
};

function getComponent() {
  return shallowMount(InstructionsTab, { global: { stubs } });
}

describe('InstructionsTab', () => {
  afterEach(() => {
    activeProject.value = null;
    doc.value = EMPTY_DOC;
    title.value = '';
    loadedId.value = null;
    setDoc.mockReset();
    setTitle.mockReset();
    flush.mockReset();
    vi.restoreAllMocks();
  });

  it('shows the empty-project state when no project is active', () => {
    const c = getComponent();
    expect(c.text()).toContain('Create a project to get started.');
    expect(c.find('[data-testid="editor"]').exists()).toBe(false);
  });

  it('mounts the editor with the doc body', () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    doc.value = FILLED_DOC;
    loadedId.value = 'p1';

    const c = getComponent();
    const editor = c.find('[data-testid="editor"]');
    expect(editor.exists()).toBe(true);
    expect(editor.attributes('data-doc-type')).toBe('doc');
  });

  it('hides the header/editor while a project switch is loading', () => {
    activeProject.value = { id: 'p2', name: 'New' };
    // Stale `loadedId` from the previous project — load not yet complete.
    loadedId.value = 'p1';
    doc.value = FILLED_DOC;

    const c = getComponent();
    expect(c.find('[data-testid="editor"]').exists()).toBe(false);
    expect(c.find('input[aria-label="Build doc title"]').exists()).toBe(false);
    expect(c.find('h1').exists()).toBe(false);
  });

  it('starts in edit mode for an empty doc', async () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    doc.value = EMPTY_DOC;
    loadedId.value = 'p1';

    const c = getComponent();
    await nextTick();

    const editor = c.find('[data-testid="editor"]');
    expect(editor.attributes('data-editable')).toBe('true');
    expect(c.find('input[aria-label="Build doc title"]').exists()).toBe(true);
    expect(c.find('[data-testid="btn-done"]').exists()).toBe(true);
    expect(c.find('[data-testid="btn-edit"]').exists()).toBe(false);
  });

  it('starts in view mode when the loaded doc has content', async () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    doc.value = FILLED_DOC;
    loadedId.value = 'p1';

    const c = getComponent();
    await nextTick();

    const editor = c.find('[data-testid="editor"]');
    expect(editor.attributes('data-editable')).toBe('false');
    expect(c.find('input[aria-label="Build doc title"]').exists()).toBe(false);
    expect(c.find('[data-testid="btn-edit"]').exists()).toBe(true);
    expect(c.find('[data-testid="btn-done"]').exists()).toBe(false);
  });

  it('renders the title (or project name) as a heading in view mode', async () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    doc.value = FILLED_DOC;
    title.value = 'My custom build';
    loadedId.value = 'p1';

    const c = getComponent();
    await nextTick();
    expect(c.get('h1').text()).toBe('My custom build');

    title.value = '';
    await nextTick();
    expect(c.get('h1').text()).toBe('Demo');
  });

  it('switches to edit mode when the Edit button is clicked', async () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    doc.value = FILLED_DOC;
    loadedId.value = 'p1';

    const c = getComponent();
    await nextTick();

    await c.get('[data-testid="btn-edit"]').trigger('click');

    expect(c.find('input[aria-label="Build doc title"]').exists()).toBe(true);
    expect(c.find('[data-testid="editor"]').attributes('data-editable')).toBe(
      'true',
    );
    expect(c.find('[data-testid="btn-done"]').exists()).toBe(true);
  });

  it('flushes and switches to view mode when Done is clicked', async () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    doc.value = EMPTY_DOC;
    loadedId.value = 'p1';

    const c = getComponent();
    await nextTick();

    // Empty docs start in edit mode — clicking Done should flush + switch.
    await c.get('[data-testid="btn-done"]').trigger('click');

    expect(flush).toHaveBeenCalled();
    expect(c.find('[data-testid="btn-edit"]').exists()).toBe(true);
    expect(c.find('[data-testid="editor"]').attributes('data-editable')).toBe(
      'false',
    );
  });

  it('shows the title verbatim and keeps the project name as placeholder', async () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    title.value = 'My custom build';
    loadedId.value = 'p1';
    doc.value = EMPTY_DOC;

    const c = getComponent();
    await nextTick();
    const input = c.get('input[aria-label="Build doc title"]');
    expect((input.element as HTMLInputElement).value).toBe('My custom build');
    expect(input.attributes('placeholder')).toBe('Demo');
  });

  it('forwards title input to setTitle', async () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    loadedId.value = 'p1';
    doc.value = EMPTY_DOC;
    const c = getComponent();
    await nextTick();
    const input = c.get('input[aria-label="Build doc title"]');
    await input.setValue('A new title');
    expect(setTitle).toHaveBeenCalledWith('A new title');
  });

  it('forwards editor updates to setDoc', () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    loadedId.value = 'p1';
    const c = getComponent();
    const editor = c.findComponent({ name: 'BuildDocEditor' });
    const next: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'typed' }] },
      ],
    };
    editor.vm.$emit('update:modelValue', next);
    expect(setDoc).toHaveBeenCalledWith(next);
  });

  it('flushes pending writes when the editor blurs', () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    loadedId.value = 'p1';
    const c = getComponent();
    const editor = c.findComponent({ name: 'BuildDocEditor' });
    editor.vm.$emit('blur');
    expect(flush).toHaveBeenCalled();
  });
});
