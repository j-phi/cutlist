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
 * individually; we drive the global scale on the same curve. Per-kind
 * annotation modules own the per-kind leader specs themselves.
 *
 * Per-kind positioning:
 *   - default: wrapper translate = projected `primaryWorld` (3D anchor).
 *   - dimension: wrapper translate = screen-space midpoint of the
 *     rendered main line, with a rotation matching the line's screen angle,
 *     read from `projector.getAuxScreenPositions().get(id)` (two entries:
 *     the projected main-line endpoints).
 *
 * The kindComponents map stays empty in the framework itself. Per-kind
 * modules register `CalloutLabel` and `DimensionLabel` against it so the
 * specific kinds can render without touching this file's plumbing.
 */
import type { Component } from 'vue';
import type { AnnotationKind, IdbAnnotation } from '~/composables/useIdb';
import type { Tween } from '~/composables/useSceneAuthor';
import type { AnnotationProjector } from '~/lib/viewer/modules/AnnotationProjector';

const props = defineProps<{
  annotations: IdbAnnotation[];
  activeSceneId: string | null;
  tween: Tween | null;
  projector: AnnotationProjector;
  draftId?: string | null;
  preview?: IdbAnnotation | null;
  kindComponents?: Partial<Record<AnnotationKind, Component>>;
  onLeaderOpacityScale?: (scale: number) => void;
}>();

const activePhase = computed<'outgoing' | 'incoming' | 'idle'>(() => {
  if (!props.tween) return 'idle';
  return props.tween.t < 0.5 ? 'outgoing' : 'incoming';
});

const fadeOpacity = computed(() => {
  if (!props.tween) return 1;
  const t = Math.max(0, Math.min(1, props.tween.t));
  return t < 0.5 ? 1 - 2 * t : 2 * (t - 0.5);
});

const renderableSceneId = computed(() => {
  if (activePhase.value === 'outgoing') return props.tween?.from ?? null;
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

// Drop cached angles for ids that are no longer visible — keeps the cache
// from leaking across deletions, and resets the preview entry between
// drafting sessions so a new dim doesn't inherit the previous one's drift.
watch(visibleAnnotations, (list) => {
  const live = new Set(list.map((a) => a.id));
  for (const id of [...stableAngles.keys()]) {
    if (!live.has(id)) stableAngles.delete(id);
  }
});

// Per-dimension rotation cache. The chip looks identical under any of
// `{raw, raw±π}` (a 180° rotation flips the line direction but the line is
// undirected), so we pick the equivalent value closest to last frame's. That
// turns the discontinuous "flip when text would read backward" check into a
// continuous drift, killing the 1-frame snap as the projected line orbits
// through ±π/2 (vertical).
const stableAngles = new Map<string, number>();

function stabilizeAngle(raw: number, id: string): number {
  const last = stableAngles.get(id);
  let result: number;
  if (last == null) {
    // First frame: normalise to [-π/2, π/2] so text reads upright.
    let a = raw;
    if (a > Math.PI / 2) a -= Math.PI;
    else if (a < -Math.PI / 2) a += Math.PI;
    result = a;
  } else {
    let delta = raw - last;
    while (delta > Math.PI / 2) delta -= Math.PI;
    while (delta < -Math.PI / 2) delta += Math.PI;
    result = last + delta;
  }
  stableAngles.set(id, result);
  return result;
}

function measuredMetersFor(id: string): number | undefined {
  // Track projector.version so the prop refreshes on every tick — the chip
  // text needs to update if the cross-Object distance changes (e.g. an
  // Object's offsetMatrix is animated).
  void props.projector.version.value;
  return props.projector.getMeasurements().get(id);
}

function positionStyle(ann: IdbAnnotation): Record<string, string> {
  // Track projector.version for reactivity, then read the latest position.
  void props.projector.version.value;
  if (ann.kind === 'dimension') {
    const aux = props.projector.getAuxScreenPositions().get(ann.id);
    if (aux && aux.length >= 2 && aux[0].inFront && aux[1].inFront) {
      const mx = (aux[0].x + aux[1].x) / 2;
      const my = (aux[0].y + aux[1].y) / 2;
      const raw = Math.atan2(aux[1].y - aux[0].y, aux[1].x - aux[0].x);
      const angle = stabilizeAngle(raw, ann.id);
      return {
        // `translate(-50%, -100%)` anchors the chip's bottom-center to the
        // projected line midpoint, so the chip rests on the line rather than
        // being centered over it (which used to hide the line behind the
        // opaque background and read as "floating near").
        transform: `translate(${mx}px, ${my}px) rotate(${angle}rad) translate(-50%, -100%)`,
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
        :measured-meters="measuredMetersFor(ann.id)"
      />
    </div>
  </div>
</template>
