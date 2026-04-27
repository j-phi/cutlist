// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { BoardLayoutLeftover } from 'cutlist';

import LayoutLeftoverList from '../LayoutLeftoverList.vue';
import type { GroupedLeftover } from '../layout-types';

mockNuxtImport('useGetPx', () => () => (m: number) => `${m * 100}px`);
mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) => (m == null ? '' : `${m}m`),
);

const UIconStub = { template: '<i v-bind="$attrs" />' };

function makeLeftover(
  partNumber: number,
  overrides: Partial<BoardLayoutLeftover> = {},
): BoardLayoutLeftover {
  return {
    partNumber,
    instanceNumber: 1,
    name: `Part ${partNumber}`,
    material: 'Plywood',
    widthM: 0.3,
    lengthM: 0.6,
    thicknessM: 0.018,
    ...overrides,
  };
}

function makeGroup(
  partNumber: number,
  qty: number,
  overrides: Partial<BoardLayoutLeftover> = {},
): GroupedLeftover {
  return { part: makeLeftover(partNumber, overrides), qty };
}

describe('LayoutLeftoverList', () => {
  function getComponent(leftovers: GroupedLeftover[]) {
    return shallowMount(LayoutLeftoverList, {
      props: { leftovers },
      global: { stubs: { UIcon: UIconStub } },
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Rendering', () => {
    it('Should pluralize the unplaced count by summing qty', () => {
      const component = getComponent([makeGroup(1, 2), makeGroup(2, 3)]);

      expect(component.text()).toContain('5 unplaced');
    });

    it('Should render the unplaced count even when only one part', () => {
      const component = getComponent([makeGroup(1, 1)]);

      expect(component.text()).toContain('1 unplaced');
    });

    it('Should render one <li> per grouped leftover', () => {
      const component = getComponent([
        makeGroup(1, 1),
        makeGroup(2, 4),
        makeGroup(3, 1),
      ]);

      expect(component.findAll('li')).toHaveLength(3);
    });

    it('Should render the length grain-lock SVG path when grainLock is "length"', () => {
      const component = getComponent([
        makeGroup(1, 1, { grainLock: 'length' }),
      ]);

      const path = component.find('li svg path').attributes('d');
      expect(path).toBe(
        'm11.95 7.95l-1.414 1.414L8 6.828V20H6V6.828L3.466 9.364L2.05 7.95L7 3zm10 8.1L17 21l-4.95-4.95l1.414-1.414l2.537 2.536L16 4h2v13.172l2.536-2.536z',
      );
    });

    it('Should render the width grain-lock SVG path when grainLock is "width"', () => {
      const component = getComponent([makeGroup(1, 1, { grainLock: 'width' })]);

      const path = component.find('li svg path').attributes('d');
      expect(path).toBe(
        'M16.05 12.05L21 17l-4.95 4.95l-1.414-1.415L17.172 18H4v-2h13.172l-2.536-2.535zm-8.1-10l1.414 1.414l-2.536 2.535H20v2H6.828l2.536 2.536L7.95 11.95L3 7z',
      );
    });
  });

  describe('On pointer interaction', () => {
    it('Should emit grainClick when pointerup is within CLICK_THRESHOLD', async () => {
      const part = makeLeftover(7);
      const component = getComponent([{ part, qty: 1 }]);

      const li = component.get('li');
      await li.trigger('pointerdown', { clientX: 100, clientY: 100 });
      document.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 102, clientY: 101 }),
      );

      expect(component.emitted('grainClick')).toEqual([[part]]);
    });

    it('Should NOT emit grainClick when pointerup is beyond CLICK_THRESHOLD', async () => {
      const part = makeLeftover(7);
      const component = getComponent([{ part, qty: 1 }]);

      const li = component.get('li');
      await li.trigger('pointerdown', { clientX: 100, clientY: 100 });
      document.dispatchEvent(
        new PointerEvent('pointerup', { clientX: 120, clientY: 100 }),
      );

      expect(component.emitted('grainClick')).toBeUndefined();
    });
  });
});
