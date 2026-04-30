// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import MouseLegend from '../MouseLegend.vue';

describe('MouseLegend', () => {
  it('Should render the desktop labels when variant is desktop', async () => {
    const wrapper = await mountSuspended(MouseLegend, {
      props: { variant: 'desktop' },
    });
    const text = wrapper.text();
    expect(text).toContain('Right-drag');
    expect(text).toContain('Mid-drag');
    expect(text).toContain('Scroll');
    expect(text).not.toContain('Pinch');
  });

  it('Should render the mobile labels when variant is mobile', async () => {
    const wrapper = await mountSuspended(MouseLegend, {
      props: { variant: 'mobile' },
    });
    const text = wrapper.text();
    expect(text).toContain('1 finger');
    expect(text).toContain('2 fingers');
    expect(text).toContain('Pinch');
    expect(text).not.toContain('Right-drag');
  });
});
