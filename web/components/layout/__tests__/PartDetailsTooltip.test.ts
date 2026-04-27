// @vitest-environment nuxt
import { describe, expect, it, beforeEach } from 'vitest';
import { ref } from 'vue';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import PartDetailsTooltip from '../PartDetailsTooltip.vue';

const x = ref(0);
const y = ref(0);

mockNuxtImport('useGlobalMouse', () => () => ({ x, y }));

const PartDetailsStub = {
  name: 'PartDetails',
  props: ['part', 'placement'],
  template: '<div data-testid="part-details" />',
};

describe('PartDetailsTooltip', () => {
  const part = {
    partNumber: 1,
    instanceNumber: 1,
    name: 'Shelf',
    material: 'Plywood',
    widthM: 0.3,
    lengthM: 1.2,
    thicknessM: 0.018,
    leftM: 0.05,
    topM: 0.1,
    rightM: 0.35,
    bottomM: 1.3,
  };

  beforeEach(() => {
    x.value = 0;
    y.value = 0;
  });

  function getComponent() {
    return shallowMount(PartDetailsTooltip, {
      props: { part },
      global: {
        stubs: {
          PartDetails: PartDetailsStub,
        },
      },
    });
  }

  describe('Rendering', () => {
    it('Should render nothing when mouse is at the origin (0,0)', () => {
      const component = getComponent();

      expect(component.find('[data-testid="part-details"]').exists()).toBe(
        false,
      );
    });

    it('Should position itself at the mouse coordinates once it moves', async () => {
      const component = getComponent();

      x.value = 120;
      y.value = 240;
      await component.vm.$nextTick();

      const wrapper = component.get('div.fixed');
      expect(wrapper.attributes('style')).toContain('left: 120px');
      expect(wrapper.attributes('style')).toContain('top: 240px');
    });

    it('Should pass part as both part and placement to PartDetails', async () => {
      const component = getComponent();

      x.value = 50;
      y.value = 60;
      await component.vm.$nextTick();

      const stub = component.findComponent(PartDetailsStub);
      expect(stub.exists()).toBe(true);
      expect(stub.props('part')).toEqual(part);
      expect(stub.props('placement')).toEqual(part);
    });
  });
});
