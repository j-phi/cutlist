// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import GizmoModeToggle from '../GizmoModeToggle.vue';

describe('GizmoModeToggle', () => {
  it('Should emit update:mode=translate when the move button is clicked', async () => {
    const wrapper = await mountSuspended(GizmoModeToggle, {
      props: { mode: 'rotate' },
    });
    const buttons = wrapper.findAll('button');
    // First button is Move; second is Rotate.
    await buttons[0].trigger('click');
    expect(wrapper.emitted('update:mode')?.[0]).toEqual(['translate']);
  });

  it('Should emit update:mode=rotate when the rotate button is clicked', async () => {
    const wrapper = await mountSuspended(GizmoModeToggle, {
      props: { mode: 'translate' },
    });
    const buttons = wrapper.findAll('button');
    await buttons[1].trigger('click');
    expect(wrapper.emitted('update:mode')?.[0]).toEqual(['rotate']);
  });
});
