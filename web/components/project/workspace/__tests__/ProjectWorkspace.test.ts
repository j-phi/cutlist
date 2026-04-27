// @vitest-environment nuxt
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import { PROJECT_TABS, type ProjectTabId } from '~/utils/projectTabs';
import ProjectWorkspace from '../ProjectWorkspace.vue';

interface ActiveProject {
  id: string;
  name: string;
}

const tab = ref<ProjectTabId>('bom');
const activeProject = ref<ActiveProject | null>(null);

mockNuxtImport('useProjectTab', () => () => tab);
mockNuxtImport('useProjects', () => () => ({ activeProject }));

function makeStub(name: string) {
  return defineComponent({
    name,
    setup() {
      return () => h('div', { 'data-testid': name });
    },
  });
}

const BomTabStub = makeStub('BomTab');
const ModelTabStub = makeStub('ModelTab');
const StockTabStub = makeStub('StockTab');
const CutlistPreviewStub = makeStub('CutlistPreview');
const InstructionsTabStub = makeStub('InstructionsTab');
const SettingsTabStub = makeStub('SettingsTab');
const ProjectWorkspaceNavStub = makeStub('ProjectWorkspaceNav');
const ProjectWorkspaceModalsStub = makeStub('ProjectWorkspaceModals');

const TAB_TO_TESTID: Record<ProjectTabId, string> = {
  bom: 'BomTab',
  model: 'ModelTab',
  boards: 'StockTab',
  layout: 'CutlistPreview',
  instructions: 'InstructionsTab',
  settings: 'SettingsTab',
};

function getComponent() {
  return shallowMount(ProjectWorkspace, {
    global: {
      stubs: {
        BomTab: BomTabStub,
        ModelTab: ModelTabStub,
        StockTab: StockTabStub,
        CutlistPreview: CutlistPreviewStub,
        InstructionsTab: InstructionsTabStub,
        SettingsTab: SettingsTabStub,
        ProjectWorkspaceNav: ProjectWorkspaceNavStub,
        ProjectWorkspaceModals: ProjectWorkspaceModalsStub,
      },
    },
  });
}

function mountedTabIds(component: ReturnType<typeof getComponent>) {
  return Object.values(TAB_TO_TESTID).filter((testid) =>
    component.find(`[data-testid="${testid}"]`).exists(),
  );
}

describe('ProjectWorkspace', () => {
  afterEach(() => {
    tab.value = 'bom';
    activeProject.value = null;
  });

  describe('Rendering', () => {
    it('Should not render any tab when activeProject is null', () => {
      activeProject.value = null;
      tab.value = 'bom';

      const component = getComponent();

      expect(mountedTabIds(component)).toEqual([]);
    });

    it.each(PROJECT_TABS.map((t) => t.id))(
      'Should render exactly the %s tab when it is active',
      (tabId) => {
        activeProject.value = { id: 'p1', name: 'Project 1' };
        tab.value = tabId;

        const component = getComponent();
        const expectedTestId = TAB_TO_TESTID[tabId];

        expect(mountedTabIds(component)).toEqual([expectedTestId]);
      },
    );
  });
});
