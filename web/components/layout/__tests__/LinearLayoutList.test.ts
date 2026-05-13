// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import type { Micrometres } from 'cutlist';
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
  lengthUm: Micrometres,
  placementsCount = 1,
): LinearBoardLayout {
  return {
    kind: 'linear',
    stock: {
      material,
      crossSectionWidthUm: 0.089 as Micrometres,
      crossSectionThicknessUm: 0.038 as Micrometres,
      lengthUm,
    },
    placements: Array.from({ length: placementsCount }, (_, i) => ({
      partNumber: i + 1,
      instanceNumber: 1,
      name: `Part ${i + 1}`,
      material,
      widthUm: 0.089 as Micrometres,
      thicknessUm: 0.038 as Micrometres,
      lengthUm: 0.3 as Micrometres,
      offsetUm: 0 as Micrometres,
      allowanceLengthUm: 0 as Micrometres,
    })),
    wasteEndUm: 0 as Micrometres,
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

  // Wiring only; aggregation covered in shoppingList.test.ts.
  it('renders one LinearLayoutListItem per stick with ascending lengths and per-group indices', () => {
    const layouts = [
      makeLinear('Pine 2x4', 3.048 as Micrometres),
      makeLinear('Pine 2x4', 2.4384 as Micrometres),
      makeLinear('Oak 1x6', 2.4384 as Micrometres),
    ];
    const items = getComponent(layouts).findAllComponents({
      name: 'LinearLayoutListItem',
    });
    expect(
      items.map((i) => [
        (i.props('layout') as LinearBoardLayout).stock.material,
        (i.props('layout') as LinearBoardLayout).stock.lengthUm,
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
      makeLinear('Pine 2x4', 2.4384 as Micrometres),
      makeLinear('Pine 2x4', 3.048 as Micrometres),
    ])
      .find('p')
      .text();
    expect(summary).toContain('1× 2438mm');
    expect(summary).toContain('1× 3048mm');
    expect(summary).toContain('2 sticks total');
  });
});
