// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import AnnotationToolbar from '../AnnotationToolbar.vue';

describe('AnnotationToolbar', () => {
  it('Should hide callout / dimension when there is no active scene', async () => {
    const wrapper = await mountSuspended(AnnotationToolbar, {
      props: {
        hasActiveScene: false,
        mode: 'select',
        pickKind: null,
        canUpdateScene: false,
      },
    });
    const text = wrapper.text();
    expect(text).not.toContain('Callout');
    expect(text).not.toContain('Dimension');
    expect(text).not.toContain('Update scene');
  });

  it('Should show callout / dimension when a scene is active and emit on click', async () => {
    const wrapper = await mountSuspended(AnnotationToolbar, {
      props: {
        hasActiveScene: true,
        mode: 'select',
        pickKind: null,
        canUpdateScene: false,
      },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(2);
    await buttons[0].trigger('click');
    expect(wrapper.emitted('addCallout')).toHaveLength(1);
    await buttons[1].trigger('click');
    expect(wrapper.emitted('addDimension')).toHaveLength(1);
  });

  it('Should show the Update scene button when canUpdateScene is true', async () => {
    const wrapper = await mountSuspended(AnnotationToolbar, {
      props: {
        hasActiveScene: true,
        mode: 'select',
        pickKind: null,
        canUpdateScene: true,
      },
    });
    expect(wrapper.text()).toContain('Update scene');
    const updateBtn = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Update scene'));
    await updateBtn!.trigger('click');
    expect(wrapper.emitted('updateScene')).toHaveLength(1);
  });
});
