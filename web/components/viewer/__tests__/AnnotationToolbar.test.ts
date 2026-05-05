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
        pickHint: null,
        hasSelection: false,
        gizmoMode: 'translate',
      },
    });
    const text = wrapper.text();
    expect(text).not.toContain('Callout');
    expect(text).not.toContain('Dimension');
  });

  it('Should show callout / dimension when a scene is active and emit on click', async () => {
    const wrapper = await mountSuspended(AnnotationToolbar, {
      props: {
        hasActiveScene: true,
        mode: 'select',
        pickKind: null,
        pickHint: null,
        hasSelection: false,
        gizmoMode: 'translate',
      },
    });
    const buttons = wrapper.findAll('button');
    expect(buttons).toHaveLength(2);
    await buttons[0].trigger('click');
    expect(wrapper.emitted('addCallout')).toHaveLength(1);
    await buttons[1].trigger('click');
    expect(wrapper.emitted('addDimension')).toHaveLength(1);
  });

  it('Should collapse to hint text in pick mode', async () => {
    const wrapper = await mountSuspended(AnnotationToolbar, {
      props: {
        hasActiveScene: true,
        mode: 'pick',
        pickKind: 'callout',
        pickHint: 'Click a part to anchor',
        hasSelection: false,
        gizmoMode: 'translate',
      },
    });
    const text = wrapper.text();
    expect(text).toContain('Click a part to anchor');
    expect(text).not.toContain('Callout');
    expect(text).not.toContain('Dimension');
    expect(wrapper.findAll('button')).toHaveLength(0);
  });

  it('Should show Move/Rotate when there is a selection and emit on click', async () => {
    const wrapper = await mountSuspended(AnnotationToolbar, {
      props: {
        hasActiveScene: false,
        mode: 'select',
        pickKind: null,
        pickHint: null,
        hasSelection: true,
        gizmoMode: 'translate',
      },
    });
    expect(wrapper.text()).toContain('Move');
    expect(wrapper.text()).toContain('Rotate');
    const rotate = wrapper
      .findAll('button')
      .find((b) => b.text().includes('Rotate'));
    await rotate!.trigger('click');
    expect(wrapper.emitted('update:gizmoMode')).toEqual([['rotate']]);
  });

  it('Should hide Move/Rotate when there is no selection', async () => {
    const wrapper = await mountSuspended(AnnotationToolbar, {
      props: {
        hasActiveScene: true,
        mode: 'select',
        pickKind: null,
        pickHint: null,
        hasSelection: false,
        gizmoMode: 'translate',
      },
    });
    expect(wrapper.text()).not.toContain('Move');
    expect(wrapper.text()).not.toContain('Rotate');
  });
});
