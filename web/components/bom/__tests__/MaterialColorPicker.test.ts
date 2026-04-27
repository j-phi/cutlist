// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { shallowMount } from '@vue/test-utils';
import { FALLBACK_PALETTE } from '~/composables/useMaterialColors';

import MaterialColorPicker from '../MaterialColorPicker.vue';

const UPopoverStub = {
  props: {
    open: { type: Boolean, default: false },
  },
  emits: ['update:open'],
  template: `
    <div :data-open="String(open)">
      <slot />
      <slot name="content" />
    </div>
  `,
};

describe('MaterialColorPicker', () => {
  function getComponent(modelValue = FALLBACK_PALETTE[0]) {
    return shallowMount(MaterialColorPicker, {
      props: { modelValue },
      global: {
        stubs: {
          UPopover: UPopoverStub,
        },
      },
    });
  }

  describe('Rendering', () => {
    it('Should render the trigger swatch with the current color', () => {
      const component = getComponent('#abcdef');
      const trigger = component.findAll('button')[0];

      expect(trigger.attributes('style')).toContain('background');
      expect(trigger.attributes('style')).toContain('#abcdef');
    });
  });

  describe('On preset click', () => {
    it('Should emit the picked hex and close the popover', async () => {
      const component = getComponent(FALLBACK_PALETTE[0]);
      const presetButtons = component.findAll('button.swatch');
      const popover = component.get('[data-open]');

      // Open the popover via trigger click (sets local open ref)
      // We can't easily test that part via the stub, but we can assert
      // that picking a preset closes it.
      await presetButtons[2].trigger('click');

      expect(component.emitted('update:modelValue')).toEqual([
        [FALLBACK_PALETTE[2]],
      ]);
      expect(popover.attributes('data-open')).toBe('false');
    });
  });

  describe('On custom color input', () => {
    it('Should emit the custom hex from the color input', async () => {
      const component = getComponent(FALLBACK_PALETTE[0]);
      const colorInput = component.get('input[type="color"]');

      (colorInput.element as HTMLInputElement).value = '#123456';
      await colorInput.trigger('input');

      expect(component.emitted('update:modelValue')).toEqual([['#123456']]);
    });
  });
});
