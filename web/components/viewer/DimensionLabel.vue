<script lang="ts" setup>
/**
 * Auto-formatted length label for a `dimension` annotation. Display only —
 * the parent `AnnotationLabels` already applies the screen-space midpoint
 * translate and line-angle rotation via the projector's aux positions, so
 * this component just renders the text chip.
 *
 * The displayed length is `annotation.text` when set (user override), or
 * the geometric distance auto-formatted per project distance unit. Inline
 * editing of the text override is post-v1 polish; the chip currently only
 * exposes a hover-revealed delete affordance.
 */
import type { IdbDimension } from '~/composables/useIdb';
import { formatLength } from '~/lib/viewer/annotations/dimension';
import { useAnnotations } from '~/composables/useAnnotations';

const props = defineProps<{
  annotation: IdbDimension;
  draft: boolean;
}>();

const { distanceUnit } = useProjectSettings();
const annotationsApi = useAnnotations();

const measuredM = computed(() => {
  const a = props.annotation.anchor1.local;
  const b = props.annotation.anchor2.local;
  // Anchors live in possibly-different Object frames, but for a v1 label we
  // measure straight-line in those frames. Differences only arise when an
  // Object's offset rotates one anchor relative to the other — rare for
  // furniture and self-correcting once the user re-measures.
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
});

const display = computed(() => {
  const override = props.annotation.text;
  if (override && override.length > 0) return override;
  const unit = distanceUnit.value ?? 'mm';
  return formatLength(measuredM.value, unit);
});

async function onDelete(event: MouseEvent): Promise<void> {
  event.stopPropagation();
  await annotationsApi.remove(props.annotation.id);
}
</script>

<template>
  <div
    class="dimension-label group relative bg-elevated text-hi rounded-md px-2 py-0.5 text-xs font-mono shadow border border-subtle whitespace-nowrap"
    :class="{ 'dimension-label-draft': draft }"
    :style="{ pointerEvents: 'auto' }"
  >
    {{ display }}
    <button
      type="button"
      data-testid="annotation-delete"
      aria-label="Delete annotation"
      class="absolute -top-2 -right-2 hidden group-hover:flex items-center justify-center w-5 h-5 rounded-full bg-elevated border border-subtle text-muted hover:text-hi shadow"
      @click="onDelete"
    >
      <UIcon name="i-lucide-x" class="size-3" />
    </button>
  </div>
</template>
