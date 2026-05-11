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
      widthM: 0.089,
      thicknessM: 0.038,
      lengthM: 0.3,
      offsetM: 0,
    })),
    wasteEndM: 0,
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

  // Group-by-material / sort / shopping-summary semantics are covered in
  // shoppingList.test.ts. This test verifies the template wires the
  // aggregator output through to LinearLayoutListItem with the right
  // per-group board index.
  it('renders one LinearLayoutListItem per stick with ascending lengths and per-group indices', () => {
    const layouts = [
      makeLinear('Pine 2x4', 3.048),
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Oak 1x6', 2.4384),
    ];
    const items = getComponent(layouts).findAllComponents({
      name: 'LinearLayoutListItem',
    });
    expect(
      items.map((i) => [
        (i.props('layout') as LinearBoardLayout).stock.material,
        (i.props('layout') as LinearBoardLayout).stock.lengthM,
        i.props('boardIndex'),
      ]),
    ).toEqual([
      ['Oak 1x6', 2.4384, 0],
      ['Pine 2x4', 2.4384, 0],
      ['Pine 2x4', 3.048, 1],
    ]);
  });

  it('renders the per-group shopping summary', () => {
    const summary = getComponent([
      makeLinear('Pine 2x4', 2.4384),
      makeLinear('Pine 2x4', 3.048),
    ])
      .find('p')
      .text();
    expect(summary).toContain('1× 2438mm');
    expect(summary).toContain('1× 3048mm');
    expect(summary).toContain('2 sticks total');
  });

  it('renders nothing when layouts is empty', () => {
    expect(getComponent([]).findAll('section')).toHaveLength(0);
  });
});
