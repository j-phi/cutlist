<script lang="ts" setup>
/**
 * DOM overlay that renders one label per annotation visible in the active
 * scene. Purely presentation — pointer routing belongs to InputRouter.
 *
 * Cross-fade strategy during a scene tween:
 *   - t ∈ [0, 0.5):  outgoing scene's labels at opacity = 1 - 2t
 *   - t ∈ [0.5, 1]: incoming scene's labels at opacity = 2(t - 0.5)
 *
 * Leaders share a single material in the viewer so we can't fade them
 * individually; we drive the global scale on the same curve. Specs 08 / 09
 * own the per-kind leader specs themselves.
 *
 * Per-kind positioning:
 *   - default: wrapper translate = projected `primaryWorld` (3D anchor).
 *   - dimension (Spec 09): wrapper translate = screen-space midpoint of the
 *     rendered main line, with a rotation matching the line's screen angle,
 *     read from `projector.getAuxScreenPositions().get(id)` (two entries:
 *     the projected main-line endpoints).
 *
 * The kindComponents map stays empty in the v1 framework drop. Specs 08
 * and 09 register `CalloutLabel` and `DimensionLabel` against it so the
 * specific kinds can render without touching this file's plumbing.
 */
import type { Component } from 'vue';
import type { AnnotationKind, IdbAnnotation } from '~/composables/useIdb';
import type { AnnotationProjector } from '~/lib/viewer/modules/AnnotationProjector';

const props = defineProps<{
  annotations: IdbAnnotation[];
  activeSceneId: string | null;
  tweenFromSceneId: string | null;
  tweenT: number;
  tweening: boolean;
  projector: AnnotationProjector;
  draftId?: string | null;
  preview?: IdbAnnotation | null;
  kindComponents?: Partial<Record<AnnotationKind, Component>>;
  onLeaderOpacityScale?: (scale: number) => void;
}>();

const activePhase = computed<'outgoing' | 'incoming' | 'idle'>(() => {
  if (!props.tweening) return 'idle';
  return props.tweenT < 0.5 ? 'outgoing' : 'incoming';
});

const fadeOpacity = computed(() => {
  if (!props.tweening) return 1;
  const t = Math.max(0, Math.min(1, props.tweenT));
  return t < 0.5 ? 1 - 2 * t : 2 * (t - 0.5);
});

const renderableSceneId = computed(() => {
  if (activePhase.value === 'outgoing') return props.tweenFromSceneId;
  return props.activeSceneId;
});

const visibleAnnotations = computed(() => {
  const sid = renderableSceneId.value;
  if (!sid) return [];
  const persisted = props.annotations.filter((a) => a.sceneId === sid);
  if (props.preview && props.preview.sceneId === sid) {
    return [...persisted, props.preview];
  }
  return persisted;
});

watch(
  fadeOpacity,
  (s) => {
    props.onLeaderOpacityScale?.(s);
  },
  { immediate: true },
);

function positionStyle(ann: IdbAnnotation): Record<string, string> {
  // Track projector.version for reactivity, then read the latest position.
  void props.projector.version.value;
  if (ann.kind === 'dimension') {
    const aux = props.projector.getAuxScreenPositions().get(ann.id);
    if (aux && aux.length >= 2 && aux[0].inFront && aux[1].inFront) {
      const mx = (aux[0].x + aux[1].x) / 2;
      const my = (aux[0].y + aux[1].y) / 2;
      let angle = Math.atan2(aux[1].y - aux[0].y, aux[1].x - aux[0].x);
      // Keep text upright — flip when the line points "backward".
      if (angle > Math.PI / 2) angle -= Math.PI;
      if (angle < -Math.PI / 2) angle += Math.PI;
      return {
        transform: `translate(${mx}px, ${my}px) rotate(${angle}rad) translate(-50%, -50%)`,
        opacity: String(fadeOpacity.value),
      };
    }
    return { display: 'none' };
  }
  const pos = props.projector.getScreenPositions().get(ann.id);
  if (!pos || !pos.inFront) {
    return { display: 'none' };
  }
  return {
    transform: `translate(${pos.x}px, ${pos.y}px)`,
    opacity: String(fadeOpacity.value),
  };
}
</script>

<template>
  <div
    class="annotation-labels"
    :style="{ pointerEvents: 'none', position: 'absolute', inset: '0' }"
    data-testid="annotation-labels"
  >
    <div
      v-for="ann in visibleAnnotations"
      :key="ann.id"
      class="label"
      :data-annotation-id="ann.id"
      :data-kind="ann.kind"
      :style="{
        position: 'absolute',
        top: '0',
        left: '0',
        ...positionStyle(ann),
      }"
    >
      <component
        :is="props.kindComponents?.[ann.kind]"
        v-if="props.kindComponents?.[ann.kind]"
        :annotation="ann"
        :draft="ann.id === props.draftId"
      />
    </div>
  </div>
</template>
