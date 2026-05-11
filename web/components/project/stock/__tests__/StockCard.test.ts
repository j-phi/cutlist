// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { defineComponent, h } from 'vue';
import { mount } from '@vue/test-utils';
import {
  DEFAULT_MM_PRECISION,
  type LinearStockMatrix,
  type SheetStockMatrix,
  type StockMatrix,
} from 'cutlist';

import StockCard from '../StockCard.vue';
import { UButtonStub, UInputStub } from '~/test-utils/stubs';

const MaterialColorPickerStub = defineComponent({
  props: { modelValue: { type: String, default: '' } },
  emits: ['update:modelValue'],
  setup(props, { emit }) {
    return () =>
      h('button', {
        type: 'button',
        'data-testid': 'color-picker',
        'data-color': props.modelValue,
        onClick: () => emit('update:modelValue', '#ff0000'),
      });
  },
});

const SheetDimensionsStub = defineComponent({
  props: { modelValue: { type: Object, required: true } },
  template: '<div data-testid="sheet-body" />',
});

const LinearDimensionsStub = defineComponent({
  props: { modelValue: { type: Object, required: true } },
  template: '<div data-testid="linear-body" />',
});

function makeSheet(): SheetStockMatrix {
  return {
    kind: 'sheet',
    material: 'Plywood',
    color: '#aabbcc',
    sizes: [{ width: 1220, length: 2440, thickness: [18] }],
  };
}

function makeLinear(): LinearStockMatrix {
  return {
    kind: 'linear',
    material: 'Pine 2×4',
    color: '#d2b996',
    size: {
      crossSectionWidth: 89,
      crossSectionThickness: 38,
      lengths: [2400],
    },
  };
}

function mountCard(modelValue: StockMatrix) {
  return mount(StockCard, {
    props: {
      modelValue,
      distanceUnit: 'mm' as const,
      precision: DEFAULT_MM_PRECISION,
    },
    global: {
      stubs: {
        UInput: UInputStub,
        UButton: UButtonStub,
        UIcon: true,
        MaterialColorPicker: MaterialColorPickerStub,
        SheetDimensions: SheetDimensionsStub,
        LinearDimensions: LinearDimensionsStub,
      },
    },
  });
}

describe('StockCard', () => {
  it.each([
    ['sheet', makeSheet, 'sheet-body', 'linear-body', 'sheet'],
    ['linear', makeLinear, 'linear-body', 'sheet-body', 'timber'],
  ] as const)(
    'renders the %s body and matching type chip',
    (_label, factory, shown, hidden, chipText) => {
      const wrapper = mountCard(factory());
      expect(wrapper.find(`[data-testid="${shown}"]`).exists()).toBe(true);
      expect(wrapper.find(`[data-testid="${hidden}"]`).exists()).toBe(false);
      expect(wrapper.find('[data-testid="stock-type-chip"]').text()).toBe(
        chipText,
      );
    },
  );

  it('trims surrounding whitespace on blur', async () => {
    const wrapper = mountCard({ ...makeSheet(), material: '  Ply  ' });
    await wrapper.find('[data-testid="stock-material-name"]').trigger('blur');
    const emitted = wrapper.emitted('update:modelValue');
    expect((emitted![0][0] as SheetStockMatrix).material).toBe('Ply');
  });
});
