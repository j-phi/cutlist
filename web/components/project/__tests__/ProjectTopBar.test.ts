// @vitest-environment nuxt
/**
 * Outcome-based tests for ProjectTopBar. The component invokes composable
 * methods directly (no emits), so we observe behaviour by recording the
 * args passed to each method via plain arrays inside `mockNuxtImport`.
 * No vi.fn / toHaveBeenCalled introspection.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import ProjectTopBar from '../ProjectTopBar.vue';

// ── Recording stand-ins for composable methods ───────────────────────────────

const projects = ref<Map<string, { id: string; name: string }>>(new Map());
const activeId = ref<string | null>(null);
const archivedList = ref<
  Array<{ id: string; name: string; archivedAt: string }>
>([]);

const closeCalls: string[] = [];
const restoreCalls: string[] = [];
const permanentlyDeleteCalls: string[] = [];
const clearHistoryCalls: number[] = [];
const resetDatabaseCalls: number[] = [];
const renameCalls: Array<{ id: string; name: string }> = [];
const reorderCalls: string[][] = [];

mockNuxtImport('useProjects', () => () => ({
  projects,
  activeId,
  archivedList,
  closeProject: (id: string) => {
    closeCalls.push(id);
  },
  restoreProject: async (id: string) => {
    restoreCalls.push(id);
  },
  permanentlyDeleteProject: async (id: string) => {
    permanentlyDeleteCalls.push(id);
  },
  clearHistory: async () => {
    clearHistoryCalls.push(Date.now());
  },
  resetDatabase: async () => {
    resetDatabaseCalls.push(Date.now());
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
  goHome: () => {},
}));

mockNuxtImport('useExportProject', () => () => ({
  exportProject: async () => {},
}));

mockNuxtImport('useImportProject', () => () => ({
  pickAndImport: async () => {},
}));

// ── Stubs ────────────────────────────────────────────────────────────────────

const UButtonStub = {
  // Let attrs (including onClick) inherit naturally onto the button so a
  // click fires the parent's listener exactly once.
  props: ['label'],
  template: '<button type="button"><slot />{{ label }}</button>',
};

// Stub TabListItem so we can drive its emits via DOM events.
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

const TabListStub = {
  template: '<ul role="tablist"><slot /></ul>',
};

const ProjectHistoryMenuStub = {
  name: 'ProjectHistoryMenu',
  props: ['archived'],
  emits: ['restore', 'permanently-delete', 'clear', 'reset'],
  template: `
    <div
      data-testid="history-menu-stub"
      :data-archived-count="archived.length"
    >
      <button class="emit-restore" @click="$emit('restore', 'a1')">restore</button>
      <button
        class="emit-permanently-delete"
        @click="$emit('permanently-delete', 'a1')"
      >delete</button>
      <button class="emit-clear" @click="$emit('clear')">clear</button>
      <button class="emit-reset" @click="$emit('reset')">reset</button>
    </div>
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
  TabList: TabListStub,
  TabListItem: TabListItemStub,
  ProjectHistoryMenu: ProjectHistoryMenuStub,
  NewProjectDialog: true,
  Transition: false,
};

function getComponent() {
  return shallowMount(ProjectTopBar, { global: { stubs } });
}

function findTab(component: ReturnType<typeof getComponent>, name: string) {
  const tabs = component.findAll('[data-tab-name]');
  return tabs.find((t) => t.attributes('data-tab-name') === name);
}

beforeEach(() => {
  projects.value = new Map([
    ['p1', { id: 'p1', name: 'Alpha' }],
    ['p2', { id: 'p2', name: 'Beta' }],
    ['p3', { id: 'p3', name: 'Gamma' }],
  ]);
  activeId.value = 'p1';
  archivedList.value = [];
  closeCalls.length = 0;
  restoreCalls.length = 0;
  permanentlyDeleteCalls.length = 0;
  clearHistoryCalls.length = 0;
  resetDatabaseCalls.length = 0;
  renameCalls.length = 0;
  reorderCalls.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('ProjectTopBar', () => {
  describe('On close confirm flow', () => {
    it('Should open the confirm modal with the project name', async () => {
      const component = getComponent();
      const alpha = findTab(component, 'Alpha')!;

      await alpha.get('button.close').trigger('click');

      const modal = component.find('[data-modal-open="true"]');
      expect(modal.exists()).toBe(true);
      expect(modal.text()).toContain('Alpha');
    });

    it('Should call closeProject(id) when the user confirms', async () => {
      const component = getComponent();
      await findTab(component, 'Beta')!.get('button.close').trigger('click');

      const confirmBtn = component
        .findAll('button')
        .find((b) => b.text() === 'Close project');
      expect(confirmBtn).toBeTruthy();
      await confirmBtn!.trigger('click');

      expect(closeCalls).toEqual(['p2']);
    });

    it('Should not call closeProject when the user cancels', async () => {
      const component = getComponent();
      await findTab(component, 'Alpha')!.get('button.close').trigger('click');

      const cancelBtn = component
        .findAll('button')
        .find((b) => b.text() === 'Cancel');
      await cancelBtn!.trigger('click');

      expect(closeCalls).toEqual([]);
    });
  });

  describe('On rename', () => {
    it('Should renameProject when the new name differs from the original', async () => {
      const component = getComponent();
      const alpha = findTab(component, 'Alpha')!;

      // Double-click to enter edit mode.
      await alpha.get('button.dbl').trigger('dblclick');
      // Now drive the rename emit directly via the inner stub event.
      const stub = alpha.findComponent(TabListItemStub);
      stub.vm.$emit('rename', 'Renamed');
      await component.vm.$nextTick();

      expect(renameCalls).toEqual([{ id: 'p1', name: 'Renamed' }]);
    });

    it('Should not call renameProject when the rename value matches the original', async () => {
      const component = getComponent();
      const alpha = findTab(component, 'Alpha')!;

      await alpha.get('button.dbl').trigger('dblclick');
      const stub = alpha.findComponent(TabListItemStub);
      // Escape behavior in TabListItem emits the original name back.
      stub.vm.$emit('rename', 'Alpha');
      await component.vm.$nextTick();

      expect(renameCalls).toEqual([]);
    });
  });

  describe('On drag reorder', () => {
    it('Should call reorderProjects with the new id order on drop', async () => {
      const component = getComponent();
      const alpha = findTab(component, 'Alpha')!;
      const beta = findTab(component, 'Beta')!;

      const alphaStub = alpha.findComponent(TabListItemStub);
      alphaStub.vm.$emit('dragstart', {
        dataTransfer: { effectAllowed: 'move' },
      });

      const betaStub = beta.findComponent(TabListItemStub);
      betaStub.vm.$emit('dragover', { preventDefault: () => {} });
      betaStub.vm.$emit('drop');
      await component.vm.$nextTick();

      // Alpha was moved to Beta's position; Beta moves earlier.
      expect(reorderCalls).toEqual([['p2', 'p1', 'p3']]);
    });
  });

  describe('On history menu', () => {
    it('Should render the history menu with the archived list when opened', async () => {
      archivedList.value = [
        { id: 'a1', name: 'Old Cabinet', archivedAt: new Date().toISOString() },
        { id: 'a2', name: 'Older', archivedAt: new Date().toISOString() },
      ];
      const component = getComponent();

      await component
        .get('button[aria-label="Project history"]')
        .trigger('click');

      const stub = component.findComponent(ProjectHistoryMenuStub);
      expect(stub.exists()).toBe(true);
      expect(stub.props('archived')).toHaveLength(2);
      expect(stub.props('archived')[0].name).toBe('Old Cabinet');
    });

    it('Should call restoreProject when the menu emits restore', async () => {
      archivedList.value = [
        { id: 'a1', name: 'Old', archivedAt: new Date().toISOString() },
      ];
      const component = getComponent();

      await component
        .get('button[aria-label="Project history"]')
        .trigger('click');
      await component
        .findComponent(ProjectHistoryMenuStub)
        .vm.$emit('restore', 'a1');

      expect(restoreCalls).toEqual(['a1']);
    });

    it('Should call permanentlyDeleteProject when the menu emits permanently-delete', async () => {
      archivedList.value = [
        { id: 'a1', name: 'Old', archivedAt: new Date().toISOString() },
      ];
      const component = getComponent();

      await component
        .get('button[aria-label="Project history"]')
        .trigger('click');
      await component
        .findComponent(ProjectHistoryMenuStub)
        .vm.$emit('permanently-delete', 'a1');

      expect(permanentlyDeleteCalls).toEqual(['a1']);
    });

    it('Should call clearHistory when the menu emits clear', async () => {
      archivedList.value = [
        { id: 'a1', name: 'Old', archivedAt: new Date().toISOString() },
      ];
      const component = getComponent();

      await component
        .get('button[aria-label="Project history"]')
        .trigger('click');
      await component.findComponent(ProjectHistoryMenuStub).vm.$emit('clear');

      expect(clearHistoryCalls).toHaveLength(1);
    });

    it('Should call resetDatabase when the menu emits reset', async () => {
      const component = getComponent();

      await component
        .get('button[aria-label="Project history"]')
        .trigger('click');
      await component.findComponent(ProjectHistoryMenuStub).vm.$emit('reset');

      expect(resetDatabaseCalls).toHaveLength(1);
    });
  });
});

// TODO(test): mobile menu — duplicates desktop flows in a different DOM branch.
// TODO(test): export/import buttons — pure delegation to mocked composables.
// TODO(test): goHome / new project dialog open — delegation only.
// TODO(test): scroll buttons in TabList — covered by component-internal logic.
