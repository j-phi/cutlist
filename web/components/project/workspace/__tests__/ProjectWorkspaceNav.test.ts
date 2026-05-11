// @vitest-environment nuxt
import { describe, expect, it, vi } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { PROJECT_TABS } from '~/utils/projectTabs';
import ProjectWorkspaceNav from '../ProjectWorkspaceNav.vue';

const tabRef = ref<string>('bom');
const isComputing = ref(false);
const setTab = vi.fn();

mockNuxtImport('useProjectTab', () => () => tabRef);
mockNuxtImport('useProjectNavigation', () => () => ({ setTab }));
mockNuxtImport('useBoardLayoutsQuery', () => () => ({ isComputing }));

describe('ProjectWorkspaceNav', () => {
  function getComponent() {
    tabRef.value = 'bom';
    isComputing.value = false;
    return shallowMount(ProjectWorkspaceNav, {
      global: {
        stubs: {
          UIcon: true,
          Transition: false,
        },
      },
    });
  }

  describe('Rendering', () => {
    it('Should render every registry tab in order with labels', () => {
      const component = getComponent();
      const tabs = component.findAll('[role="tab"]');

      expect(tabs).toHaveLength(PROJECT_TABS.length);
      for (let i = 0; i < PROJECT_TABS.length; i += 1) {
        expect(tabs[i].text()).toContain(PROJECT_TABS[i].label);
      }
    });

    it('Should mark the active tab according to useProjectTab', async () => {
      const component = getComponent();

      tabRef.value = 'settings';
      await component.vm.$nextTick();

      const tabs = component.findAll('[role="tab"]');
      const settingsIndex = PROJECT_TABS.findIndex((t) => t.id === 'settings');
      const bomIndex = PROJECT_TABS.findIndex((t) => t.id === 'bom');

      expect(tabs[settingsIndex].attributes('aria-selected')).toBe('true');
      expect(tabs[bomIndex].attributes('aria-selected')).toBe('false');
    });
  });

  describe('On tab click', () => {
    it('Should call setTab with the clicked tab id', async () => {
      setTab.mockClear();
      const component = getComponent();
      const tabs = component.findAll('[role="tab"]');
      const layoutIndex = PROJECT_TABS.findIndex((t) => t.id === 'layout');

      await tabs[layoutIndex].trigger('click');

      expect(setTab).toHaveBeenCalledWith('layout');
    });
  });
});
