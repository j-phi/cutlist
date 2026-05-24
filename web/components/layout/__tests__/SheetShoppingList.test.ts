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
  opts: { cost?: number; fillRatio?: number } = {},
): SheetBoardLayout {
  // A single placement covering `fillRatio` of the board area, so the
  // component's yield display has a deterministic value.
  const fill = opts.fillRatio ?? 0;
  const placements =
    fill > 0
      ? [
          {
            partNumber: 1,
            instanceNumber: 1,
            name: 'P',
            material,
            widthUm: widthUm as Micrometres,
            lengthUm: (lengthUm * fill) as Micrometres,
            thicknessUm: 18000 as Micrometres,
            leftUm: 0 as Micrometres,
            rightUm: widthUm as Micrometres,
            bottomUm: 0 as Micrometres,
            topUm: (lengthUm * fill) as Micrometres,
            allowanceWidthUm: 0 as Micrometres,
            allowanceLengthUm: 0 as Micrometres,
          },
        ]
      : [];
  return {
    kind: 'sheet',
    stock: {
      material,
      widthUm: widthUm as Micrometres,
      lengthUm: lengthUm as Micrometres,
      thicknessUm: 18000 as Micrometres,
      role,
      ...(opts.cost === undefined ? {} : { cost: opts.cost }),
    },
    placements,
    marginUm: 0 as Micrometres,
    algorithm: 'tidy',
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

  it('shows yield % per group and material cost when priced', () => {
    const text = mountList([
      // One board half filled → 50% yield, costing 60.
      makeSheet('Plywood', 1000, 1000, 'general', {
        cost: 60,
        fillRatio: 0.5,
      }),
    ]).text();
    expect(text).toContain('Yield: 50%');
    expect(text).toContain('Cost: 60');
    expect(text).toContain('Total material cost: 60');
  });

  it('omits cost (no $0) for an unpriced group but still shows yield', () => {
    const text = mountList([
      makeSheet('MDF', 1000, 1000, 'general', { fillRatio: 1 }),
    ]).text();
    expect(text).toContain('Yield: 100%');
    expect(text).not.toContain('Cost:');
    expect(text).not.toContain('Total material cost');
  });

  it('shows an edge-banding line and folds its cost into the total (F7)', () => {
    const wrapper = shallowMount(SheetShoppingList, {
      props: {
        layouts: [
          makeSheet('Plywood', 1000, 1000, 'general', {
            cost: 60,
            fillRatio: 0.5,
          }),
        ],
        bandingLengthUm: 1_800_000 as Micrometres,
        bandingCost: 18,
      },
    });
    const text = wrapper.text();
    expect(text).toContain('Edge banding:');
    expect(text).toContain('Cost: 18');
    // 60 (sheet) + 18 (banding) folded into the project total (FR-BND-3).
    expect(text).toContain('Total material cost: 78');
  });

  it('renders a banding line even with no sheet groups', () => {
    const wrapper = shallowMount(SheetShoppingList, {
      props: {
        layouts: [],
        bandingLengthUm: 900_000 as Micrometres,
        bandingCost: undefined,
      },
    });
    expect(wrapper.text()).toContain('Edge banding:');
    // Unpriced banding → no total line.
    expect(wrapper.text()).not.toContain('Total material cost');
  });
});
