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
    marginM: 0,
    wasteEndM: 0,
    algorithm: 'linear',
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

  it('renders one chip per placement', () => {
    const layout = makeLayout({
      placements: [
        makePlacement({ partNumber: 1, offsetM: 0, lengthM: 0.5 }),
        makePlacement({ partNumber: 2, offsetM: 0.5, lengthM: 0.7 }),
        makePlacement({ partNumber: 3, offsetM: 1.2, lengthM: 0.3 }),
      ],
    });
    const component = getComponent(layout);
    const chips = component.findAll('.cut-chip');
    expect(chips).toHaveLength(3);
  });

  it('positions chips as percentages of stick length', () => {
    const layout = makeLayout({
      stock: { ...makeLayout().stock, lengthM: 2.0 },
      placements: [
        makePlacement({ partNumber: 1, offsetM: 0, lengthM: 0.5 }),
        makePlacement({ partNumber: 2, offsetM: 0.5, lengthM: 1.0 }),
      ],
    });
    const component = getComponent(layout);
    const chips = component.findAll('.cut-chip');
    expect(chips[0]?.attributes('style')).toContain('left: 0%');
    expect(chips[0]?.attributes('style')).toContain('width: 25%');
    expect(chips[1]?.attributes('style')).toContain('left: 25%');
    expect(chips[1]?.attributes('style')).toContain('width: 50%');
  });

  it('renders chip label with partNumber and formatted length', () => {
    const layout = makeLayout({
      placements: [makePlacement({ partNumber: 7, lengthM: 0.5 })],
    });
    const component = getComponent(layout);
    const chip = component.find('.cut-chip');
    expect(chip.text()).toContain('7');
    expect(chip.text()).toContain('500mm');
  });

  it('renders waste tail when wasteEndM > 0', () => {
    const layout = makeLayout({
      stock: { ...makeLayout().stock, lengthM: 2.0 },
      placements: [makePlacement({ offsetM: 0, lengthM: 1.6 })],
      wasteEndM: 0.4,
    });
    const component = getComponent(layout);
    const waste = component.find('.waste-tail');
    expect(waste.exists()).toBe(true);
    expect(waste.attributes('style')).toContain('left: 80%');
    expect(waste.attributes('style')).toContain('width: 20%');
  });

  it('renders no waste tail when wasteEndM is 0', () => {
    const component = getComponent(makeLayout({ wasteEndM: 0 }));
    expect(component.find('.waste-tail').exists()).toBe(false);
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
    const component = getComponent(layout, 2);
    const text = component.text();
    expect(text).toContain('#3');
    expect(text).toContain('2000mm');
    expect(text).toContain('2 cuts');
    expect(text).toContain('500mm waste');
  });

  it('uses singular "cut" for one placement', () => {
    const component = getComponent(
      makeLayout({ placements: [makePlacement()] }),
    );
    expect(component.text()).toContain('1 cut');
    expect(component.text()).not.toContain('1 cuts');
  });

  it('exposes the material color on the stick via CSS variables', () => {
    const component = getComponent(makeLayout());
    const bar = component.find('.stick-bar');
    const style = bar.attributes('style') ?? '';
    expect(style).toContain('background: #aa0001');
    expect(style).toContain('--chip-color: #aa0002');
    expect(style).toContain('--chip-text: #aa0004');
  });

  it('renders the stick at absolute pixel scale matching the sheet renderer', () => {
    // The on-screen scale must match LayoutListItem's px-per-mm so a 192″
    // stick and a 96″ sheet sit at correct relative size in the canvas.
    // PX_PER_M = 500 → a 96″ (2.4384m) stick is 1219.2px wide.
    const stick = makeLayout({
      stock: { ...makeLayout().stock, lengthM: 2.4384 },
    });
    const component = shallowMount(LinearLayoutListItem, {
      props: { layout: stick, boardIndex: 0 },
    });
    const style = component.find('.stick-bar').attributes('style') ?? '';
    expect(style).toContain('width: 1219.2px');
  });
});
