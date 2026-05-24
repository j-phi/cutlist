<script lang="ts" setup>
/**
 * Per-part edge-banding control (F7 FR-BND-1). A compact popover with four
 * edge checkboxes plus an optional per-part thickness override. When the
 * "subtract banding thickness" toggle is ON, edits that would drive a cut
 * dimension to ≤ 0 µm are rejected (FR-BND-7): the change is reverted and a
 * reason is shown.
 *
 * Edge → dimension mapping (mirrors `BandedEdges`):
 *   - length-edges run along the LENGTH (long sides) → banding reduces WIDTH
 *   - width-edges run along the WIDTH (short sides)  → banding reduces LENGTH
 */
import {
  applyBandingToSize,
  NO_BANDED_EDGES,
  resolveBandingThicknessUm,
  type BandedEdges,
  type Micrometres,
} from 'cutlist';
import { useDimensionInput } from '~/composables/useDimensionInput';

const props = defineProps<{
  bandedEdges?: BandedEdges;
  /** Per-part thickness override, integer µm; absent ≡ project default. */
  bandingThicknessUm?: Micrometres;
  /** Project default banding thickness, integer µm. */
  projectDefaultUm: Micrometres;
  /** Whether the subtract toggle is ON — gates zero-clamp validation. */
  subtract: boolean;
  /** Finished (nominal) extents — for zero-clamp checks + edge labels. */
  finishedWidthUm: Micrometres;
  finishedLengthUm: Micrometres;
  thicknessUm: Micrometres;
}>();

const emit = defineEmits<{
  update: [
    value: { bandedEdges: BandedEdges; bandingThicknessUm?: Micrometres },
  ];
}>();

const { distanceUnit, precision } = useProjectSettings();
const unit = computed<'mm' | 'in'>(() => distanceUnit.value ?? 'mm');
const formatDistance = useFormatDistance();

const edges = ref<BandedEdges>({ ...(props.bandedEdges ?? NO_BANDED_EDGES) });
const thicknessOverrideUm = ref<Micrometres | null>(
  props.bandingThicknessUm ?? null,
);
const error = ref<string | null>(null);

watch(
  () => props.bandedEdges,
  (next) => {
    edges.value = { ...(next ?? NO_BANDED_EDGES) };
  },
);
watch(
  () => props.bandingThicknessUm,
  (next) => {
    thicknessOverrideUm.value = next ?? null;
  },
);

const { input: thicknessInput, commit: commitThickness } = useDimensionInput(
  thicknessOverrideUm,
  unit,
  precision,
);

const resolvedThicknessUm = computed<Micrometres>(() =>
  resolveBandingThicknessUm(thicknessOverrideUm.value, props.projectDefaultUm),
);

/**
 * Apply a candidate edge set, validating against zero-clamp (FR-BND-7) only
 * when subtraction is active. On rejection the change is reverted and the
 * reason surfaced; otherwise we commit and emit.
 */
function tryCommit(next: BandedEdges) {
  if (props.subtract) {
    const result = applyBandingToSize(
      {
        width: props.finishedWidthUm,
        length: props.finishedLengthUm,
        thickness: props.thicknessUm,
      },
      next,
      resolvedThicknessUm.value,
    );
    if (!result.valid) {
      error.value =
        'Banding would leave no material — the cut size would be 0 or less. Reduce the thickness or band fewer edges.';
      return;
    }
  }
  error.value = null;
  edges.value = next;
  emit('update', {
    bandedEdges: next,
    bandingThicknessUm: thicknessOverrideUm.value ?? undefined,
  });
}

function toggle(edge: keyof BandedEdges) {
  tryCommit({ ...edges.value, [edge]: !edges.value[edge] });
}

function onThicknessBlur() {
  commitThickness();
  // Re-validate the current edge selection against the new thickness.
  tryCommit({ ...edges.value });
}

const anyBanded = computed(
  () =>
    edges.value.length1 ||
    edges.value.length2 ||
    edges.value.width1 ||
    edges.value.width2,
);

const finishedW = computed(() => formatDistance(props.finishedWidthUm) ?? '');
const finishedL = computed(() => formatDistance(props.finishedLengthUm) ?? '');
</script>

<template>
  <UPopover>
    <button
      type="button"
      :aria-label="
        anyBanded ? 'Edit edge banding' : 'No edge banding. Click to set.'
      "
      :title="anyBanded ? 'Edge banding set' : 'Set edge banding'"
      class="flex items-center px-1.5 py-0.5 rounded text-xs transition-colors"
      :class="
        anyBanded
          ? 'text-teal-400 hover:text-teal-300'
          : 'text-dim hover:text-muted'
      "
    >
      <UIcon name="i-lucide-square-dashed-bottom" class="w-3.5 h-3.5" />
    </button>
    <template #content>
      <div class="p-3 w-64 flex flex-col gap-2 bg-elevated">
        <p class="text-xs font-medium text-hi">Edge banding</p>
        <div class="grid grid-cols-2 gap-1.5">
          <UCheckbox
            :model-value="edges.length1"
            :label="`Length edge (${finishedL})`"
            size="xs"
            @update:model-value="toggle('length1')"
          />
          <UCheckbox
            :model-value="edges.length2"
            :label="`Length edge (${finishedL})`"
            size="xs"
            @update:model-value="toggle('length2')"
          />
          <UCheckbox
            :model-value="edges.width1"
            :label="`Width edge (${finishedW})`"
            size="xs"
            @update:model-value="toggle('width1')"
          />
          <UCheckbox
            :model-value="edges.width2"
            :label="`Width edge (${finishedW})`"
            size="xs"
            @update:model-value="toggle('width2')"
          />
        </div>
        <div class="flex flex-col gap-0.5">
          <label class="text-xs text-muted"
            >Thickness override ({{ unit }})</label
          >
          <UInput
            v-model="thicknessInput"
            :placeholder="`default ${formatDistance(projectDefaultUm) ?? '0'}`"
            size="xs"
            type="text"
            inputmode="decimal"
            @blur="onThicknessBlur"
          />
        </div>
        <p v-if="error" class="text-xs text-red-400">{{ error }}</p>
      </div>
    </template>
  </UPopover>
</template>
