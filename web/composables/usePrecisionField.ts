/**
 * Reactive binding between a `Precision` ref and a Nuxt UI `<USelect>` model.
 * Both `SettingsTab` (per-project) and `NewProjectDialog` (new-project) need
 * the same option lists + key encoding; this lives in one place.
 *
 * Usage:
 *
 *   const { precisionModel, precisionItems } = usePrecisionField(precision, unit);
 *   <USelect v-model="precisionModel" :items="precisionItems" />
 */
import type { Precision } from 'cutlist';
import type {
  ComputedRef,
  MaybeRefOrGetter,
  Ref,
  WritableComputedRef,
} from 'vue';

export interface PrecisionOption {
  label: string;
  value: Precision;
}

export const INCH_PRECISION_OPTIONS: PrecisionOption[] = [
  { label: '1/8"', value: { kind: 'fraction', denominator: 8 } },
  { label: '1/16"', value: { kind: 'fraction', denominator: 16 } },
  { label: '1/32"', value: { kind: 'fraction', denominator: 32 } },
  { label: '1/64"', value: { kind: 'fraction', denominator: 64 } },
  { label: 'Decimal (0.01")', value: { kind: 'decimal', step: 0.01 } },
];

export const MM_PRECISION_OPTIONS: PrecisionOption[] = [
  { label: '1 mm', value: { kind: 'decimal', step: 1 } },
  { label: '0.5 mm', value: { kind: 'decimal', step: 0.5 } },
  { label: '0.1 mm', value: { kind: 'decimal', step: 0.1 } },
  { label: '0.01 mm', value: { kind: 'decimal', step: 0.01 } },
];

export function precisionKey(p: Precision | undefined): string {
  if (!p) return '';
  return p.kind === 'fraction' ? `f:${p.denominator}` : `d:${p.step}`;
}

export function usePrecisionField(
  precision: Ref<Precision>,
  unit: MaybeRefOrGetter<'mm' | 'in'>,
): {
  precisionModel: WritableComputedRef<string>;
  precisionItems: ComputedRef<{ label: string; value: string }[]>;
} {
  const options = computed(() =>
    toValue(unit) === 'in' ? INCH_PRECISION_OPTIONS : MM_PRECISION_OPTIONS,
  );
  const precisionModel = computed<string>({
    get: () => precisionKey(precision.value),
    set: (key: string) => {
      const match = options.value.find((o) => precisionKey(o.value) === key);
      if (match) precision.value = match.value;
    },
  });
  const precisionItems = computed(() =>
    options.value.map((o) => ({
      label: o.label,
      value: precisionKey(o.value),
    })),
  );
  return { precisionModel, precisionItems };
}
