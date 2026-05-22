// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
import type { Micrometres } from 'cutlist';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LinearBoardLayout, LinearBoardLayoutPlacement } from 'cutlist';

import LinearLayoutListItem from '../LinearLayoutListItem.vue';

mockNuxtImport(
  'useFormatDistance',
  () => () => (m: number | undefined | null) =>
    m == null ? '' : `${Math.round(m * 1000)}mm`,
);
mockNuxtImport('getMaterialColor', () => (_hex: string | undefined) => ({
  board: '#aa0001',
  part: '#aa0002',
  partHover: '#aa0003',
  text: '#aa0004',
  textHover: '#aa0005',
  grain: '#aa0006',
}));
// Match the production scale (PX_PER_UM = 1/2000 px/µm) so width assertions are stable.
mockNuxtImport('useGetPx', () => () => (m: number) => `${m * 500}px`);
mockNuxtImport('useProjectSettings', () => () => ({
  showPartNumbers: { value: true },
  showBomName: { value: false },
}));

function makePlacement(
  overrides: Partial<LinearBoardLayoutPlacement> = {},
): LinearBoardLayoutPlacement {
  return {
    partNumber: 1,
    instanceNumber: 1,
    name: 'Rail',
    material: 'Pine 2x4',
    widthUm: 0.089 as Micrometres,
    thicknessUm: 0.038 as Micrometres,
    lengthUm: 0.5 as Micrometres,
    offsetUm: 0 as Micrometres,
    allowanceLengthUm: 0 as Micrometres,
    ...overrides,
  };
}

function makeLayout(
  overrides: Partial<LinearBoardLayout> = {},
): LinearBoardLayout {
  return {
    kind: 'linear',
    stock: {
      name: 'Leftover rail',
      material: 'Pine 2x4',
      crossSectionWidthUm: 0.089 as Micrometres,
      crossSectionThicknessUm: 0.038 as Micrometres,
      lengthUm: 2.0 as Micrometres,
      color: '#abcdef',
      role: 'general',
    },
    placements: [makePlacement()],
    wasteEndUm: 0 as Micrometres,
    ...overrides,
  };
}

describe('LinearLayoutListItem', () => {
  function getComponent(layout: LinearBoardLayout, boardIndex = 0) {
    return shallowMount(LinearLayoutListItem, {
      props: { layout, boardIndex },
    });
  }

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('positions chips as percentages of stick length', () => {
    const layout = makeLayout({
      stock: { ...makeLayout().stock, lengthUm: 2.0 as Micrometres },
      placements: [
        makePlacement({
          partNumber: 1,
          offsetUm: 0 as Micrometres,
          lengthUm: 0.5 as Micrometres,
        }),
        makePlacement({
          partNumber: 2,
          offsetUm: 0.5 as Micrometres,
          lengthUm: 1.0 as Micrometres,
        }),
      ],
    });
    const chips = getComponent(layout).findAll('.cut-chip');
    expect(chips).toHaveLength(2);
    expect(chips[0]?.attributes('style')).toContain('left: 0%');
    expect(chips[0]?.attributes('style')).toContain('width: 25%');
    expect(chips[1]?.attributes('style')).toContain('left: 25%');
    expect(chips[1]?.attributes('style')).toContain('width: 50%');
  });

  it.each([
    [0 as Micrometres, false],
    [0.4 as Micrometres, true],
  ])('renders the waste tail iff wasteEndUm > 0 (%fm → %s)', (waste, shown) => {
    const layout = makeLayout({
      stock: { ...makeLayout().stock, lengthUm: 2.0 as Micrometres },
      placements: [
        makePlacement({
          offsetUm: 0 as Micrometres,
          lengthUm: 1.6 as Micrometres,
        }),
      ],
      wasteEndUm: waste,
    });
    const tail = getComponent(layout).find('.waste-tail');
    expect(tail.exists()).toBe(shown);
    if (shown) {
      expect(tail.attributes('style')).toContain('left: 80%');
      expect(tail.attributes('style')).toContain('width: 20%');
    }
  });

  it('renders the stick label with length, cut count, and waste', () => {
    const layout = makeLayout({
      stock: { ...makeLayout().stock, lengthUm: 2.0 as Micrometres },
      placements: [
        makePlacement({
          partNumber: 1,
          offsetUm: 0 as Micrometres,
          lengthUm: 0.5 as Micrometres,
        }),
        makePlacement({
          partNumber: 2,
          offsetUm: 0.5 as Micrometres,
          lengthUm: 1.0 as Micrometres,
        }),
      ],
      wasteEndUm: 0.5 as Micrometres,
    });
    const text = getComponent(layout, 2).text();
    expect(text).toContain('#3');
    expect(text).toContain('2000mm');
    expect(text).toContain('2 cuts');
    expect(text).toContain('500mm waste');
  });

  it('renders the stock name and material category in the header', () => {
    const text = getComponent(makeLayout()).text();
    expect(text).toContain('Leftover rail');
    expect(text).toContain('Pine 2x4');
  });

  it('renders the stick at absolute pixel scale matching the sheet renderer', () => {
    // Same PX_PER_UM as LayoutListItem so a 96″ stick and a 96″ sheet sit
    // at correct relative size in the canvas. 2.4384m × 500 = 1219.2px.
    const stick = makeLayout({
      stock: { ...makeLayout().stock, lengthUm: 2.4384 as Micrometres },
    });
    const style = getComponent(stick).find('.stick-bar').attributes('style');
    expect(style).toContain('width: 1219.2px');
  });
});
