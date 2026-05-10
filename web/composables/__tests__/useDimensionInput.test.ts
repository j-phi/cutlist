/**
 * useDimensionInput — the typing layer that bridges mm storage and the
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
  type Precision,
} from 'cutlist';
import { useDimensionInput } from '../useDimensionInput';

describe('useDimensionInput', () => {
  it('does not reformat the input while the user is typing', async () => {
    const mm = ref<number | null>(null);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION); // 1/32"
    const { input } = useDimensionInput(mm, unit, precision);

    // Simulate keystrokes building up "1.95".
    input.value = '1';
    await nextTick();
    expect(input.value).toBe('1');
    expect(mm.value).toBeCloseTo(25.4, 6);

    input.value = '1.';
    await nextTick();
    expect(input.value).toBe('1.');

    input.value = '1.9';
    await nextTick();
    expect(input.value).toBe('1.9');
    expect(mm.value).toBeCloseTo(48.26, 6);

    input.value = '1.95';
    await nextTick();
    // Critical: the input must still read "1.95", not "1 15/16".
    expect(input.value).toBe('1.95');
    expect(mm.value).toBeCloseTo(49.53, 6);
  });

  it('does not push display rounding back into storage on mount', async () => {
    // 38mm is 1.4961" — rounds to "1 1/2" at 1/32 precision. Mounting must
    // leave the storage value untouched even though the display is rounded.
    const mm = ref<number | null>(38);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(mm, unit, precision);

    expect(input.value).toBe('1 1/2');
    await nextTick();
    expect(mm.value).toBe(38);
  });

  it('re-renders the input when the precision setting changes', async () => {
    const mm = ref<number | null>(38);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION); // 1/32 → "1 1/2"
    const { input } = useDimensionInput(mm, unit, precision);
    expect(input.value).toBe('1 1/2');

    precision.value = { kind: 'decimal', step: 0.01 };
    await nextTick();
    expect(input.value).toBe('1.5');
    // Storage stays raw at 38 mm regardless.
    expect(mm.value).toBe(38);
  });

  it('re-renders the input when the unit flips', async () => {
    const mm = ref<number | null>(38);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(mm, unit, precision);
    expect(input.value).toBe('1 1/2');

    unit.value = 'mm';
    precision.value = DEFAULT_MM_PRECISION;
    await nextTick();
    expect(input.value).toBe('38');
    expect(mm.value).toBe(38);
  });

  it('updates the input when storage changes from outside', async () => {
    const mm = ref<number | null>(25.4);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(mm, unit, precision);
    expect(input.value).toBe('1');

    // External update — e.g. undo, project switch, scene replay.
    mm.value = 76.2; // 3"
    await nextTick();
    expect(input.value).toBe('3');
  });

  it('clears the input when storage becomes null', async () => {
    const mm = ref<number | null>(38);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(mm, unit, precision);
    expect(input.value).toBe('1 1/2');

    mm.value = null;
    await nextTick();
    expect(input.value).toBe('');
  });

  it('reformats the input on commit (blur) without changing storage', async () => {
    const mm = ref<number | null>(null);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input, commit } = useDimensionInput(mm, unit, precision);

    // User types "1.95" and walks away from the field.
    input.value = '1.95';
    await nextTick();
    expect(input.value).toBe('1.95');
    expect(mm.value).toBeCloseTo(49.53, 6);

    commit();
    // Field snaps to canonical at 1/32 precision; storage is untouched.
    expect(input.value).toBe('1 15/16');
    expect(mm.value).toBeCloseTo(49.53, 6);
  });

  it('ignores transiently-unparseable input without overwriting storage', async () => {
    const mm = ref<number | null>(25.4);
    const unit = ref<'mm' | 'in'>('in');
    const precision = ref<Precision>(DEFAULT_INCH_PRECISION);
    const { input } = useDimensionInput(mm, unit, precision);

    // Mid-typing "1/" before completing "1/2" — unparseable.
    input.value = '1/';
    await nextTick();
    expect(mm.value).toBe(25.4); // unchanged

    input.value = '1/2';
    await nextTick();
    expect(mm.value).toBeCloseTo(12.7, 6);
  });
});
