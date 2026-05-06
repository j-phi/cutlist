// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
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

const activeProject = ref<ActiveProject | null>(null);
const doc = ref<JSONContent>(EMPTY_DOC);
const title = ref('');
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
  setDoc,
  setTitle,
  flush,
}));

const stubs = {
  UIcon: true,
  // The editor is heavy; stub it out and just record what props/events flow.
  BuildDocEditor: defineComponent({
    name: 'BuildDocEditor',
    props: {
      modelValue: { type: Object as () => JSONContent, required: true },
      projectId: { type: String, required: true },
      placeholder: { type: String, default: '' },
    },
    emits: ['update:modelValue', 'blur'],
    setup(props) {
      return () =>
        h('div', {
          'data-testid': 'editor',
          'data-doc-type': props.modelValue?.type ?? '',
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
    doc.value = {
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hi' }] }],
    };

    const c = getComponent();
    const editor = c.find('[data-testid="editor"]');
    expect(editor.exists()).toBe(true);
    expect(editor.attributes('data-doc-type')).toBe('doc');
  });

  it('shows the title verbatim and keeps the project name as placeholder', () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    title.value = 'My custom build';

    const c = getComponent();
    const input = c.get('input[aria-label="Build doc title"]');
    expect((input.element as HTMLInputElement).value).toBe('My custom build');
    expect(input.attributes('placeholder')).toBe('Demo');
  });

  it('forwards title input to setTitle', async () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    const c = getComponent();
    const input = c.get('input[aria-label="Build doc title"]');
    await input.setValue('A new title');
    expect(setTitle).toHaveBeenCalledWith('A new title');
  });

  it('forwards editor updates to setDoc', () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
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
    const c = getComponent();
    const editor = c.findComponent({ name: 'BuildDocEditor' });
    editor.vm.$emit('blur');
    expect(flush).toHaveBeenCalled();
  });
});
