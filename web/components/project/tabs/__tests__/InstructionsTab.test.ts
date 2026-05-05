// @vitest-environment nuxt
import { afterEach, describe, expect, it, vi } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import InstructionsTab from '../InstructionsTab.vue';

interface ActiveProject {
  id: string;
  name: string;
}

const activeProject = ref<ActiveProject | null>(null);
const html = ref('');
const title = ref<string | undefined>(undefined);
const setHtml = vi.fn((next: string) => {
  html.value = next;
});
const setTitle = vi.fn((next: string) => {
  title.value = next;
});
const flush = vi.fn(async () => {});

mockNuxtImport('useProjects', () => () => ({ activeProject }));
mockNuxtImport('useBuildDoc', () => () => ({
  html,
  title,
  setHtml,
  setTitle,
  flush,
}));

const stubs = {
  UIcon: true,
  // The editor is heavy; stub it out and just record what props/events flow.
  BuildDocEditor: defineComponent({
    name: 'BuildDocEditor',
    props: {
      modelValue: { type: String, default: '' },
      placeholder: { type: String, default: '' },
    },
    emits: ['update:modelValue', 'blur'],
    setup(props) {
      return () =>
        h('div', {
          'data-testid': 'editor',
          'data-html': props.modelValue,
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
    html.value = '';
    title.value = undefined;
    setHtml.mockReset();
    setTitle.mockReset();
    flush.mockReset();
    vi.restoreAllMocks();
  });

  it('shows the empty-project state when no project is active', () => {
    const c = getComponent();
    expect(c.text()).toContain('Create a project to get started.');
    expect(c.find('[data-testid="editor"]').exists()).toBe(false);
  });

  it('mounts the editor with the doc html', () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    html.value = '<p>Hello</p>';

    const c = getComponent();
    const editor = c.find('[data-testid="editor"]');
    expect(editor.exists()).toBe(true);
    expect(editor.attributes('data-html')).toBe('<p>Hello</p>');
  });

  it('prefills the title input with the project name when title is unset', () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    title.value = undefined;

    const c = getComponent();
    const input = c.get('input[aria-label="Build doc title"]');
    expect((input.element as HTMLInputElement).value).toBe('');
    expect(input.attributes('placeholder')).toBe('Demo');
  });

  it('shows the explicit title once the user has set one', () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    title.value = 'My custom build';

    const c = getComponent();
    const input = c.get('input[aria-label="Build doc title"]');
    expect((input.element as HTMLInputElement).value).toBe('My custom build');
  });

  it('forwards title input to setTitle', async () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    const c = getComponent();
    const input = c.get('input[aria-label="Build doc title"]');
    await input.setValue('A new title');
    expect(setTitle).toHaveBeenCalledWith('A new title');
  });

  it('forwards editor updates to setHtml', async () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    const c = getComponent();
    const editor = c.findComponent({ name: 'BuildDocEditor' });
    editor.vm.$emit('update:modelValue', '<p>typed</p>');
    expect(setHtml).toHaveBeenCalledWith('<p>typed</p>');
  });

  it('flushes pending writes when the editor blurs', () => {
    activeProject.value = { id: 'p1', name: 'Demo' };
    const c = getComponent();
    const editor = c.findComponent({ name: 'BuildDocEditor' });
    editor.vm.$emit('blur');
    expect(flush).toHaveBeenCalled();
  });
});
