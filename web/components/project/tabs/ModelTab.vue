<script lang="ts" setup>
import type { BoardLayoutLeftover } from 'cutlist';
import type { GizmoMode, ViewPreset } from '~/lib/viewer/types';
import ViewCube from '~/components/viewer/ViewCube.vue';
import ObjectsPanel from '~/components/viewer/ObjectsPanel.vue';
import SceneTimeline from '~/components/viewer/SceneTimeline.vue';
import AnnotationLabels from '~/components/viewer/AnnotationLabels.vue';
import CalloutLabel from '~/components/viewer/CalloutLabel.vue';
import DimensionLabel from '~/components/viewer/DimensionLabel.vue';
import ModelEmptyState from '~/components/viewer/ModelEmptyState.vue';
import ModelSwitcher from '~/components/viewer/ModelSwitcher.vue';
import GizmoModeToggle from '~/components/viewer/GizmoModeToggle.vue';
import MouseLegend from '~/components/viewer/MouseLegend.vue';
import PartInfoPanel from '~/components/viewer/PartInfoPanel.vue';
import AnnotationToolbar from '~/components/viewer/AnnotationToolbar.vue';
import { useSceneAuthor } from '~/composables/useSceneAuthor';
import { useScenes } from '~/composables/useScenes';
import { useAnnotations } from '~/composables/useAnnotations';
import { useAnnotationAuthor } from '~/composables/useAnnotationAuthor';
import { useAnnotationProjector } from '~/composables/useAnnotationProjector';
import { useSceneAuthoringActions } from '~/composables/useSceneAuthoringActions';
import { useFocusedModelLoader } from '~/composables/useFocusedModelLoader';

const props = withDefaults(
  defineProps<{
    showOpenButton?: boolean;
  }>(),
  {
    showOpenButton: false,
  },
);
const emit = defineEmits<{
  expand: [];
}>();

const { activeId, enabledModels: allEnabledModels } = useProjects();
const enabledModels = computed(() =>
  allEnabledModels.value.filter((m) => m.source !== 'manual'),
);
const { data: boardLayouts } = useBoardLayoutsQuery();
const store = useModelViewerStore();

const canvasContainer = ref<HTMLElement>();
const viewer = useThreeViewer(canvasContainer);

// Model switcher — always show exactly one model
const focusedModelIdx = ref(0);

watch(activeId, () => {
  focusedModelIdx.value = 0;
  // The active-scene memory is keyed by modelId (stable per project), so a
  // project switch invalidates every entry — purge to keep the map bounded
  // and avoid stale ids surviving a project delete + re-create.
  store.clearActiveSceneMemory();
});

const focusedModel = computed(() => {
  const idx = Math.min(focusedModelIdx.value, enabledModels.value.length - 1);
  return enabledModels.value[idx] ?? null;
});

const focusedModelId = computed<string | null>(
  () => focusedModel.value?.id ?? null,
);

const hasModelData = computed(() => enabledModels.value.length > 0);

const hasOnlyManualModels = computed(
  () =>
    allEnabledModels.value.length > 0 &&
    allEnabledModels.value.every((m) => m.source === 'manual'),
);

const emptyStateType = computed<
  'no-models' | 'manual-only' | 'no-source' | null
>(() => {
  if (hasOnlyManualModels.value) return 'manual-only';
  if (allEnabledModels.value.length === 0) return 'no-models';
  if (enabledModels.value.length === 0) return 'no-models';
  if (focusedModelId.value && loadState.value === 'missing-source')
    return 'no-source';
  return null;
});

function findPart(partNum: number | null): BoardLayoutLeftover | undefined {
  if (partNum == null || !boardLayouts.value) return;
  return [
    ...boardLayouts.value.layouts.flatMap((l) => l.placements),
    ...boardLayouts.value.leftovers,
  ].find((p) => p.partNumber === partNum);
}

const infoPart = computed(() => {
  const inv = store.partNumberOfGroupId.value;
  for (const id of store.selectedGroupIds.value) {
    const pn = inv.get(id);
    const found = pn != null ? findPart(pn) : undefined;
    if (found) return found;
  }
  for (const id of store.hoveredGroupIds.value) {
    const pn = inv.get(id);
    const found = pn != null ? findPart(pn) : undefined;
    if (found) return found;
  }
  return undefined;
});

const gizmoMode = ref<GizmoMode>('translate');

const hasSelection = computed(() => store.selectedGroupIds.value.size > 0);

function onGizmoMode(mode: GizmoMode) {
  gizmoMode.value = mode;
  viewer.setGizmoMode(mode);
}

// Scenes are model-scoped. The focused model id drives both the timeline
// (`useScenes`) and the per-model active-scene memory inside `useSceneAuthor`.
const sceneAuthor = useSceneAuthor(viewer, focusedModelId);
const scenesApi = useScenes(focusedModelId);
const { loadedGraph, loadState } = useFocusedModelLoader({
  viewer,
  focusedModelId,
  sceneAuthor,
  scenesApi,
});
const canShowViewerControls = computed(
  () =>
    hasModelData.value && !hasOnlyManualModels.value && !emptyStateType.value,
);
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

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

useEventListener('keydown', (event: KeyboardEvent) => {
  if (event.key !== 'Delete' && event.key !== 'Backspace') return;
  if (event.repeat) return;
  if (store.selectedGroupIds.value.size === 0) return;
  if (annotationAuthor.mode.value === 'pick') return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (isEditableTarget(event.target)) return;
  event.preventDefault();
  sceneAuthor.toggleObjectsVisibility(Array.from(store.selectedGroupIds.value));
});

function onAddCallout() {
  if (!sceneAuthor.activeSceneId.value || sceneAuthor.tween.value !== null)
    return;
  annotationAuthor.enter('callout');
}

function onDraftCommitted(id: string) {
  // The chip just settled its inline-edit — drop the draft pointer so the
  // next render renders it as a persisted annotation (read-only span)
  // rather than a textarea. Without this, the textarea stays visible
  // across scene switches and on remount no longer reflects the persisted
  // text correctly.
  if (annotationAuthor.draftId.value === id) annotationAuthor.clearDraft();
}

function onAddDimension() {
  if (!sceneAuthor.activeSceneId.value || sceneAuthor.tween.value !== null)
    return;
  annotationAuthor.enter('dimension');
}

const annotationKindComponents = {
  callout: CalloutLabel,
  dimension: DimensionLabel,
};

const sceneActions = useSceneAuthoringActions(sceneAuthor, scenesApi);

function onSnap(preset: ViewPreset) {
  viewer.applyViewPreset(preset);
}
</script>

<template>
  <ClientOnly>
    <div class="relative h-full overflow-hidden">
      <!-- 3D Canvas -->
      <div ref="canvasContainer" class="absolute inset-0 bg-mist-950" />

      <!-- Marquee multi-select rect. AutoCAD/OnShape convention:
           solid border = window (drag L→R, must fully contain) and
           dashed border = crossing (drag R→L, any overlap counts). -->
      <div
        v-if="viewer.marqueeRect.value"
        class="pointer-events-none absolute z-10 border-teal-400/70 bg-teal-400/10"
        :class="
          viewer.marqueeRect.value.mode === 'window'
            ? 'border border-solid'
            : 'border border-dashed bg-teal-400/15'
        "
        :style="{
          left: viewer.marqueeRect.value.x + 'px',
          top: viewer.marqueeRect.value.y + 'px',
          width: viewer.marqueeRect.value.w + 'px',
          height: viewer.marqueeRect.value.h + 'px',
        }"
      />

      <!-- Annotation overlay -->
      <AnnotationLabels
        v-if="canShowViewerControls"
        :annotations="annotationsApi.annotations.value"
        :active-scene-id="sceneAuthor.activeSceneId.value"
        :tween="sceneAuthor.tween.value"
        :projector="projector"
        :draft-id="annotationAuthor.draftId.value"
        :preview="annotationAuthor.preview.value"
        :kind-components="annotationKindComponents"
        :on-leader-opacity-scale="(s) => viewer.setLeaderOpacityScale(s)"
        @draft-committed="onDraftCommitted"
      />

      <!-- Pick-mode hint. `pointer-events: none` so the cursor never lands
           on this overlay during a multi-step pick — otherwise the canvas
           below would miss pointermove events between clicks (e.g. the
           dimension offset preview would freeze). -->
      <div
        v-if="annotationAuthor.mode.value === 'pick'"
        class="absolute top-4 left-1/2 -translate-x-1/2 z-20 bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2 text-sm text-body shadow pointer-events-none"
      >
        {{ annotationAuthor.hint.value }}
      </div>

      <!-- Empty states (no-models / manual-only / no-source) -->
      <ModelEmptyState v-if="emptyStateType" :type="emptyStateType" />

      <!-- Model switcher (only when multiple enabled models) -->
      <div v-if="enabledModels.length > 1" class="absolute top-4 left-4 z-10">
        <ModelSwitcher
          :models="enabledModels"
          :focused-idx="focusedModelIdx"
          @update:focused-idx="(idx) => (focusedModelIdx = idx)"
        />
      </div>

      <div
        v-if="props.showOpenButton"
        class="absolute top-4 right-4 z-10 bg-overlay backdrop-blur border border-subtle rounded-lg p-1"
      >
        <UButton
          size="xs"
          color="primary"
          variant="soft"
          icon="i-lucide-expand"
          label="Open model view"
          @click="emit('expand')"
        />
      </div>

      <!-- Objects panel (left sidebar) -->
      <div
        v-if="canShowViewerControls && loadedGraph"
        class="absolute top-4 left-4 z-10"
        :class="enabledModels.length > 1 ? 'top-16' : 'top-4'"
      >
        <ObjectsPanel :graph="loadedGraph" :author="sceneAuthor" />
      </div>

      <!-- Gizmo mode toolbar (only when something is selected) -->
      <div
        v-if="canShowViewerControls && hasSelection"
        class="absolute top-4 z-10"
        :class="props.showOpenButton ? 'right-[16.5rem]' : 'right-32'"
      >
        <GizmoModeToggle :mode="gizmoMode" @update:mode="onGizmoMode" />
      </div>

      <!-- View cube + projection / floor toggles -->
      <div
        v-if="canShowViewerControls"
        class="absolute top-4 z-10"
        :class="props.showOpenButton ? 'right-44' : 'right-4'"
      >
        <ViewCube
          :camera-direction="viewer.cameraDirection.value"
          :camera-mode="sceneAuthor.cameraMode.value"
          :floor-visible="sceneAuthor.floorVisible.value"
          @snap="onSnap"
          @update:camera-mode="(m) => sceneAuthor.setCameraMode(m)"
          @update:floor-visible="(v) => sceneAuthor.setFloorVisible(v)"
        />
      </div>

      <!-- Part info panel -->
      <div v-if="infoPart" class="absolute bottom-4 left-4 z-10">
        <PartInfoPanel :part="infoPart" />
      </div>

      <!-- Scene timeline (bottom strip) -->
      <div
        v-if="canShowViewerControls"
        class="absolute left-0 right-0 bottom-0 z-10"
      >
        <AnnotationToolbar
          :has-active-scene="!!sceneAuthor.activeSceneId.value"
          :mode="annotationAuthor.mode.value"
          :pick-kind="annotationAuthor.pickKind.value"
          :can-update-scene="sceneActions.canUpdateScene.value"
          @add-callout="onAddCallout"
          @add-dimension="onAddDimension"
          @update-scene="sceneActions.updateActiveScene"
        />
        <SceneTimeline
          :scenes="scenesApi.scenes.value"
          :active-scene-id="sceneAuthor.activeSceneId.value"
          :busy="sceneAuthor.tween.value !== null"
          @select="sceneActions.selectScene"
          @reorder="(id, idx) => scenesApi.moveScene(id, idx)"
          @rename="(id, name) => scenesApi.updateScene(id, { name })"
          @remove="sceneActions.removeScene"
          @add="sceneActions.addScene"
        />
      </div>

      <!-- Bottom-right controls — desktop mouse legend (OnShape-style mapping) -->
      <div
        class="absolute bottom-4 right-4 z-10 hidden sm:flex flex-col items-end gap-2"
      >
        <MouseLegend variant="desktop" />
      </div>

      <!-- Bottom-right controls — mobile touch legend -->
      <div
        class="absolute bottom-4 right-4 z-10 flex sm:hidden flex-col items-end gap-2"
      >
        <MouseLegend variant="mobile" />
      </div>
    </div>
  </ClientOnly>
</template>
