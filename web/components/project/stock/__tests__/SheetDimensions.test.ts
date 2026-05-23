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

function mountInput(
  modelValue: SheetStockMatrix,
  unit: 'mm' | 'in' = 'mm',
  isOffcut = false,
) {
  const precision =
    unit === 'in' ? DEFAULT_INCH_PRECISION : DEFAULT_MM_PRECISION;
  return mount(SheetDimensions, {
    props: { modelValue, distanceUnit: unit, precision, isOffcut },
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
      // Click the + button to reveal the hidden input, then type and blur.
      const btns = wrapper.findAll('[data-testid="sheet-thickness-add-btn"]');
      await btns[0].trigger('click');
      const input = wrapper.findAll('[data-testid="sheet-thickness-add"]')[0];
      await input.setValue('12');
      await input.trigger('blur');
      expect(emittedLatest(wrapper)?.sizes[0].thickness).toEqual([18, 12]);
    });

    it('converts inch thickness to mm on commit', async () => {
      const wrapper = mountInput(makePlywood(), 'in');
      // Click the + button to reveal the hidden input, then type and blur.
      const btns = wrapper.findAll('[data-testid="sheet-thickness-add-btn"]');
      await btns[0].trigger('click');
      const input = wrapper.findAll('[data-testid="sheet-thickness-add"]')[0];
      await input.setValue('1/2');
      await input.trigger('blur');
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

  describe('Per-size cost', () => {
    it('commits a valid positive cost on blur', async () => {
      const wrapper = mountInput(makePlywood(), 'mm');
      const input = wrapper.find('[data-testid="sheet-size-cost-0"]');
      await input.setValue('60');
      await input.trigger('blur');
      expect(emittedLatest(wrapper)?.sizes[0].cost).toBe(60);
    });

    it('clears cost when the field is emptied', async () => {
      const priced = makePlywood();
      priced.sizes[0].cost = 60;
      const wrapper = mountInput(priced, 'mm');
      const input = wrapper.find('[data-testid="sheet-size-cost-0"]');
      await input.setValue('');
      await input.trigger('blur');
      expect(emittedLatest(wrapper)?.sizes[0]).not.toHaveProperty('cost');
    });

    it.each(['-5', 'abc', 'Infinity'])(
      'rejects invalid cost %s, retaining the prior value and showing a message',
      async (bad) => {
        const priced = makePlywood();
        priced.sizes[0].cost = 42;
        const wrapper = mountInput(priced, 'mm');
        const input = wrapper.find('[data-testid="sheet-size-cost-0"]');
        await input.setValue(bad);
        await input.trigger('blur');
        // No mutation emitted — stored value retained.
        expect(wrapper.emitted('update:modelValue')).toBeFalsy();
        // Validation message surfaced.
        expect(wrapper.text()).toContain('Cost must be a positive number');
        // Field snaps back to the retained value.
        const el = wrapper.find<HTMLInputElement>(
          '[data-testid="sheet-size-cost-0"]',
        ).element;
        expect(el.value).toBe('42');
      },
    );
  });

  describe('Per-board quantity (offcut mode)', () => {
    function makeOffcut(): SheetStockMatrix {
      return {
        kind: 'sheet',
        material: '3/4 Ply',
        role: 'offcut',
        sizes: [
          {
            name: 'Board 1',
            width: 584,
            length: 813,
            thickness: [19],
            quantity: 3,
          },
          { name: 'Board 2', width: 584, length: 813, thickness: [19] },
        ],
      };
    }

    it('hides qty inputs when isOffcut is false', () => {
      const wrapper = mountInput(makeOffcut(), 'mm', false);
      expect(wrapper.find('[data-testid="sheet-size-qty-0"]').exists()).toBe(
        false,
      );
    });

    it('shows the stored quantity per board, defaulting missing qty to 1', () => {
      const wrapper = mountInput(makeOffcut(), 'mm', true);
      const qty0 = wrapper.find<HTMLInputElement>(
        '[data-testid="sheet-size-qty-0"]',
      ).element.value;
      const qty1 = wrapper.find<HTMLInputElement>(
        '[data-testid="sheet-size-qty-1"]',
      ).element.value;
      expect(qty0).toBe('3');
      expect(qty1).toBe('1');
    });

    it('emits updated quantity on the correct board row', async () => {
      const wrapper = mountInput(makeOffcut(), 'mm', true);
      const input = wrapper.find('[data-testid="sheet-size-qty-1"]');
      (input.element as HTMLInputElement).value = '5';
      await input.trigger('input');
      const sizes = emittedLatest(wrapper)?.sizes;
      expect(sizes?.[0].quantity).toBe(3);
      expect(sizes?.[1].quantity).toBe(5);
    });

    it('clamps invalid qty to 1', async () => {
      const wrapper = mountInput(makeOffcut(), 'mm', true);
      const input = wrapper.find('[data-testid="sheet-size-qty-0"]');
      for (const bad of ['0', '-2', 'abc']) {
        (input.element as HTMLInputElement).value = bad;
        await input.trigger('input');
      }
      const emitted = wrapper.emitted('update:modelValue')!;
      for (const [next] of emitted) {
        expect((next as SheetStockMatrix).sizes[0].quantity).toBe(1);
      }
    });
  });
});
