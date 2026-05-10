// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LinearBoardLayout } from 'cutlist';

import LinearLayoutList from '../LinearLayoutList.vue';

mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) =>
    m == null ? '' : `${Math.round(m * 1000)}mm`,
);

function makeLinear(
  material: string,
  lengthM: number,
  placementsCount = 1,
): LinearBoardLayout {
  return {
    kind: 'linear',
    stock: {
      material,
      crossSectionWidthM: 0.089,
      crossSectionThicknessM: 0.038,
      lengthM,
    },
    placements: Array.from({ length: placementsCount }, (_, i) => ({
      partNumber: i + 1,
      instanceNumber: 1,
      name: `Part ${i + 1}`,
      material,
      offsetM: 0,
      lengthM: 0.3,
    })),
    marginM: 0,
    wasteEndM: 0,
    algorithm: 'linear',
  };
}

describe('LinearLayoutList', () => {
  function getComponent(layouts: LinearBoardLayout[]) {
    return shallowMount(LinearLayoutList, {
      props: { layouts },
      global: {
        stubs: {
          LinearLayoutListItem: true,
        },
      },
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('groups layouts by material', () => {
    const layouts = [
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Oak 1x6', 2.4384),
      makeLinear('Pine 2x4', 3.048),
    ];
    const component = getComponent(layouts);
    const sections = component.findAll('section');
    expect(sections).toHaveLength(2);

    const titles = component.findAll('h2').map((h) => h.text());
    expect(titles).toContain('Pine 2x4');
    expect(titles).toContain('Oak 1x6');
  });

  it('renders the shopping list summary per group', () => {
    const layouts = [
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Pine 2x4', 3.048),
      makeLinear('Pine 2x4', 3.048),
    ];
    const component = getComponent(layouts);
    const summary = component.find('p').text();
    expect(summary).toContain('4× 2438mm');
    expect(summary).toContain('2× 3048mm');
    expect(summary).toContain('6 sticks total');
  });

  it('uses singular "stick" when total is one', () => {
    const layouts = [makeLinear('Pine 2x4', 2.4384)];
    const component = getComponent(layouts);
    const summary = component.find('p').text();
    expect(summary).toContain('1 stick total');
    expect(summary).not.toContain('1 sticks');
  });

  it('renders one LinearLayoutListItem per stick in the group', () => {
    const layouts = [
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Pine 2x4', 3.048),
      makeLinear('Oak 1x6', 2.4384),
    ];
    const component = getComponent(layouts);
    const items = component.findAllComponents({
      name: 'LinearLayoutListItem',
    });
    expect(items).toHaveLength(3);
  });

  it('passes each layout into the item with a stable board index', () => {
    const layouts = [
      makeLinear('Pine 2x4', 3.048),
      makeLinear('Pine 2x4', 2.4384),
    ];
    const component = getComponent(layouts);
    const items = component.findAllComponents({
      name: 'LinearLayoutListItem',
    });
    const lengths = items.map(
      (i) => (i.props('layout') as LinearBoardLayout).stock.lengthM,
    );
    // Sorted ascending within the group.
    expect(lengths).toEqual([2.4384, 3.048]);
    const indices = items.map((i) => i.props('boardIndex'));
    expect(indices).toEqual([0, 1]);
  });

  it('renders nothing when layouts is empty', () => {
    const component = getComponent([]);
    expect(component.findAll('section')).toHaveLength(0);
  });

  it('sorts material groups alphabetically', () => {
    const layouts = [
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Oak 1x6', 2.4384),
      makeLinear('Birch 1x4', 2.4384),
    ];
    const component = getComponent(layouts);
    const titles = component.findAll('h2').map((h) => h.text());
    expect(titles).toEqual(['Birch 1x4', 'Oak 1x6', 'Pine 2x4']);
  });
});
