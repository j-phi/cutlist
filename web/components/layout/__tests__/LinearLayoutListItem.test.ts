// @vitest-environment nuxt
import { shallowMount } from '@vue/test-utils';
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
// Match the production scale (PX_PER_M = 500) so width assertions are stable.
mockNuxtImport('useGetPx', () => () => (m: number) => `${m * 500}px`);
mockNuxtImport('useProjectSettings', () => () => ({
  showPartNumbers: { value: true },
}));

function makePlacement(
  overrides: Partial<LinearBoardLayoutPlacement> = {},
): LinearBoardLayoutPlacement {
  return {
    partNumber: 1,
    instanceNumber: 1,
    name: 'Rail',
    material: 'Pine 2x4',
    widthM: 0.089,
    thicknessM: 0.038,
    lengthM: 0.5,
    offsetM: 0,
    ...overrides,
  };
}

function makeLayout(
  overrides: Partial<LinearBoardLayout> = {},
): LinearBoardLayout {
  return {
    kind: 'linear',
    stock: {
      material: 'Pine 2x4',
      crossSectionWidthM: 0.089,
      crossSectionThicknessM: 0.038,
      lengthM: 2.0,
      color: '#abcdef',
    },
    placements: [makePlacement()],
    wasteEndM: 0,
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
      stock: { ...makeLayout().stock, lengthM: 2.0 },
      placements: [
        makePlacement({ partNumber: 1, offsetM: 0, lengthM: 0.5 }),
        makePlacement({ partNumber: 2, offsetM: 0.5, lengthM: 1.0 }),
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
    [0, false],
    [0.4, true],
  ])('renders the waste tail iff wasteEndM > 0 (%fm → %s)', (waste, shown) => {
    const layout = makeLayout({
      stock: { ...makeLayout().stock, lengthM: 2.0 },
      placements: [makePlacement({ offsetM: 0, lengthM: 1.6 })],
      wasteEndM: waste,
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
      stock: { ...makeLayout().stock, lengthM: 2.0 },
      placements: [
        makePlacement({ partNumber: 1, offsetM: 0, lengthM: 0.5 }),
        makePlacement({ partNumber: 2, offsetM: 0.5, lengthM: 1.0 }),
      ],
      wasteEndM: 0.5,
    });
    const text = getComponent(layout, 2).text();
    expect(text).toContain('#3');
    expect(text).toContain('2000mm');
    expect(text).toContain('2 cuts');
    expect(text).toContain('500mm waste');
  });

  it('renders the stick at absolute pixel scale matching the sheet renderer', () => {
    // Same PX_PER_M as LayoutListItem so a 96″ stick and a 96″ sheet sit
    // at correct relative size in the canvas. 2.4384m × 500 = 1219.2px.
    const stick = makeLayout({
      stock: { ...makeLayout().stock, lengthM: 2.4384 },
    });
    const style = getComponent(stick).find('.stick-bar').attributes('style');
    expect(style).toContain('width: 1219.2px');
  });
});
