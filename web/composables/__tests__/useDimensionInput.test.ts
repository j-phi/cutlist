/**
 * useDimensionInput — the typing layer that bridges µm storage and the
 * displayed string. The two invariants pinned here are:
 *
 *   1. Mid-typing values like `"1.95"` are NOT reformatted out from under
 *      the user. Storage updates as they type; the input string stays
 *      exactly what they typed.
 *   2. Display rounding NEVER bleeds back into storage. Mounting the
 *      composable with a stored value re-renders the input at display
 *      precision but leaves storage untouched.
 */
import { describe, it, expect } from 'vitest';
import { nextTick, ref } from 'vue';
import {
  DEFAULT_INCH_PRECISION,
  DEFAULT_MM_PRECISION,
  mmToUm,
  type Micrometres,
  type Precision,
} from 'cutlist';
import { useDimensionInput } from '../useDimensionInput';

describe('useDimensionInput', () => {
  it('does not reformat the input while the user is typing', async () => {
    const um = ref<Micrometres | null>(null);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(um, unit, precision);

    input.value = '1';
    await nextTick();
    expect(input.value).toBe('1');
    expect(um.value).toBe(mmToUm(25.4));

    input.value = '1.';
    await nextTick();
    expect(input.value).toBe('1.');

    input.value = '1.9';
    await nextTick();
    expect(input.value).toBe('1.9');
    expect(um.value).toBe(mmToUm(48.26));

    input.value = '1.95';
    await nextTick();
    expect(input.value).toBe('1.95');
    expect(um.value).toBe(mmToUm(49.53));
  });

  it('does not push display rounding back into storage on mount', async () => {
    // 38mm is 1.4961" — rounds to "1 1/2" at 1/32 precision.
    const um = ref<Micrometres | null>(mmToUm(38));
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(um, unit, precision);

    expect(input.value).toBe('1 1/2');
    await nextTick();
    expect(um.value).toBe(mmToUm(38));
  });

  it('re-renders the input when the precision setting changes', async () => {
    const um = ref<Micrometres | null>(mmToUm(38));
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(um, unit, precision);
    expect(input.value).toBe('1 1/2');

    precision.value = { kind: 'decimal', step: 0.01 };
    await nextTick();
    expect(input.value).toBe('1.5');
    expect(um.value).toBe(mmToUm(38));
  });

  it('re-renders the input when the unit flips', async () => {
    const um = ref<Micrometres | null>(mmToUm(38));
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(um, unit, precision);
    expect(input.value).toBe('1 1/2');

    unit.value = 'mm';
    precision.value = DEFAULT_MM_PRECISION;
    await nextTick();
    expect(input.value).toBe('38');
    expect(um.value).toBe(mmToUm(38));
  });

  it('updates the input when storage changes from outside', async () => {
    const um = ref<Micrometres | null>(mmToUm(25.4));
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(um, unit, precision);
    expect(input.value).toBe('1');

    um.value = mmToUm(76.2); // 3"
    await nextTick();
    expect(input.value).toBe('3');
  });

  it('clears the input when storage becomes null', async () => {
    const um = ref<Micrometres | null>(mmToUm(38));
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(um, unit, precision);
    expect(input.value).toBe('1 1/2');

    um.value = null;
    await nextTick();
    expect(input.value).toBe('');
  });

  it('reformats the input on commit (blur) without changing storage', async () => {
    const um = ref<Micrometres | null>(null);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input, commit } = useDimensionInput(um, unit, precision);

    input.value = '1.95';
    await nextTick();
    expect(input.value).toBe('1.95');
    expect(um.value).toBe(mmToUm(49.53));

    commit();
    expect(input.value).toBe('1 15/16');
    expect(um.value).toBe(mmToUm(49.53));
  });

  it('preserves storage when the unit flips while the input is dirty', async () => {
    const um = ref<Micrometres | null>(null);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(um, unit, precision);

    input.value = '2';
    await nextTick();
    expect(um.value).toBe(mmToUm(50.8));

    unit.value = 'mm';
    precision.value = DEFAULT_MM_PRECISION;
    await nextTick();

    expect(um.value).toBe(mmToUm(50.8));
    expect(input.value).toBe('50.8');
  });

  it('ignores transiently-unparseable input without overwriting storage', async () => {
    const um = ref<Micrometres | null>(mmToUm(25.4));
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(um, unit, precision);

    input.value = '1/';
    await nextTick();
    expect(um.value).toBe(mmToUm(25.4));

    input.value = '1/2';
    await nextTick();
    expect(um.value).toBe(mmToUm(12.7));
  });
});
