// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { shallowMount } from '@vue/test-utils';

import AppShell from '../AppShell.vue';

describe('AppShell', () => {
  function getComponent() {
    return shallowMount(AppShell, {
      slots: {
        default: '<main data-testid="page">Page content</main>',
      },
      global: {
        stubs: {
          ProjectTopBar: true,
        },
      },
    });
  }

  describe('Rendering', () => {
    it('Should render the default slot content', () => {
      const component = getComponent();

      expect(component.find('[data-testid="page"]').exists()).toBe(true);
      expect(component.text()).toContain('Page content');
    });

    it('Should render the persistent ProjectTopBar', () => {
      const component = getComponent();

      expect(component.find('project-top-bar-stub').exists()).toBe(true);
    });
  });
});
