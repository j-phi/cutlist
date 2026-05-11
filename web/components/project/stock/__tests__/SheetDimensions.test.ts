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
    it.each([
      ['mm', '1220', '2440'],
      ['in', /^48/, /^96/], // 1220mm ≈ 48 1/32 at 1/32 precision
    ] as const)(
      'renders existing dimensions in the active unit (%s)',
      (unit, w, l) => {
        const wrapper = mountInput(makePlywood(), unit);
        const w0 = wrapper.find('[data-testid="sheet-size-width-0"]')
          .element as HTMLInputElement;
        const l0 = wrapper.find('[data-testid="sheet-size-length-0"]')
          .element as HTMLInputElement;
        if (typeof w === 'string') expect(w0.value).toBe(w);
        else expect(w0.value).toMatch(w);
        if (typeof l === 'string') expect(l0.value).toBe(l);
        else expect(l0.value).toMatch(l);
      },
    );
  });

  describe('Size editing', () => {
    it.each([
      ['mm', 1220, 2440],
      ['in', 1219.2, 2438.4], // 48" × 96"
    ] as const)(
      'seeds a unit-appropriate 4×8 default on "Add size" (%s)',
      async (unit, w, l) => {
        const wrapper = mountInput(makePlywood(), unit);
        await wrapper.find('[data-testid="sheet-size-add"]').trigger('click');
        const last = emittedLatest(wrapper)!.sizes.at(-1)!;
        expect(last.width).toBeCloseTo(w, 1);
        expect(last.length).toBeCloseTo(l, 1);
      },
    );

    it('commits typed width on blur (mm verbatim)', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const input = wrapper.find('[data-testid="sheet-size-width-0"]');
      await input.setValue('600');
      await input.trigger('blur');
      expect(emittedLatest(wrapper)?.sizes[0].width).toBe(600);
    });

    it('converts inch input to mm on commit', async () => {
      const wrapper = mountInput(makePlywood(), 'in');
      const input = wrapper.find('[data-testid="sheet-size-length-0"]');
      await input.setValue('120');
      await input.trigger('blur');
      expect(emittedLatest(wrapper)?.sizes[0].length).toBeCloseTo(3048, 1);
    });

    it('discards invalid input without emitting', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const input = wrapper.find('[data-testid="sheet-size-width-0"]');
      await input.setValue('not a number');
      await input.trigger('blur');
      expect(wrapper.emitted('update:modelValue')).toBeFalsy();
    });

    it('removes a size by index', async () => {
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
    it('appends a typed thickness to the size on commit', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const adds = wrapper.findAll('[data-testid="sheet-thickness-add"]');
      await adds[0].setValue('12');
      await adds[0].trigger('blur');
      expect(emittedLatest(wrapper)?.sizes[0].thickness).toEqual([18, 12]);
    });

    it('converts inch thickness to mm on commit', async () => {
      const wrapper = mountInput(makePlywood(), 'in');
      const adds = wrapper.findAll('[data-testid="sheet-thickness-add"]');
      await adds[0].setValue('1/2');
      await adds[0].trigger('blur');
      const last = emittedLatest(wrapper)?.sizes[0].thickness;
      expect(last?.at(-1)).toBeCloseTo(12.7, 5);
    });

    it('removes a thickness chip by index', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const rows = wrapper.findAll('[data-testid="sheet-size-row"]');
      const removes = rows[1].findAll('[data-testid="sheet-thickness-remove"]');
      await removes[0].trigger('click');
      expect(emittedLatest(wrapper)?.sizes[1].thickness).toEqual([18]);
    });
  });
});
