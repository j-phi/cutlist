// @vitest-environment nuxt
import { describe, expect, it } from 'vitest';
import { mount } from '@vue/test-utils';
import {
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  type SheetStockMatrix,
} from 'cutlist';

import SheetDimensions from '../SheetDimensions.vue';
import { UButtonStub, UInputStub } from '~/test-utils/stubs';

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
  return mount(SheetDimensions, {
    props: { modelValue, distanceUnit: unit, precision },
    global: {
      stubs: {
        UInput: UInputStub,
        UButton: UButtonStub,
        UIcon: true,
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

describe('SheetDimensions', () => {
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

    it('renders existing dimensions in the size inputs (mm)', () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const w0 = wrapper.find('[data-testid="sheet-size-width-0"]')
        .element as HTMLInputElement;
      const l0 = wrapper.find('[data-testid="sheet-size-length-0"]')
        .element as HTMLInputElement;
      expect(w0.value).toBe('1220');
      expect(l0.value).toBe('2440');
    });

    it('renders existing dimensions converted to the active unit (in)', () => {
      const wrapper = mountInput(makePlywood(), 'in');
      // 1220mm ≈ 48", 2440mm ≈ 96". 1220 isn't an exact inch multiple so
      // 1/32" precision renders "48 1/32"; the test cares that the inputs
      // show the inch reading, not the mm fixture.
      const w0 = wrapper.find('[data-testid="sheet-size-width-0"]')
        .element as HTMLInputElement;
      const l0 = wrapper.find('[data-testid="sheet-size-length-0"]')
        .element as HTMLInputElement;
      expect(w0.value).toMatch(/^48/);
      expect(l0.value).toMatch(/^96/);
    });
  });

  describe('Size editing', () => {
    it('clicking "Add size" appends a seeded 4×8 default (mm)', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      await wrapper.find('[data-testid="sheet-size-add"]').trigger('click');
      const sizes = emittedLatest(wrapper)?.sizes;
      expect(sizes).toHaveLength(3);
      expect(sizes![2]).toMatchObject({
        width: 1220,
        length: 2440,
        thickness: [],
      });
    });

    it('clicking "Add size" seeds the inch equivalent in an inch project', async () => {
      const wrapper = mountInput(makePlywood(), 'in');
      await wrapper.find('[data-testid="sheet-size-add"]').trigger('click');
      const sizes = emittedLatest(wrapper)?.sizes;
      // 48" × 96" → 1219.2 × 2438.4 mm (canonical storage).
      expect(sizes![sizes!.length - 1].width).toBeCloseTo(1219.2, 1);
      expect(sizes![sizes!.length - 1].length).toBeCloseTo(2438.4, 1);
    });

    it('editing an existing size width commits to size[i].width on blur', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const input = wrapper.find('[data-testid="sheet-size-width-0"]');
      await input.setValue('600');
      await input.trigger('blur');
      expect(emittedLatest(wrapper)?.sizes[0].width).toBe(600);
    });

    it('editing an existing size length in inches converts to mm on commit', async () => {
      const wrapper = mountInput(makePlywood(), 'in');
      const input = wrapper.find('[data-testid="sheet-size-length-0"]');
      await input.setValue('120');
      await input.trigger('blur');
      // 120" → 3048mm
      expect(emittedLatest(wrapper)?.sizes[0].length).toBeCloseTo(3048, 1);
    });

    it('invalid size-dim input is discarded without emitting', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const input = wrapper.find('[data-testid="sheet-size-width-0"]');
      await input.setValue('not a number');
      await input.trigger('blur');
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
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
});
