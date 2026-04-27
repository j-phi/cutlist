// @vitest-environment nuxt
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import ProjectTopBar from '../ProjectTopBar.vue';

// ── Composable mocks ─────────────────────────────────────────────────────────

const projects = ref<Map<string, { id: string; name: string }>>(new Map());
const activeId = ref<string | null>(null);
const archivedList = ref<
  Array<{ id: string; name: string; archivedAt: string }>
>([]);

const closeProject = vi.fn();
const restoreProject = vi.fn().mockResolvedValue(undefined);
const permanentlyDeleteProject = vi.fn().mockResolvedValue(undefined);
const clearHistory = vi.fn().mockResolvedValue(undefined);
const renameProject = vi.fn().mockResolvedValue(undefined);
const reorderProjects = vi.fn();

mockNuxtImport('useProjects', () => () => ({
  projects,
  activeId,
  archivedList,
  closeProject,
  restoreProject,
  permanentlyDeleteProject,
  clearHistory,
  renameProject,
  reorderProjects,
}));

const setActiveProject = vi.fn();
const goHome = vi.fn();
mockNuxtImport('useProjectNavigation', () => () => ({
  setActiveProject,
  goHome,
}));

const exportProject = vi.fn().mockResolvedValue(undefined);
mockNuxtImport('useExportProject', () => () => ({ exportProject }));

const pickAndImport = vi.fn().mockResolvedValue(undefined);
mockNuxtImport('useImportProject', () => () => ({ pickAndImport }));

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
  closeProject.mockClear();
  restoreProject.mockClear();
  permanentlyDeleteProject.mockClear();
  renameProject.mockClear();
  reorderProjects.mockClear();
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

      expect(closeProject).toHaveBeenCalledWith('p2');
    });

    it('Should not call closeProject when the user cancels', async () => {
      const component = getComponent();
      await findTab(component, 'Alpha')!.get('button.close').trigger('click');

      const cancelBtn = component
        .findAll('button')
        .find((b) => b.text() === 'Cancel');
      await cancelBtn!.trigger('click');

      expect(closeProject).not.toHaveBeenCalled();
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

      expect(renameProject).toHaveBeenCalledWith('p1', 'Renamed');
    });

    it('Should not call renameProject when the rename value matches the original', async () => {
      const component = getComponent();
      const alpha = findTab(component, 'Alpha')!;

      await alpha.get('button.dbl').trigger('dblclick');
      const stub = alpha.findComponent(TabListItemStub);
      // Escape behavior in TabListItem emits the original name back.
      stub.vm.$emit('rename', 'Alpha');
      await component.vm.$nextTick();

      expect(renameProject).not.toHaveBeenCalled();
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

      expect(reorderProjects).toHaveBeenCalledTimes(1);
      const ids = reorderProjects.mock.calls[0][0];
      // Alpha was moved to Beta's position; Beta moves earlier.
      expect(ids).toEqual(['p2', 'p1', 'p3']);
    });
  });

  describe('On history menu', () => {
    it('Should list archived projects when opened', async () => {
      archivedList.value = [
        { id: 'a1', name: 'Old Cabinet', archivedAt: new Date().toISOString() },
      ];
      const component = getComponent();

      const historyBtn = component.get('button[aria-label="Project history"]');
      await historyBtn.trigger('click');

      expect(component.text()).toContain('Old Cabinet');
    });

    it('Should call restoreProject when reopen is clicked', async () => {
      archivedList.value = [
        { id: 'a1', name: 'Old', archivedAt: new Date().toISOString() },
      ];
      const component = getComponent();

      await component
        .get('button[aria-label="Project history"]')
        .trigger('click');
      const reopenBtn = component
        .findAll('button')
        .find((b) => b.attributes('title') === 'Reopen');
      expect(reopenBtn).toBeTruthy();
      await reopenBtn!.trigger('click');

      expect(restoreProject).toHaveBeenCalledWith('a1');
    });

    it('Should require two clicks before permanentlyDeleteProject is called', async () => {
      archivedList.value = [
        { id: 'a1', name: 'Old', archivedAt: new Date().toISOString() },
      ];
      const component = getComponent();

      await component
        .get('button[aria-label="Project history"]')
        .trigger('click');

      const trashButtons = component
        .findAll('button')
        .filter((b) => b.attributes('title') === 'Delete permanently');
      expect(trashButtons.length).toBeGreaterThan(0);
      // First click on the (only) trash icon — arms the confirm prompt.
      await trashButtons[0].trigger('click');
      await component.vm.$nextTick();
      expect(permanentlyDeleteProject).not.toHaveBeenCalled();

      // Now a "Delete" confirm button is visible.
      const confirmDelete = component
        .findAll('button')
        .find((b) => b.text() === 'Delete');
      expect(confirmDelete).toBeTruthy();
      await confirmDelete!.trigger('click');

      expect(permanentlyDeleteProject).toHaveBeenCalledWith('a1');
    });
  });
});

// TODO(test): mobile menu — duplicates desktop flows in a different DOM branch.
// TODO(test): clear-history confirm — small two-state bookkeeping.
// TODO(test): export/import buttons — pure delegation to mocked composables.
// TODO(test): goHome / new project dialog open — delegation only.
// TODO(test): scroll buttons in TabList — covered by component-internal logic.
