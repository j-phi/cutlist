<script lang="ts" setup>
/**
 * Inline 3D scene viewer for build-doc embeds. Mounts a viewer + the
 * minimum machinery to load one model and replay one scene with its
 * annotations rendered read-only. No toolbars, no gizmo, no scene
 * timeline — just the canvas and the annotation overlay.
 *
 * Distinct from `ModelTab`, which is the full editing surface. We keep
 * them separate so the embed never grows tab chrome by accident.
 */
import AnnotationLabels from '~/components/viewer/AnnotationLabels.vue';
import CalloutLabel from '~/components/viewer/CalloutLabel.vue';
import DimensionLabel from '~/components/viewer/DimensionLabel.vue';
import { useSceneAuthor } from '~/composables/useSceneAuthor';
import { useScenes } from '~/composables/useScenes';
import { useAnnotations } from '~/composables/useAnnotations';
import { useAnnotationAuthor } from '~/composables/useAnnotationAuthor';
import { useAnnotationProjector } from '~/composables/useAnnotationProjector';
import { useFocusedModelLoader } from '~/composables/useFocusedModelLoader';

const props = defineProps<{
  modelId: string;
  sceneId: string;
}>();

const canvasContainer = ref<HTMLElement>();
const viewer = useThreeViewer(canvasContainer);
watchEffect(() => {
  void viewer.ready.value;
  viewer.setGizmoEnabled(false);
});

const focusedModelId = computed(() => props.modelId || null);
const targetSceneId = computed(() => props.sceneId || null);
const readOnly = computed(() => true);

const sceneAuthor = useSceneAuthor(viewer, focusedModelId, { readOnly });
const scenesApi = useScenes(focusedModelId);
const { loadState } = useFocusedModelLoader({
  viewer,
  focusedModelId,
  sceneAuthor,
  scenesApi,
  targetSceneId,
});

const annotationsApi = useAnnotations();
const annotationAuthor = useAnnotationAuthor(
  viewer,
  annotationsApi,
  sceneAuthor.activeSceneId,
);

const renderableSceneId = computed<string | null>(() => {
  const t = sceneAuthor.tween.value;
  if (t && t.t < 0.5) return t.from;
  return sceneAuthor.activeSceneId.value;
});

const visibleAnnotations = computed(() => {
  const sid = renderableSceneId.value;
  if (!sid) return [];
  return annotationsApi.annotations.value.filter((a) => a.sceneId === sid);
});

const projectableAnnotations = annotationAuthor.projectableAnnotations(
  visibleAnnotations,
  renderableSceneId,
);

const { projector } = useAnnotationProjector({
  viewer,
  annotationsApi,
  annotationAuthor,
  activeSceneId: sceneAuthor.activeSceneId,
  getAnnotations: () => projectableAnnotations.value,
});

const annotationKindComponents = {
  callout: CalloutLabel,
  dimension: DimensionLabel,
};
</script>

<template>
  <ClientOnly>
    <div class="relative w-full h-full overflow-hidden">
      <div ref="canvasContainer" class="absolute inset-0 bg-mist-950" />

      <AnnotationLabels
        v-if="loadState === 'loaded'"
        :annotations="annotationsApi.annotations.value"
        :active-scene-id="sceneAuthor.activeSceneId.value"
        :tween="sceneAuthor.tween.value"
        :projector="projector"
        :draft-id="annotationAuthor.draftId.value"
        :preview="annotationAuthor.preview.value"
        :kind-components="annotationKindComponents"
        :on-leader-opacity-scale="(s) => viewer.setLeaderOpacityScale(s)"
      />
    </div>
  </ClientOnly>
</template>
