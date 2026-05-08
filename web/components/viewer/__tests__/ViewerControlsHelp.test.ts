// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import { nextTick } from 'vue';
import ViewerControlsHelp from '../ViewerControlsHelp.vue';

describe('ViewerControlsHelp', () => {
  it('Should render a help trigger button with a controls title', async () => {
    const wrapper = await mountSuspended(ViewerControlsHelp);
    const button = wrapper.find('button');
    expect(button.exists()).toBe(true);
    expect(button.attributes('title')).toBe('Controls');
  });

  it('Should expose mouse and touch legends when the popover is opened', async () => {
    const wrapper = await mountSuspended(ViewerControlsHelp);
    await wrapper.find('button').trigger('click');
    await nextTick();
    // Popover content is teleported to document.body — read from there.
    const body = document.body.innerHTML;
    // Mouse legend (visible on hover-capable devices via CSS)
    expect(body).toContain('Right-drag');
    expect(body).toContain('Mid-drag');
    expect(body).toContain('Scroll');
    // Touch legend (visible on coarse-pointer / no-hover devices via CSS)
    expect(body).toContain('1 finger');
    expect(body).toContain('2 fingers');
    expect(body).toContain('Pinch');
    // Action labels appear in both legends
    expect(body).toContain('Orbit');
    expect(body).toContain('Pan');
    expect(body).toContain('Zoom');
  });
});
