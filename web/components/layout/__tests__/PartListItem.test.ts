// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ref, type Ref } from 'vue';

import type { SheetBoardLayoutPlacement } from 'cutlist';

import PartListItem from '../PartListItem.vue';

const showPartNumbers = ref<boolean | undefined>(true);

mockNuxtImport('useGetPx', () => () => (m: number) => `${m * 100}px`);
mockNuxtImport('useProjectSettings', () => () => ({ showPartNumbers }));

function makePlacement(
  overrides: Partial<SheetBoardLayoutPlacement> = {},
): SheetBoardLayoutPlacement {
  return {
    partNumber: 1,
    instanceNumber: 1,
    name: 'Side panel',
    material: 'Plywood',
    widthM: 0.3,
    lengthM: 0.6,
    thicknessM: 0.018,
    leftM: 0,
    rightM: 0.3,
    topM: 0.6,
    bottomM: 0,
    ...overrides,
  };
}

describe('PartListItem', () => {
  function getComponent(
    props: Partial<InstanceType<typeof PartListItem>['$props']> = {},
    provides: {
      hovered?: Ref<number | null>;
      toggle?: (i: number) => void;
    } = {},
  ) {
    return shallowMount(PartListItem, {
      props: {
        placement: makePlacement(),
        index: 0,
        ...props,
      },
      global: {
        provide: {
          layoutHoveredIndex: provides.hovered ?? ref<number | null>(null),
          layoutToggleGrainLock: provides.toggle ?? (() => {}),
        },
      },
    });
  }

  afterEach(() => {
    showPartNumbers.value = true;
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('Should apply is-hovered when injected ref equals index', () => {
      const hovered = ref<number | null>(2);
      const component = getComponent({ index: 2 }, { hovered });

      expect(component.get('[role="button"]').classes()).toContain(
        'is-hovered',
      );
    });

    it('Should NOT apply is-hovered when injected ref differs from index', () => {
      const hovered = ref<number | null>(2);
      const component = getComponent({ index: 0 }, { hovered });

      expect(component.get('[role="button"]').classes()).not.toContain(
        'is-hovered',
      );
    });

    it('Should hide the part number <p> when showPartNumbers is false', () => {
      showPartNumbers.value = false;
      const component = getComponent({
        placement: makePlacement({ partNumber: 42 }),
      });

      expect(component.find('p.part-number').exists()).toBe(false);
    });

    it('Should show the part number <p> when showPartNumbers is true', () => {
      showPartNumbers.value = true;
      const component = getComponent({
        placement: makePlacement({ partNumber: 42 }),
      });

      const p = component.find('p.part-number');
      expect(p.exists()).toBe(true);
      expect(p.text()).toBe('42');
    });

    it('Should render the grain SVG only when placement.grainLock is truthy', () => {
      const without = getComponent({
        placement: makePlacement({ grainLock: undefined }),
      });
      expect(without.find('.part-grain').exists()).toBe(false);

      const withLock = getComponent({
        placement: makePlacement({ grainLock: 'length' }),
      });
      expect(withLock.find('.part-grain').exists()).toBe(true);
    });
  });

  describe('On keyboard activation', () => {
    it('Should call layoutToggleGrainLock(index) when Enter is pressed', async () => {
      const toggle = vi.fn();
      const component = getComponent({ index: 3 }, { toggle });

      await component.get('[role="button"]').trigger('keydown.enter');

      expect(toggle).toHaveBeenCalledWith(3);
    });

    it('Should call layoutToggleGrainLock(index) when Space is pressed', async () => {
      const toggle = vi.fn();
      const component = getComponent({ index: 5 }, { toggle });

      await component.get('[role="button"]').trigger('keydown.space');

      expect(toggle).toHaveBeenCalledWith(5);
    });
  });
});
