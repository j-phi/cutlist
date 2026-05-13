// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import type { Micrometres } from 'cutlist';
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';

import PartDetails from '../PartDetails.vue';

mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) =>
    m == null ? undefined : `${m}m`,
);

describe('PartDetails', () => {
  const part = {
    partNumber: 7,
    instanceNumber: 2,
    name: 'Side panel',
    material: 'Plywood',
    widthUm: 0.3 as Micrometres,
    lengthUm: 1.2 as Micrometres,
    thicknessUm: 0.018 as Micrometres,
  };

  function getComponent(props: Record<string, unknown> = {}) {
    return shallowMount(PartDetails, {
      props: {
        part,
        ...props,
      },
    });
  }

  describe('Rendering', () => {
    it('Should render the heading with partNumber.instanceNumber name', () => {
      const component = getComponent();

      expect(component.get('h3').text()).toBe('7.2 Side panel');
    });

    it('Should render width, length, and thickness rows always', () => {
      const component = getComponent();
      const rows = component.findAll('tbody tr');

      // No placement -> 3 rows
      expect(rows).toHaveLength(3);
      const text = component.text();
      expect(text).toContain('Width');
      expect(text).toContain('0.3m');
      expect(text).toContain('Length');
      expect(text).toContain('1.2m');
      expect(text).toContain('Thick');
      expect(text).toContain('0.018m');
    });

    it('Should not render placement rows when placement is undefined', () => {
      const component = getComponent();
      const text = component.text();

      expect(text).not.toContain('Left');
      expect(text).not.toContain('Top');
      expect(text).not.toContain('Right');
      expect(text).not.toContain('Bottom');
    });

    it('Should render placement rows when placement is provided', () => {
      const component = getComponent({
        placement: {
          ...part,
          leftUm: 0.05 as Micrometres,
          topUm: 0.1 as Micrometres,
          rightUm: 0.35 as Micrometres,
          bottomUm: 1.3 as Micrometres,
        },
      });
      const rows = component.findAll('tbody tr');

      // 3 dimension rows + 4 placement rows
      expect(rows).toHaveLength(7);
      const text = component.text();
      expect(text).toContain('Left');
      expect(text).toContain('0.05m');
      expect(text).toContain('Top');
      expect(text).toContain('0.1m');
      expect(text).toContain('Right');
      expect(text).toContain('0.35m');
      expect(text).toContain('Bottom');
      expect(text).toContain('1.3m');
    });
  });
});
