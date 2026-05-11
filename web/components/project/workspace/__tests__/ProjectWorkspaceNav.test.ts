// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { PROJECT_TABS, projectPath } from '~/utils/projectTabs';
import ProjectWorkspaceNav from '../ProjectWorkspaceNav.vue';

const activeId = ref<string | null>('proj-1');
const isComputing = ref(false);

mockNuxtImport('useProjects', () => () => ({ activeId }));
mockNuxtImport('useBoardLayoutsQuery', () => () => ({ isComputing }));

describe('ProjectWorkspaceNav', () => {
  it('renders one NuxtLink per registry tab pointing at its projectPath', () => {
    const wrapper = shallowMount(ProjectWorkspaceNav, {
      global: {
        stubs: {
          UIcon: true,
          Transition: false,
          // Render NuxtLink as <a :href="to"> so the slot mounts and the
          // wired URL is visible to the assertions below.
          NuxtLink: {
            props: ['to'],
            template: '<a :href="to" role="tab"><slot /></a>',
          },
        },
      },
    });
    const links = wrapper.findAll('[role="tab"]');

    expect(links).toHaveLength(PROJECT_TABS.length);
    for (let i = 0; i < PROJECT_TABS.length; i += 1) {
      expect(links[i].attributes('href')).toBe(
        projectPath('proj-1', PROJECT_TABS[i].id),
      );
      expect(links[i].text()).toContain(PROJECT_TABS[i].label);
    }
  });
});
