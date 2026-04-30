// @vitest-environment nuxt
/**
 * DimensionLabel — display-only auto-formatter.
 *
 * The component reads `useProjectSettings().distanceUnit` to pick units, so
 * we mock that composable per test. Static rotation/positioning is owned by
 * AnnotationLabels and is not tested here.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
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

const remove = vi.fn().mockResolvedValue(undefined);

mockNuxtImport('useAnnotations', () => () => ({
  annotations: ref([]),
  visibleForScene: () => ref([]),
  add: vi.fn(),
  update: vi.fn(),
  remove,
  purgeForScene: vi.fn(),
  reload: vi.fn(),
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
    expect(w.text()).toContain('123mm');
  });

  it('Prefers measuredMeters over the local-frame distance for cross-Object dimensions', async () => {
    // Two anchors with identical local coords ([0,0,0]) but different
    // groupIds. The naive `Math.hypot(b - a)` would render "0mm"; the
    // projector-fed `measuredMeters` of 0.5 metres should win.
    distanceUnit.value = 'mm';
    const a: IdbDimension = {
      id: 'd-1',
      sceneId: 's',
      kind: 'dimension',
      groupId: 1,
      anchor1: { groupId: 1, local: [0, 0, 0] },
      anchor2: { groupId: 2, local: [0, 0, 0] },
      offsetLocal: [0, 0, 0],
      createdAt: '2026-04-29T00:00:00.000Z',
      updatedAt: '2026-04-29T00:00:00.000Z',
    };
    const w = await mountSuspended(DimensionLabel, {
      props: { annotation: a, draft: false, measuredMeters: 0.5 },
    });
    expect(w.text()).toContain('500mm');
    // Local-frame Math.hypot would have produced "0mm" exactly — guard
    // against a regression where the prop is ignored.
    expect(w.text().trim()).not.toBe('0mm');
  });

  it('Falls back to the local-frame distance when measuredMeters is undefined', async () => {
    // Pre-projector-tick safety net: same-frame anchors are still rendered
    // correctly even before the projector has a measurement to report.
    distanceUnit.value = 'mm';
    const w = await mountSuspended(DimensionLabel, {
      props: { annotation: dim([0, 0, 0], [0.25, 0, 0]), draft: false },
    });
    expect(w.text()).toContain('250mm');
  });

  it('Renders the imperial distance with two decimals', async () => {
    distanceUnit.value = 'in';
    const w = await mountSuspended(DimensionLabel, {
      props: { annotation: dim([0, 0, 0], [0.0254, 0, 0]), draft: false },
    });
    expect(w.text()).toContain('1.00in');
  });

  it('Prefers an explicit text override over the auto-formatted distance', async () => {
    distanceUnit.value = 'mm';
    const w = await mountSuspended(DimensionLabel, {
      props: {
        annotation: dim([0, 0, 0], [1, 0, 0], 'notch: 1¼ in'),
        draft: false,
      },
    });
    expect(w.text()).toContain('notch: 1¼ in');
  });

  it('Falls back to mm when no project distance unit is set yet', async () => {
    distanceUnit.value = undefined as unknown as 'mm';
    const w = await mountSuspended(DimensionLabel, {
      props: { annotation: dim([0, 0, 0], [0.05, 0, 0]), draft: false },
    });
    expect(w.text()).toContain('50mm');
  });
});

describe('DimensionLabel — delete', () => {
  beforeEach(() => {
    remove.mockClear();
    distanceUnit.value = 'mm';
  });

  it('Should call useAnnotations().remove when the delete button is clicked', async () => {
    const w = await mountSuspended(DimensionLabel, {
      props: { annotation: dim([0, 0, 0], [0.1, 0, 0]), draft: false },
    });
    await w.find('[data-testid="annotation-delete"]').trigger('click');
    expect(remove).toHaveBeenCalledWith('d-1');
  });
});
