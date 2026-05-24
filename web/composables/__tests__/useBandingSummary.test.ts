// @vitest-environment nuxt
import { mmToUm, umToMm, type Micrometres } from 'cutlist';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { ref } from 'vue';
import { beforeEach, describe, expect, it } from 'vitest';

interface ModelLike {
  parts: {
    partNumber: number;
    size: { width: Micrometres; length: Micrometres; thickness: Micrometres };
    bandedEdges?: {
      length1: boolean;
      length2: boolean;
      width1: boolean;
      width2: boolean;
    };
  }[];
}

const activeId = ref<string | null>('p1');
const enabledModels = ref<ModelLike[]>([]);
const distanceUnit = ref<'mm' | 'in'>('mm');

mockNuxtImport('useProjects', () => () => ({ activeId, enabledModels }));
mockNuxtImport('useProjectSettings', () => () => ({ distanceUnit }));

import useBandingSummary from '../useBandingSummary';

const edges = (o: Partial<ModelLike['parts'][number]['bandedEdges']>) => ({
  length1: false,
  length2: false,
  width1: false,
  width2: false,
  ...o,
});

function part(
  partNumber: number,
  banded?: ModelLike['parts'][number]['bandedEdges'],
) {
  return {
    partNumber,
    size: {
      width: mmToUm(300),
      length: mmToUm(600),
      thickness: mmToUm(18),
    } as ModelLike['parts'][number]['size'],
    bandedEdges: banded,
  };
}

beforeEach(() => {
  activeId.value = 'p1';
  enabledModels.value = [];
  distanceUnit.value = 'mm';
  window.localStorage.clear();
});

describe('useBandingSummary (F7 FR-BND-2/-3)', () => {
  it('sums banding length: one 600-edge + one 300-edge, qty 2 → 1800 mm', () => {
    // qty 2 = two instances of the same partNumber.
    enabledModels.value = [
      {
        parts: [
          part(1, edges({ length1: true, width1: true })),
          part(1, edges({ length1: true, width1: true })),
        ],
      },
    ];
    const { totalLengthUm } = useBandingSummary();
    expect(umToMm(totalLengthUm.value)).toBe(1800);
  });

  it('parts with no banded edges contribute zero', () => {
    enabledModels.value = [{ parts: [part(1), part(2)] }];
    const { totalLengthUm } = useBandingSummary();
    expect(totalLengthUm.value).toBe(0);
  });

  it('costs 1800 mm @ 0.01/mm → 18, omits cost when unpriced', () => {
    enabledModels.value = [
      {
        parts: [
          part(1, edges({ length1: true, width1: true })),
          part(1, edges({ length1: true, width1: true })),
        ],
      },
    ];
    const summary = useBandingSummary();
    expect(summary.cost.value).toBeUndefined();
    summary.setRate(0.01);
    expect(summary.cost.value).toBeCloseTo(18, 9);
  });

  it('rejects negative / non-finite rates, retaining the prior value (FR-BND-3)', () => {
    const summary = useBandingSummary();
    summary.setRate(0.02);
    summary.setRate(-1);
    expect(summary.ratePerUnitLength.value).toBe(0.02);
    summary.setRate(Number.NaN);
    expect(summary.ratePerUnitLength.value).toBe(0.02);
  });

  it('persists the rate to localStorage per project', () => {
    const summary = useBandingSummary();
    summary.setRate(0.05);
    // A fresh instance for the same project reads the persisted rate.
    const reopened = useBandingSummary();
    expect(reopened.ratePerUnitLength.value).toBe(0.05);
  });
});
