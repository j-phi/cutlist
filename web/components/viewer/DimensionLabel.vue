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
import { mToUm } from 'cutlist';
import type { IdbDimension } from '~/composables/useIdb';
import { useAnnotations } from '~/composables/useAnnotations';

const props = defineProps<{
  annotation: IdbDimension;
  draft: boolean;
  /**
   * World-space distance in metres, computed by the projector once both
   * anchors are resolved through their respective Object poses. Optional
   * because the very first frame may render before the projector has
   * ticked; in that case we fall back to the same-frame local distance,
   * which is correct when both anchors share a `groupId` and only wrong by
   * the cross-Object pose for a single frame.
   */
  measuredMeters?: number;
}>();

const formatDistance = useFormatDistance();
const annotationsApi = useAnnotations();

const measuredM = computed(() => {
  if (typeof props.measuredMeters === 'number') return props.measuredMeters;
  // Pre-projector-tick fallback only. Anchors live in possibly-different
  // Object frames, so this is wrong for cross-Object dimensions — but the
  // projector populates `measuredMeters` on the first tick after mount
  // (next animation frame), so users never see a stale value.
  const a = props.annotation.anchor1.local;
  const b = props.annotation.anchor2.local;
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
});

const display = computed(() => {
  const override = props.annotation.text;
  if (override && override.length > 0) return override;
  return formatDistance(mToUm(measuredM.value)) ?? '';
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
