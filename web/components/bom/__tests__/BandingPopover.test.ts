// @vitest-environment nuxt
import { mount } from '@vue/test-utils';
import { mmToUm, type Micrometres } from 'cutlist';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import { ref } from 'vue';
import { describe, expect, it } from 'vitest';

import BandingPopover from '../BandingPopover.vue';
import { UCheckboxStub, UInputStub, UPopoverStub } from '~/test-utils/stubs';

mockNuxtImport('useProjectSettings', () => () => ({
  distanceUnit: ref<'mm' | 'in'>('mm'),
  precision: ref({ kind: 'decimal', step: 0.1 }),
}));

mockNuxtImport(
  'useFormatDistance',
  () => () => (m: Micrometres | undefined | null) =>
    m == null ? '' : `${m / 1000}mm`,
);

const stubs = {
  UPopover: UPopoverStub,
  UCheckbox: UCheckboxStub,
  UInput: UInputStub,
  UIcon: true,
};

function mountPopover(props: Record<string, unknown> = {}) {
  return mount(BandingPopover, {
    props: {
      projectDefaultUm: mmToUm(1),
      subtract: false,
      finishedWidthUm: mmToUm(300),
      finishedLengthUm: mmToUm(600),
      thicknessUm: mmToUm(18),
      ...props,
    },
    global: { stubs },
  });
}

describe('BandingPopover (F7 FR-BND-1/-7)', () => {
  it('emits the toggled edge selection (FR-BND-1)', async () => {
    const wrapper = mountPopover();
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    // Order: length1, length2, width1, width2.
    await checkboxes[0].trigger('change');

    const updates = wrapper.emitted('update');
    expect(updates).toHaveLength(1);
    const payload = updates![0][0] as { bandedEdges: Record<string, boolean> };
    expect(payload.bandedEdges).toEqual({
      length1: true,
      length2: false,
      width1: false,
      width2: false,
    });
  });

  it('rejects a zero-clamp edit, keeps prior value, shows the reason (FR-BND-7)', async () => {
    // width 300, project default banding 200, both length-edges would be
    // 300 − 2×200 = −100 → reject.
    const wrapper = mountPopover({
      subtract: true,
      projectDefaultUm: mmToUm(200),
      bandedEdges: {
        length1: true,
        length2: false,
        width1: false,
        width2: false,
      },
    });
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    // Toggle the second length-edge ON → would zero-clamp.
    await checkboxes[1].trigger('change');

    // No update emitted (the prior selection is retained).
    expect(wrapper.emitted('update')).toBeUndefined();
    expect(wrapper.text()).toContain('would leave no material');
  });

  it('allows a subtraction that stays positive (FR-BND-5/-7)', async () => {
    const wrapper = mountPopover({
      subtract: true,
      projectDefaultUm: mmToUm(1),
      bandedEdges: {
        length1: false,
        length2: false,
        width1: false,
        width2: false,
      },
    });
    const checkboxes = wrapper.findAll('input[type="checkbox"]');
    await checkboxes[0].trigger('change'); // length1: 300 − 1 = 299 > 0
    expect(wrapper.emitted('update')).toHaveLength(1);
    expect(wrapper.text()).not.toContain('would leave no material');
  });
});
