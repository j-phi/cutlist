// @vitest-environment nuxt
/**
 * DimensionLabel — display-only auto-formatter.
 *
 * The component reads `useProjectSettings().distanceUnit` to pick units, so
 * we mock that composable per test. Static rotation/positioning is owned by
 * AnnotationLabels and is not tested here.
 */
import { describe, expect, it, vi } from 'vitest';
import { mountSuspended, mockNuxtImport } from '@nuxt/test-utils/runtime';
import { ref } from 'vue';
import type { IdbDimension } from '~/composables/useIdb';

const distanceUnit = ref<'mm' | 'in'>('mm');

mockNuxtImport('useProjectSettings', () => () => ({
  distanceUnit,
  stock: ref(''),
  bladeWidth: ref(0),
  margin: ref(0),
  optimize: ref('Auto'),
  showPartNumbers: ref(false),
  excludedColors: ref([]),
  archived: ref(false),
  setExcludedColor: vi.fn(),
  archive: vi.fn(),
  unarchive: vi.fn(),
}));

import DimensionLabel from '../DimensionLabel.vue';

function dim(
  a1: [number, number, number],
  a2: [number, number, number],
  text?: string,
): IdbDimension {
  const now = '2026-04-29T00:00:00.000Z';
  return {
    id: 'd-1',
    sceneId: 's',
    kind: 'dimension',
    groupId: 1,
    anchor1: { groupId: 1, local: a1 },
    anchor2: { groupId: 1, local: a2 },
    offsetLocal: [0, 0, 0],
    text,
    createdAt: now,
    updatedAt: now,
  };
}

describe('DimensionLabel — auto-format', () => {
  it('Renders the metric distance rounded to mm', async () => {
    distanceUnit.value = 'mm';
    const w = await mountSuspended(DimensionLabel, {
      props: { annotation: dim([0, 0, 0], [0.123, 0, 0]), draft: false },
    });
    expect(w.text()).toBe('123mm');
  });

  it('Renders the imperial distance with two decimals', async () => {
    distanceUnit.value = 'in';
    const w = await mountSuspended(DimensionLabel, {
      props: { annotation: dim([0, 0, 0], [0.0254, 0, 0]), draft: false },
    });
    expect(w.text()).toBe('1.00in');
  });

  it('Prefers an explicit text override over the auto-formatted distance', async () => {
    distanceUnit.value = 'mm';
    const w = await mountSuspended(DimensionLabel, {
      props: {
        annotation: dim([0, 0, 0], [1, 0, 0], 'notch: 1¼ in'),
        draft: false,
      },
    });
    expect(w.text()).toBe('notch: 1¼ in');
  });

  it('Falls back to mm when no project distance unit is set yet', async () => {
    distanceUnit.value = undefined as unknown as 'mm';
    const w = await mountSuspended(DimensionLabel, {
      props: { annotation: dim([0, 0, 0], [0.05, 0, 0]), draft: false },
    });
    expect(w.text()).toBe('50mm');
  });
});
