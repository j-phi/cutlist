<script lang="ts" setup>
import { convertUnits, type LinearStockMatrix, type Precision } from 'cutlist';
import { useDimensionDrafts } from '~/composables/useDimensionDrafts';

const props = defineProps<{
  modelValue: LinearStockMatrix;
  distanceUnit: 'in' | 'mm';
  precision: Precision;
}>();

const emit = defineEmits<{
  'update:modelValue': [next: LinearStockMatrix];
}>();

const unit = computed(() => props.distanceUnit);
const precisionRef = computed(() => props.precision);
const drafts = useDimensionDrafts(unit, precisionRef);

const lengthKey = (idx: number) => `length-${idx}`;
const crossKey = (field: 'crossSectionWidth' | 'crossSectionThickness') =>
  `cross-${field}`;
const allowanceKey = (field: 'length' | 'crossSection') => `allowance-${field}`;

const allowanceOpen = ref(false);

const hasAllowance = computed(() => {
  const o = props.modelValue.oversize;
  return !!o && (o.length > 0 || o.crossSection > 0);
});

function emitLengths(next: number[]) {
  // Index-keyed length drafts shift on add/remove; clear before re-emit.
  drafts.reset();
  emit('update:modelValue', {
    ...props.modelValue,
    size: { ...props.modelValue.size, lengths: next },
  });
}

function commitLength(idx: number) {
  const mm = drafts.commit(lengthKey(idx));
  if (mm == null) return;
  const next = [...props.modelValue.size.lengths];
  next[idx] = mm;
  emitLengths(next.sort((a, b) => a - b));
}

function removeLength(idx: number) {
  emitLengths(props.modelValue.size.lengths.filter((_, i) => i !== idx));
}

function addLength() {
  const existing = props.modelValue.size.lengths;
  const seed =
    existing.length > 0
      ? Math.max(...existing)
      : unit.value === 'in'
        ? convertUnits(96, 'in', 'mm')
        : 2400;
  emitLengths([...existing, seed].sort((a, b) => a - b));
}

function commitCrossSection(
  field: 'crossSectionWidth' | 'crossSectionThickness',
) {
  const mm = drafts.commit(crossKey(field));
  if (mm == null) return;
  emit('update:modelValue', {
    ...props.modelValue,
    size: { ...props.modelValue.size, [field]: mm },
  });
}

function commitAllowance(field: 'length' | 'crossSection') {
  const mm = drafts.commit(allowanceKey(field), { allowZero: true });
  if (mm == null) return;
  const existing = props.modelValue.oversize ?? { length: 0, crossSection: 0 };
  const merged = { ...existing, [field]: mm };
  const allZero = merged.length === 0 && merged.crossSection === 0;
  emit('update:modelValue', {
    ...props.modelValue,
    oversize: allZero ? undefined : merged,
  });
}

/** Side-label "(8 ft)" for foot-multiple inches. */
function footLabel(mm: number): string {
  if (unit.value !== 'in') return '';
  const inches = convertUnits(mm, 'mm', 'in');
  if (inches >= 12 && Math.abs(inches - Math.round(inches / 12) * 12) < 0.05) {
    return `${Math.round(inches / 12)} ft`;
  }
  return '';
}
</script>

<template>
  <div class="flex flex-col gap-3" data-testid="linear-dimensions">
    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-muted uppercase tracking-wider">
        Cross-section ({{ unit }})
      </label>
      <div class="flex items-center gap-2">
        <UInput
          :model-value="
            drafts.display(
              crossKey('crossSectionThickness'),
              modelValue.size.crossSectionThickness,
            )
          "
          class="flex-1 font-mono"
          :placeholder="unit === 'in' ? 'e.g. 1 1/2' : 'e.g. 38'"
          data-testid="linear-cross-thickness"
          @update:model-value="
            (v: string) => drafts.set(crossKey('crossSectionThickness'), v)
          "
          @blur="commitCrossSection('crossSectionThickness')"
          @keydown.enter="commitCrossSection('crossSectionThickness')"
        />
        <span class="text-dim text-sm">&times;</span>
        <UInput
          :model-value="
            drafts.display(
              crossKey('crossSectionWidth'),
              modelValue.size.crossSectionWidth,
            )
          "
          class="flex-1 font-mono"
          :placeholder="unit === 'in' ? 'e.g. 3 1/2' : 'e.g. 89'"
          data-testid="linear-cross-width"
          @update:model-value="
            (v: string) => drafts.set(crossKey('crossSectionWidth'), v)
          "
          @blur="commitCrossSection('crossSectionWidth')"
          @keydown.enter="commitCrossSection('crossSectionWidth')"
        />
      </div>
    </div>

    <div class="flex flex-col gap-1.5">
      <label class="text-xs font-medium text-muted uppercase tracking-wider">
        Available lengths ({{ unit }})
      </label>
      <div class="flex flex-col gap-1">
        <div
          v-for="(mm, idx) in modelValue.size.lengths"
          :key="idx"
          class="flex items-center gap-2"
          data-testid="linear-length-row"
        >
          <UInput
            :model-value="drafts.display(lengthKey(idx), mm)"
            class="flex-1 font-mono"
            :placeholder="unit === 'in' ? 'e.g. 96” or 8ft' : 'e.g. 2400'"
            :data-length-mm="mm"
            @update:model-value="(v: string) => drafts.set(lengthKey(idx), v)"
            @blur="commitLength(idx)"
            @keydown.enter="commitLength(idx)"
          />
          <span
            v-if="footLabel(mm)"
            class="text-xs text-dim font-mono min-w-[3rem] text-right"
          >
            {{ footLabel(mm) }}
          </span>
          <UButton
            color="neutral"
            variant="ghost"
            icon="i-lucide-trash-2"
            size="xs"
            data-testid="linear-length-remove"
            @click="removeLength(idx)"
          />
        </div>
      </div>
      <UButton
        color="neutral"
        variant="soft"
        size="xs"
        icon="i-lucide-plus"
        class="self-start mt-1"
        data-testid="linear-length-add"
        @click="addLength"
      >
        Add length
      </UButton>
    </div>

    <div class="flex flex-col gap-1.5">
      <button
        type="button"
        class="flex items-center gap-1.5 text-left group"
        :aria-expanded="allowanceOpen"
        data-testid="linear-allowance-toggle"
        @click="allowanceOpen = !allowanceOpen"
      >
        <UIcon
          :name="
            allowanceOpen ? 'i-lucide-chevron-down' : 'i-lucide-chevron-right'
          "
          class="w-3.5 h-3.5 text-dim group-hover:text-body shrink-0"
        />
        <span class="text-xs font-medium text-muted uppercase tracking-wider">
          Material allowance
        </span>
        <span
          v-if="hasAllowance"
          class="text-xs text-teal-400 font-mono"
          data-testid="linear-allowance-chip"
        >
          +{{ drafts.format(modelValue.oversize?.crossSection ?? 0) }} across,
          +{{ drafts.format(modelValue.oversize?.length ?? 0) }} long
        </span>
      </button>
      <div v-if="allowanceOpen" class="pl-5 flex flex-col gap-2">
        <p class="text-xs text-dim">
          Extra material reserved per part for planing or end-trimming. Leave at
          zero to treat modeled dimensions as stock dimensions.
        </p>
        <div class="flex items-center gap-2">
          <div class="flex-1 flex flex-col gap-1">
            <label class="text-xs text-dim"
              >Across cross-section ({{ unit }})</label
            >
            <UInput
              :model-value="
                drafts.display(
                  allowanceKey('crossSection'),
                  modelValue.oversize?.crossSection ?? 0,
                )
              "
              class="font-mono"
              placeholder="0"
              data-testid="linear-allowance-cross"
              @update:model-value="
                (v: string) => drafts.set(allowanceKey('crossSection'), v)
              "
              @blur="commitAllowance('crossSection')"
              @keydown.enter="commitAllowance('crossSection')"
            />
          </div>
          <div class="flex-1 flex flex-col gap-1">
            <label class="text-xs text-dim">Along length ({{ unit }})</label>
            <UInput
              :model-value="
                drafts.display(
                  allowanceKey('length'),
                  modelValue.oversize?.length ?? 0,
                )
              "
              class="font-mono"
              placeholder="0"
              data-testid="linear-allowance-length"
              @update:model-value="
                (v: string) => drafts.set(allowanceKey('length'), v)
              "
              @blur="commitAllowance('length')"
              @keydown.enter="commitAllowance('length')"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
