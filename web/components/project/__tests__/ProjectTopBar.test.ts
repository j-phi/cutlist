// @vitest-environment nuxt
/**
 * Outcome-based tests for ProjectTopBar. The component invokes composable
 * methods directly (no emits), so we observe behaviour by recording the
 * args passed to each method via plain arrays inside `mockNuxtImport`.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import ProjectTopBar from '../ProjectTopBar.vue';
import { UButtonStub } from '~/test-utils/stubs';

// ── Recording stand-ins for composable methods ───────────────────────────────

const projects = ref<Map<string, { id: string; name: string }>>(new Map());
const activeId = ref<string | null>(null);

const closeCalls: string[] = [];
const renameCalls: Array<{ id: string; name: string }> = [];
const reorderCalls: string[][] = [];

mockNuxtImport('useProjects', () => () => ({
  projects,
  activeId,
  closeProject: (id: string) => {
    closeCalls.push(id);
  },
  renameProject: async (id: string, name: string) => {
    renameCalls.push({ id, name });
  },
  reorderProjects: (ids: string[]) => {
    reorderCalls.push(ids);
  },
}));

mockNuxtImport('useProjectNavigation', () => () => ({
  setActiveProject: () => {},
}));

mockNuxtImport('useExportProject', () => () => ({
  exportProject: async () => {},
}));

mockNuxtImport('useImportProject', () => () => ({
  pickAndImport: async () => {},
}));

// ── Stubs ────────────────────────────────────────────────────────────────────

// TabListItem stub: drive emits through DOM events / direct vm.$emit.
const TabListItemStub = {
  props: ['name', 'active', 'editing', 'draggable'],
  emits: [
    'close',
    'click',
    'dblclick',
    'rename',
    'dragstart',
    'dragover',
    'drop',
    'dragend',
  ],
  template: `
    <li
      :data-tab-name="name"
      :data-active="active ? 'true' : 'false'"
      :data-editing="editing ? 'true' : 'false'"
    >
      <button class="select" @click="$emit('click', $event)">{{ name }}</button>
      <button class="close" @click.stop="$emit('close')">x</button>
      <button class="dbl" @dblclick="$emit('dblclick', $event)">edit</button>
    </li>
  `,
};

const stubs = {
  UButton: UButtonStub,
  UIcon: true,
  UModal: {
    props: ['open'],
    template:
      '<section :data-modal-open="open ? \'true\' : \'false\'"><slot name="content" /></section>',
  },
  TabList: { template: '<ul role="tablist"><slot /></ul>' },
  TabListItem: TabListItemStub,
  NewProjectDialog: true,
  Transition: false,
};

function getComponent() {
  return shallowMount(ProjectTopBar, { global: { stubs } });
}

function findTab(component: ReturnType<typeof getComponent>, name: string) {
  return component
    .findAll('[data-tab-name]')
    .find((t) => t.attributes('data-tab-name') === name);
}

beforeEach(() => {
  projects.value = new Map([
    ['p1', { id: 'p1', name: 'Alpha' }],
    ['p2', { id: 'p2', name: 'Beta' }],
    ['p3', { id: 'p3', name: 'Gamma' }],
  ]);
  activeId.value = 'p1';
  closeCalls.length = 0;
  renameCalls.length = 0;
  reorderCalls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProjectTopBar', () => {
  describe('On close confirm flow', () => {
    it('Should open the named confirm modal and call closeProject only on confirm', async () => {
      const component = getComponent();
      await findTab(component, 'Beta')!.get('button.close').trigger('click');

      const modal = component.find('[data-modal-open="true"]');
      expect(modal.exists()).toBe(true);
      expect(modal.text()).toContain('Beta');

      const confirmBtn = component
        .findAll('button')
        .find((b) => b.text() === 'Close project');
      await confirmBtn!.trigger('click');
      expect(closeCalls).toEqual(['p2']);
    });

    it('Should not call closeProject when the user cancels', async () => {
      const component = getComponent();
      await findTab(component, 'Alpha')!.get('button.close').trigger('click');

      await component
        .findAll('button')
        .find((b) => b.text() === 'Cancel')!
        .trigger('click');

      expect(closeCalls).toEqual([]);
    });
  });

  describe('On rename', () => {
    it.each([
      {
        scenario: 'renames when the new name differs',
        emitted: 'Renamed',
        expected: [{ id: 'p1', name: 'Renamed' }],
      },
      {
        scenario: 'skips when the rename value matches the original',
        emitted: 'Alpha',
        expected: [],
      },
    ])('$scenario', async ({ emitted, expected }) => {
      const component = getComponent();
      const alpha = findTab(component, 'Alpha')!;

      await alpha.get('button.dbl').trigger('dblclick');
      const stub = alpha.findComponent(TabListItemStub);
      stub.vm.$emit('rename', emitted);
      await component.vm.$nextTick();

      expect(renameCalls).toEqual(expected);
    });
  });

  it('Should call reorderProjects with the new id order on drag-drop', async () => {
    const component = getComponent();
    const alpha = findTab(component, 'Alpha')!;
    const beta = findTab(component, 'Beta')!;

    alpha.findComponent(TabListItemStub).vm.$emit('dragstart', {
      dataTransfer: { effectAllowed: 'move' },
    });
    const betaStub = beta.findComponent(TabListItemStub);
    betaStub.vm.$emit('dragover', { preventDefault: () => {} });
    betaStub.vm.$emit('drop');
    await component.vm.$nextTick();

    expect(reorderCalls).toEqual([['p2', 'p1', 'p3']]);
  });
});

// TODO(test): mobile menu — duplicates desktop flows in a different DOM branch.
// TODO(test): export/import buttons — pure delegation to mocked composables.
// TODO(test): goHome / new project dialog open — delegation only.
