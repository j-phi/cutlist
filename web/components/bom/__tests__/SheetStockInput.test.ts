// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import {
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  type SheetStockMatrix,
} from 'cutlist';

import SheetStockInput from '../SheetStockInput.vue';

const UInputStub = defineComponent({
  props: { modelValue: { type: [String, Number], default: '' } },
  emits: ['update:modelValue', 'blur'],
  setup(props, { attrs, emit }) {
    return () =>
      h('input', {
        ...attrs,
        value: props.modelValue ?? '',
        onInput: (event: Event) =>
          emit('update:modelValue', (event.target as HTMLInputElement).value),
        onBlur: (event: FocusEvent) => emit('blur', event),
      });
  },
});

const UButtonStub = defineComponent({
  inheritAttrs: false,
  emits: ['click'],
  setup(_props, { attrs, emit, slots }) {
    return () =>
      h(
        'button',
        {
          ...attrs,
          type: 'button',
          onClick: (event: MouseEvent) => emit('click', event),
        },
        slots.default ? slots.default() : undefined,
      );
  },
});

const MaterialColorPickerStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('button', {
        class: 'color-picker',
        type: 'button',
        'data-testid': 'sheet-color-picker',
        'data-color': props.modelValue,
        onClick: () => emit('update:modelValue', '#ff0000'),
      });
  },
});

function makePlywood(): SheetStockMatrix {
  return {
    kind: 'sheet',
    material: 'Plywood',
    color: '#aabbcc',
    sizes: [
      { width: 1220, length: 2440, thickness: [18] },
      { width: 600, length: 900, thickness: [12, 18] },
    ],
  };
}

function mountInput(modelValue: SheetStockMatrix, unit: 'mm' | 'in' = 'mm') {
  const precision =
    unit === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION;
  return mount(SheetStockInput, {
    props: { modelValue, distanceUnit: unit, precision },
    global: {
      stubs: {
        UInput: UInputStub,
        UButton: UButtonStub,
        UIcon: true,
        MaterialColorPicker: MaterialColorPickerStub,
      },
    },
  });
}

function emittedLatest(
  wrapper: ReturnType<typeof mountInput>,
): SheetStockMatrix | undefined {
  const events = wrapper.emitted('update:modelValue');
  if (!events?.length) return undefined;
  return events[events.length - 1][0] as SheetStockMatrix;
}

describe('SheetStockInput', () => {
  describe('Render state', () => {
    it('renders one size row per size in modelValue', () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      expect(wrapper.findAll('[data-testid="sheet-size-row"]')).toHaveLength(2);
    });

    it('renders one chip per thickness within each size', () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const rows = wrapper.findAll('[data-testid="sheet-size-row"]');
      expect(
        rows[0].findAll('[data-testid="sheet-thickness-chip"]'),
      ).toHaveLength(1);
      expect(
        rows[1].findAll('[data-testid="sheet-thickness-chip"]'),
      ).toHaveLength(2);
    });

    it('displays dimensions in mm when distanceUnit is mm', () => {
      const text = mountInput(makePlywood(), 'mm')
        .find('[data-testid="sheet-size-row"]')
        .text();
      expect(text).toContain('1220');
      expect(text).toContain('2440');
    });

    it('displays dimensions in inches when distanceUnit is in', () => {
      const text = mountInput(makePlywood(), 'in')
        .find('[data-testid="sheet-size-row"]')
        .text();
      // 1220mm ≈ 48", 2440mm ≈ 96".
      expect(text).toContain('48');
      expect(text).toContain('96');
    });
  });

  describe('Size editing', () => {
    it('adding a valid size emits update:modelValue with the new size appended', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      await wrapper.find('[data-testid="sheet-size-width"]').setValue('600');
      await wrapper.find('[data-testid="sheet-size-length"]').setValue('900');
      await wrapper.find('[data-testid="sheet-size-add"]').trigger('click');
      const sizes = emittedLatest(wrapper)?.sizes;
      expect(sizes).toHaveLength(3);
      expect(sizes![2]).toMatchObject({
        width: 600,
        length: 900,
        thickness: [],
      });
    });

    it('removing a size emits update:modelValue without it', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      await wrapper
        .findAll('[data-testid="sheet-size-remove"]')[0]
        .trigger('click');
      const sizes = emittedLatest(wrapper)?.sizes;
      expect(sizes).toHaveLength(1);
      expect(sizes![0].width).toBe(600);
    });
  });

  describe('Thickness editing', () => {
    it('adding a thickness to a size emits update:modelValue with it appended', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const adds = wrapper.findAll('[data-testid="sheet-thickness-add"]');
      await adds[0].setValue('12');
      await adds[0].trigger('blur');
      const sizes = emittedLatest(wrapper)?.sizes;
      expect(sizes![0].thickness).toEqual([18, 12]);
    });

    it('converts inch thickness to mm on commit', async () => {
      const wrapper = mountInput(makePlywood(), 'in');
      const adds = wrapper.findAll('[data-testid="sheet-thickness-add"]');
      await adds[0].setValue('1/2');
      await adds[0].trigger('blur');
      const last = emittedLatest(wrapper)?.sizes[0].thickness;
      expect(last?.[last.length - 1]).toBeCloseTo(12.7, 5);
    });

    it('removing a thickness chip emits update:modelValue without it', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const rows = wrapper.findAll('[data-testid="sheet-size-row"]');
      const removes = rows[1].findAll('[data-testid="sheet-thickness-remove"]');
      await removes[0].trigger('click');
      const sizes = emittedLatest(wrapper)?.sizes;
      expect(sizes![1].thickness).toEqual([18]);
    });
  });

  describe('Material header', () => {
    it('typing a material name emits update:modelValue with the new name', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      await wrapper
        .find('[data-testid="sheet-material-name"]')
        .setValue('My Plywood');
      expect(emittedLatest(wrapper)?.material).toBe('My Plywood');
    });

    it('changing color emits update:modelValue with the new color', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      await wrapper.find('[data-testid="sheet-color-picker"]').trigger('click');
      expect(emittedLatest(wrapper)?.color).toBe('#ff0000');
    });

    it('clicking remove emits remove', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      await wrapper.find('[data-testid="sheet-remove"]').trigger('click');
      expect(wrapper.emitted('remove')).toBeTruthy();
    });
  });
});
