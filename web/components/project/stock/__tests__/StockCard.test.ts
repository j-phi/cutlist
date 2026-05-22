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
    name: 'Cabinet sides',
    material: 'Plywood',
    color: '#aabbcc',
    sizes: [{ width: 1220, length: 2440, thickness: [18] }],
  };
}

function makeLinear(): LinearStockMatrix {
  return {
    kind: 'linear',
    name: 'Frame rails',
    material: 'Pine',
    color: '#d2b996',
    size: {
      crossSectionWidth: 89,
      crossSectionThickness: 38,
      lengths: [2400],
    },
  };
}

function mountCard(
  modelValue: StockMatrix,
  showQuantity = false,
  materialOptions: string[] = [],
) {
  return mount(StockCard, {
    props: {
      modelValue,
      distanceUnit: 'mm' as const,
      precision: DEFAULT_MM_PRECISION,
      showQuantity,
      materialOptions,
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

  it('the name input edits `name`, the category input edits `material`', async () => {
    const wrapper = mountCard(makeSheet());

    const nameInput = wrapper.find('[data-testid="stock-material-name"]');
    (nameInput.element as HTMLInputElement).value = 'Drawer fronts';
    await nameInput.trigger('input');

    const categoryInput = wrapper.find(
      '[data-testid="stock-material-category"]',
    );
    (categoryInput.element as HTMLInputElement).value = 'Birch ply';
    await categoryInput.trigger('input');

    const emits = wrapper.emitted('update:modelValue')!;
    expect((emits[0][0] as SheetStockMatrix).name).toBe('Drawer fronts');
    // material untouched by the name edit.
    expect((emits[0][0] as SheetStockMatrix).material).toBe('Plywood');
    expect((emits[1][0] as SheetStockMatrix).material).toBe('Birch ply');
    // name untouched by the category edit.
    expect((emits[1][0] as SheetStockMatrix).name).toBe('Cabinet sides');
  });

  it('offers existing material categories as datalist suggestions', () => {
    const wrapper = mountCard(makeSheet(), false, ['Plywood', 'MDF', 'Oak']);
    const options = wrapper
      .find('datalist')
      .findAll('option')
      .map((o) => o.attributes('value'));
    expect(options).toEqual(['Plywood', 'MDF', 'Oak']);
  });

  it('trims the name on blur', async () => {
    const wrapper = mountCard({ ...makeSheet(), name: '  Sides  ' });
    await wrapper.find('[data-testid="stock-material-name"]').trigger('blur');
    const emitted = wrapper.emitted('update:modelValue');
    expect((emitted![0][0] as SheetStockMatrix).name).toBe('Sides');
  });

  it('trims the material category on blur', async () => {
    const wrapper = mountCard({ ...makeSheet(), material: '  Ply  ' });
    await wrapper
      .find('[data-testid="stock-material-category"]')
      .trigger('blur');
    const emitted = wrapper.emitted('update:modelValue');
    expect((emitted![0][0] as SheetStockMatrix).material).toBe('Ply');
  });

  describe('offcut quantity', () => {
    it('hides the quantity input unless showQuantity is set', () => {
      expect(
        mountCard(makeSheet(), false)
          .find('[data-testid="stock-quantity-input"]')
          .exists(),
      ).toBe(false);
      expect(
        mountCard(makeSheet(), true)
          .find('[data-testid="stock-quantity-input"]')
          .exists(),
      ).toBe(true);
    });

    it('shows the stored quantity, defaulting to 1 when absent', () => {
      const withQty: SheetStockMatrix = {
        ...makeSheet(),
        sizes: [{ width: 1220, length: 2440, thickness: [18], quantity: 7 }],
      };
      const qtyInput = (w: ReturnType<typeof mountCard>) =>
        w.find<HTMLInputElement>('[data-testid="stock-quantity-input"]').element
          .value;
      expect(qtyInput(mountCard(withQty, true))).toBe('7');
      // makeSheet's size has no quantity → default 1.
      expect(qtyInput(mountCard(makeSheet(), true))).toBe('1');
    });

    it('emits the updated quantity onto sizes[0]', async () => {
      const wrapper = mountCard(makeSheet(), true);
      const input = wrapper.find('[data-testid="stock-quantity-input"]');
      (input.element as HTMLInputElement).value = '3';
      await input.trigger('input');
      const next = wrapper.emitted(
        'update:modelValue',
      )![0][0] as SheetStockMatrix;
      expect(next.sizes[0].quantity).toBe(3);
    });

    it('clamps invalid quantity input to a minimum of 1', async () => {
      const wrapper = mountCard(makeSheet(), true);
      const input = wrapper.find('[data-testid="stock-quantity-input"]');
      for (const bad of ['0', '-4', 'abc']) {
        (input.element as HTMLInputElement).value = bad;
        await input.trigger('input');
      }
      const emitted = wrapper.emitted('update:modelValue')!;
      expect(emitted).toHaveLength(3);
      for (const [next] of emitted) {
        expect((next as SheetStockMatrix).sizes[0].quantity).toBe(1);
      }
    });
  });
});
