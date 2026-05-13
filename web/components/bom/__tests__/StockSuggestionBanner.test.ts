// @vitest-environment nuxt
import { describe, expect, it, beforeEach } from 'vitest';
import { ref } from 'vue';
import { mount } from '@vue/test-utils';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { StockMatrix } from 'cutlist';

import StockSuggestionBanner from '../StockSuggestionBanner.vue';
import { UButtonStub } from '~/test-utils/stubs';

const mm = (n: number) => n / 1000;

interface MockPart {
  size: { thickness: number; width: number; length: number };
}

const enabledModels = ref<Array<{ parts: MockPart[] }>>([]);
const stocks = ref<StockMatrix[]>([]);
const distanceUnit = ref<'mm' | 'in'>('mm');
const precision = ref({ kind: 'decimal' as const, step: 0.1 });

mockNuxtImport('useProjects', () => () => ({ enabledModels }));
mockNuxtImport('useProjectSettings', () => () => ({
  stocks,
  distanceUnit,
  precision,
}));

function makePart(
  thicknessMm: number,
  widthMm: number,
  lengthMm: number,
): MockPart {
  return {
    size: {
      thickness: mm(thicknessMm),
      width: mm(widthMm),
      length: mm(lengthMm),
    },
  };
}

const mountBanner = () =>
  mount(StockSuggestionBanner, {
    global: { stubs: { UIcon: true, UButton: UButtonStub } },
  });

describe('StockSuggestionBanner', () => {
  beforeEach(() => {
    enabledModels.value = [];
    stocks.value = [];
    distanceUnit.value = 'mm';
  });

  it('renders nothing when no preset matches the BOM', () => {
    enabledModels.value = [{ parts: [makePart(30, 50, 1200)] }];
    expect(
      mountBanner().find('[data-testid="stock-suggestion-banner"]').exists(),
    ).toBe(false);
  });

  it('surfaces a suggestion when the BOM has a matching cluster', () => {
    enabledModels.value = [
      { parts: [makePart(45, 70, 1500), makePart(45, 70, 700)] },
    ];
    const w = mountBanner();
    expect(
      w.find('[data-testid="stock-suggestion-AU Pine 70×45"]').text(),
    ).toContain('2 parts');
  });

  it('appends the suggestion to the structured stocks on Add all and self-dismisses', async () => {
    enabledModels.value = [{ parts: [makePart(45, 70, 1500)] }];
    const w = mountBanner();
    await w.find('[data-testid="stock-suggestion-add-all"]').trigger('click');
    expect(stocks.value.map((s) => s.material)).toContain('AU Pine 70×45');
    expect(w.find('[data-testid="stock-suggestion-banner"]').exists()).toBe(
      false,
    );
  });

  it('dismiss hides the banner without writing stock', async () => {
    enabledModels.value = [{ parts: [makePart(45, 70, 1500)] }];
    const w = mountBanner();
    await w.find('[data-testid="stock-suggestion-dismiss"]').trigger('click');
    expect(w.find('[data-testid="stock-suggestion-banner"]').exists()).toBe(
      false,
    );
    expect(stocks.value).toEqual([]);
  });
});
