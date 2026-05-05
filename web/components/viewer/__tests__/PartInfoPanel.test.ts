// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import PartInfoPanel from '../PartInfoPanel.vue';

describe('PartInfoPanel', () => {
  it('Should render a compact single-line readout with name + dimensions', async () => {
    const wrapper = await mountSuspended(PartInfoPanel, {
      props: {
        part: {
          partNumber: 7,
          name: 'Side panel',
          widthM: 0.3,
          lengthM: 0.6,
          thicknessM: 0.018,
          material: 'oak-18mm',
          // The rest of BoardLayoutLeftover isn't read by the panel; cast to
          // any to avoid having to mock the full type surface here.
        } as never,
      },
    });
    const text = wrapper.text();
    expect(text).toContain('#7');
    expect(text).toContain('Side panel');
    // Dimensions on one line, separated by `×`. The compact readout
    // intentionally drops material — that lives elsewhere (BOM tab).
    expect(text).toContain('×');
    expect(text).not.toContain('oak-18mm');
  });
});
