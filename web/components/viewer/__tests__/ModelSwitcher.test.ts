// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mountSuspended } from '@nuxt/test-utils/runtime';
import ModelSwitcher from '../ModelSwitcher.vue';

describe('ModelSwitcher', () => {
  it('Should render an option per model and reflect the focused index', async () => {
    const wrapper = await mountSuspended(ModelSwitcher, {
      props: {
        models: [
          { id: 'a', filename: 'one.gltf' },
          { id: 'b', filename: 'two.dae' },
        ],
        focusedIdx: 1,
      },
    });
    const select = wrapper.find('select');
    expect(select.exists()).toBe(true);
    expect((select.element as HTMLSelectElement).value).toBe('1');
    expect(wrapper.findAll('option')).toHaveLength(2);
    expect(wrapper.text()).toContain('one.gltf');
    expect(wrapper.text()).toContain('two.dae');
  });

  it('Should emit update:focusedIdx with the new numeric index on change', async () => {
    const wrapper = await mountSuspended(ModelSwitcher, {
      props: {
        models: [
          { id: 'a', filename: 'one.gltf' },
          { id: 'b', filename: 'two.dae' },
        ],
        focusedIdx: 0,
      },
    });
    const select = wrapper.find('select');
    (select.element as HTMLSelectElement).value = '1';
    await select.trigger('change');
    const events = wrapper.emitted('update:focusedIdx');
    expect(events).toBeTruthy();
    expect(events![0]).toEqual([1]);
  });
});
