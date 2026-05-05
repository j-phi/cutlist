// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import ViewerStatusBar from '../ViewerStatusBar.vue';

describe('ViewerStatusBar', () => {
  it('Should show an idle hint when nothing is selected', async () => {
    const wrapper = await mountSuspended(ViewerStatusBar, {
      props: { part: null },
    });
    expect(wrapper.text()).toContain('Hover or select');
  });

  it('Should render the part readout when a part is provided', async () => {
    const wrapper = await mountSuspended(ViewerStatusBar, {
      props: {
        part: {
          partNumber: 7,
          name: 'Side panel',
          widthM: 0.3,
          lengthM: 0.6,
          thicknessM: 0.018,
          material: 'oak-18mm',
        } as never,
      },
    });
    const text = wrapper.text();
    expect(text).toContain('#7');
    expect(text).toContain('Side panel');
    expect(text).toContain('×');
    expect(text).not.toContain('Hover or select');
  });
});
