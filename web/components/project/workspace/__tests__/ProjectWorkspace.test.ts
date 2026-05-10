// @vitest-environment nuxt
/**
 * Smoke test — verifies the tab-id → component registry wiring. The tab list
 * itself comes from PROJECT_TABS; the v-if/v-else-if chain in ProjectWorkspace
 * dispatches by id. We only need to confirm a representative pairing and the
 * empty-project guard.
 */
import { afterEach, describe, expect, it } from 'vitest';
import { defineComponent, h, ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import type { ProjectTabId } from '~/utils/projectTabs';
import ProjectWorkspace from '../ProjectWorkspace.vue';

const tab = ref<ProjectTabId>('bom');
const activeProject = ref<{ id: string; name: string } | null>(null);

mockNuxtImport('useProjectTab', () => () => tab);
mockNuxtImport('useProjects', () => () => ({ activeProject }));

const stubs = Object.fromEntries(
  [
    'BomTab',
    'ModelTab',
    'StockTab',
    'CutlistPreview',
    'InstructionsTab',
    'SettingsTab',
    'ProjectWorkspaceNav',
    'ProjectWorkspaceModals',
  ].map((name) => [
    name,
    defineComponent({
      name,
      setup: () => () => h('div', { 'data-testid': name }),
    }),
  ]),
);

function getComponent() {
  return shallowMount(ProjectWorkspace, { global: { stubs } });
}

afterEach(() => {
  tab.value = 'bom';
  activeProject.value = null;
});

describe('ProjectWorkspace', () => {
  it('renders nothing when no project is active', () => {
    const component = getComponent();
    expect(component.find('[data-testid="BomTab"]').exists()).toBe(false);
  });

  it('dispatches the active tab id to the matching component', () => {
    activeProject.value = { id: 'p1', name: 'Project 1' };
    tab.value = 'model';
    const component = getComponent();
    expect(component.find('[data-testid="ModelTab"]').exists()).toBe(true);
    expect(component.find('[data-testid="BomTab"]').exists()).toBe(false);
  });
});
