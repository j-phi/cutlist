// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import type { Micrometres, SheetBoardLayout, StockMatrix } from 'cutlist';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import SheetShoppingList from '../SheetShoppingList.vue';

mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) =>
    m == null ? '' : `${Math.round(m * 1000)}mm`,
);

function makeSheet(
  material: string,
  widthUm: number,
  lengthUm: number,
  role: 'offcut' | 'general',
): SheetBoardLayout {
  return {
    stock: {
      material,
      widthUm: widthUm as Micrometres,
      lengthUm: lengthUm as Micrometres,
      thicknessUm: 18000 as Micrometres,
      role,
    },
    placements: [],
    wasteRatio: 0,
  } as unknown as SheetBoardLayout;
}

describe('SheetShoppingList', () => {
  afterEach(() => vi.restoreAllMocks());

  function mountList(layouts: SheetBoardLayout[], stocks?: StockMatrix[]) {
    return shallowMount(SheetShoppingList, { props: { layouts, stocks } });
  }

  it('renders the general buy list largest-first per material', () => {
    const text = mountList([
      makeSheet('Plywood', 0.6, 1.2, 'general'),
      makeSheet('Plywood', 1.22, 2.44, 'general'),
      makeSheet('Plywood', 1.22, 2.44, 'general'),
    ]).text();
    // Two of the larger sheet, one of the smaller; larger listed first.
    expect(text).toContain('Buy: 2× 1220mm × 2440mm, 1× 600mm × 1200mm');
  });

  it('hides the offcut line when no offcuts exist for the group', () => {
    const text = mountList([
      makeSheet('Plywood', 1.22, 2.44, 'general'),
    ]).text();
    expect(text).not.toContain('Offcuts used');
  });

  it('shows offcuts used vs. available when offcut stock is supplied', () => {
    const stocks: StockMatrix[] = [
      {
        kind: 'sheet',
        material: 'Plywood',
        role: 'offcut',
        sizes: [{ width: 600, length: 1200, thickness: [18], quantity: 3 }],
      } as unknown as StockMatrix,
    ];
    const text = mountList(
      [
        makeSheet('Plywood', 0.6, 1.2, 'offcut'),
        makeSheet('Plywood', 0.6, 1.2, 'offcut'),
        makeSheet('Plywood', 1.22, 2.44, 'general'),
      ],
      stocks,
    ).text();
    expect(text).toContain('Offcuts used: 2/3');
    expect(text).toContain('Buy: 1× 1220mm × 2440mm');
  });

  it('renders nothing when there are no layouts', () => {
    expect(mountList([]).html()).toBe('<!--v-if-->');
  });
});
