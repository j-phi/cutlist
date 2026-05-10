<script lang="ts" setup>
import type { BoardLayoutLeftover } from 'cutlist';
import type { GizmoMode, ViewPreset } from '~/lib/viewer/types';
import ViewCube from '~/components/viewer/ViewCube.vue';
import CameraMenu from '~/components/viewer/CameraMenu.vue';
import ObjectsPanel from '~/components/viewer/ObjectsPanel.vue';
import SceneTimeline from '~/components/viewer/SceneTimeline.vue';
import AnnotationLabels from '~/components/viewer/AnnotationLabels.vue';
import CalloutLabel from '~/components/viewer/CalloutLabel.vue';
import DimensionLabel from '~/components/viewer/DimensionLabel.vue';
import ModelEmptyState from '~/components/viewer/ModelEmptyState.vue';
import ModelSwitcher from '~/components/viewer/ModelSwitcher.vue';
import AnnotationToolbar from '~/components/viewer/AnnotationToolbar.vue';
import ViewerControlsHelp from '~/components/viewer/ViewerControlsHelp.vue';
import ViewerSidePanel from '~/components/viewer/ViewerSidePanel.vue';
import { useSceneAuthor } from '~/composables/useSceneAuthor';
import { useScenes } from '~/composables/useScenes';
import { useAnnotations } from '~/composables/useAnnotations';
import { useAnnotationAuthor } from '~/composables/useAnnotationAuthor';
import { useAnnotationProjector } from '~/composables/useAnnotationProjector';
import { useFocusedModelLoader } from '~/composables/useFocusedModelLoader';
import { defaultSceneIdForModel } from '~/utils/defaultScene';
import { sceneStateToIdb } from '~/lib/scene';

const props = withDefaults(
  defineProps<{
    readOnly?: boolean;
    defaultScenePreview?: boolean;
    /**
     * Pin the focused model to a specific id, ignoring the project's
     * default focus. Used by build-step scene embeds, which point at a
     * known (modelId, sceneId) pair rather than whatever model the user
     * last looked at in the Model tab.
     */
    targetModelId?: string | null;
    /**
     * Force a specific scene to load when the focused model is ready.
     * When set, this takes precedence over `defaultScenePreview` and
     * over the per-model active-scene memory.
     */
    targetSceneId?: string | null;
  }>(),
  {
    readOnly: false,
    defaultScenePreview: false,
    targetModelId: null,
    targetSceneId: null,
  },
);

const { activeId, enabledModels: allEnabledModels } = useProjects();
const enabledModels = computed(() =>
  allEnabledModels.value.filter((m) => m.source !== 'manual'),
);
const { data: boardLayouts } = useBoardLayoutsQuery();
const store = useModelViewerStore();

const canvasContainer = ref<HTMLElement>();
const viewer = useThreeViewer(canvasContainer);
watchEffect(() => {
  void viewer.ready.value;
  viewer.setGizmoEnabled(!props.readOnly);
});

// Index of the model the viewer is currently rendering. Always exactly one
// model is mounted at a time; the dropdown switches between them.
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

const focusedModelId = computed<string | null>(() => {
  if (props.targetModelId) return props.targetModelId;
  return focusedModel.value?.id ?? null;
});

const hasOnlyManualModels = computed(
  () =>
    allEnabledModels.value.length > 0 &&
    allEnabledModels.value.every((m) => m.source === 'manual'),
);

// `manual-only` and `no-models` are mutually exclusive and together cover
// every state where `enabledModels` is empty, so we don't need a third
// branch for that.
const emptyStateType = computed<
  'no-models' | 'manual-only' | 'no-source' | null
>(() => {
  if (hasOnlyManualModels.value) return 'manual-only';
  if (allEnabledModels.value.length === 0) return 'no-models';
  if (focusedModelId.value && loadState.value === 'missing-source')
    return 'no-source';
  return null;
});

function findPart(partNum: number | null): BoardLayoutLeftover | undefined {
  if (partNum == null || !boardLayouts.value) return;
  const all: BoardLayoutLeftover[] = [
    ...boardLayouts.value.layouts.flatMap((l) => l.placements),
    ...boardLayouts.value.linearLayouts.flatMap((l) => l.placements),
    ...boardLayouts.value.leftovers,
  ];
  return all.find((p) => p.partNumber === partNum);
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

// Mobile-only Objects drawer — desktop renders the sidebar inline.
const objectsOpen = ref(false);

const objectsCollapsed = ref(false);
const scenesCollapsed = ref(false);

function onGizmoMode(mode: GizmoMode) {
  gizmoMode.value = mode;
  viewer.setGizmoMode(mode);
}

// Scenes are model-scoped. The focused model id drives both the timeline
// (`useScenes`) and the per-model active-scene memory inside `useSceneAuthor`.
const readOnly = computed(() => props.readOnly);
const sceneAuthor = useSceneAuthor(viewer, focusedModelId, { readOnly });
const scenesApi = useScenes(focusedModelId);
const targetSceneId = computed(() => {
  if (props.targetSceneId) return props.targetSceneId;
  if (props.defaultScenePreview && focusedModelId.value) {
    return defaultSceneIdForModel(focusedModelId.value);
  }
  return null;
});
const { loadedGraph, loadState } = useFocusedModelLoader({
  viewer,
  focusedModelId,
  sceneAuthor,
  scenesApi,
  targetSceneId,
});
const canShowViewerControls = computed(() => !emptyStateType.value);
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
  if (props.readOnly) return;
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

const canUpdateScene = computed(
  () =>
    sceneAuthor.dirty.value &&
    sceneAuthor.activeSceneId.value !== null &&
    sceneAuthor.tween.value === null,
);

async function addScene(): Promise<void> {
  if (sceneAuthor.tween.value !== null) return;
  const state = sceneAuthor.captureCurrentSceneState();
  const thumbnail = sceneAuthor.captureThumbnail() ?? undefined;
  const id = await scenesApi.addScene({ state, thumbnail });
  if (id) sceneAuthor.activeSceneId.value = id;
  sceneAuthor.dirty.value = false;
}

async function selectScene(id: string): Promise<void> {
  if (sceneAuthor.tween.value !== null) return;
  const scene = scenesApi.scenes.value.find((s) => s.id === id);
  if (!scene) return;
  await sceneAuthor.tweenToScene(scene);
}

async function updateActiveScene(): Promise<void> {
  const id = sceneAuthor.activeSceneId.value;
  if (!id) return;
  const state = sceneAuthor.captureCurrentSceneState();
  const thumbnail = sceneAuthor.captureThumbnail() ?? undefined;
  await scenesApi.updateScene(id, {
    ...sceneStateToIdb(state),
    thumbnailDataUrl: thumbnail,
  });
  sceneAuthor.markClean();
}

async function removeScene(id: string): Promise<void> {
  if (scenesApi.isDefaultScene(id)) return;
  if (sceneAuthor.activeSceneId.value === id) {
    sceneAuthor.activeSceneId.value = null;
    sceneAuthor.dirty.value = false;
  }
  await scenesApi.removeScene(id);
}

function onSnap(preset: ViewPreset) {
  viewer.applyViewPreset(preset);
}

// Initial targetSceneId application is handled inside `useFocusedModelLoader`
// as part of the candidate-id chain. This watch covers the after-load case:
// the focused model changes (so targetSceneId recomputes) without re-firing
// the loader, or scenes finish hydrating after the initial jump.
watch(
  [targetSceneId, () => scenesApi.scenes.value, loadState],
  ([sid]) => {
    if (!sid || loadState.value !== 'loaded') return;
    if (sceneAuthor.activeSceneId.value === sid) return;
    const scene = scenesApi.scenes.value.find((s) => s.id === sid);
    if (scene) sceneAuthor.jumpToScene(scene);
  },
  { flush: 'post' },
);
</script>

<template>
  <ClientOnly>
    <!-- CSS Grid layout — `grid-cols-[auto_1fr]` (sidebar | canvas),
         `grid-rows-[1fr_auto_auto]` (canvas-row | scenes | status). Grid
         `1fr` tracks have a hard upper bound: tall content can't push
         them, so the sidebar always has a deterministic height to scroll
         within. Flex couldn't enforce this — items taller than the cross
         axis pushed the row regardless of `min-h-0` / `align-self`. -->
    <div
      class="absolute inset-0 grid overflow-hidden grid-cols-[auto_1fr] grid-rows-[1fr_auto_auto]"
    >
      <ViewerSidePanel
        v-if="!props.readOnly && canShowViewerControls && loadedGraph"
        title="Objects"
        class="hidden sm:flex"
        :collapsed="objectsCollapsed"
        @update:collapsed="(v) => (objectsCollapsed = v)"
      >
        <ObjectsPanel
          :graph="loadedGraph"
          :author="sceneAuthor"
          :parts="focusedModel?.parts ?? null"
        />
      </ViewerSidePanel>

      <!-- Canvas region. `min-w-0 min-h-0` are mandatory on grid items
           whose content may overflow — grid items default to `min-*: auto`
           and otherwise leak past the track. `col-start-2` pins the region
           to the `1fr` track so it still fills the row when the sidebar
           column (auto) collapses in read-only mode. -->
      <div class="relative col-start-2 min-w-0 min-h-0 overflow-hidden">
        <div ref="canvasContainer" class="absolute inset-0 bg-mist-950" />

        <!-- Marquee multi-select rect. AutoCAD/OnShape convention:
             solid border = window (drag L→R, fully contain),
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

        <ModelEmptyState v-if="emptyStateType" :type="emptyStateType" />

        <!-- Top-center: Annotation toolbar. `pointer-events-none` during
             pick mode keeps canvas pointermove flowing — without it the
             dimension offset preview freezes between clicks. -->
        <div
          v-if="!props.readOnly && canShowViewerControls"
          class="absolute top-4 left-1/2 -translate-x-1/2 z-20"
          :class="{
            'pointer-events-none': annotationAuthor.mode.value === 'pick',
          }"
        >
          <AnnotationToolbar
            :has-active-scene="!!sceneAuthor.activeSceneId.value"
            :mode="annotationAuthor.mode.value"
            :pick-kind="annotationAuthor.pickKind.value"
            :pick-hint="annotationAuthor.hint.value"
            :has-selection="hasSelection"
            :gizmo-mode="gizmoMode"
            @add-callout="onAddCallout"
            @add-dimension="onAddDimension"
            @update:gizmo-mode="onGizmoMode"
          />
        </div>

        <!-- Top-right: orientation cube + camera options dropdown. -->
        <div
          v-if="canShowViewerControls"
          class="absolute top-4 right-4 z-10 flex items-start gap-2"
        >
          <CameraMenu
            :camera-mode="sceneAuthor.cameraMode.value"
            :floor-visible="sceneAuthor.floorVisible.value"
            @update:camera-mode="(m) => sceneAuthor.setCameraMode(m)"
            @update:floor-visible="(v) => sceneAuthor.setFloorVisible(v)"
          />
          <UButton
            size="sm"
            variant="soft"
            color="neutral"
            icon="i-lucide-maximize"
            :ui="{ base: 'rounded-lg' }"
            title="Fit to model"
            @click="sceneAuthor.fitToModel()"
          />
          <ViewCube
            :camera-direction="viewer.cameraDirection.value"
            @snap="onSnap"
          />
        </div>

        <div
          v-if="!props.readOnly && enabledModels.length > 1"
          class="absolute top-4 left-4 z-20"
        >
          <ModelSwitcher
            :models="enabledModels"
            :focused-idx="focusedModelIdx"
            @update:focused-idx="(idx) => (focusedModelIdx = idx)"
          />
        </div>

        <!-- Mobile Objects trigger — opens the drawer below. Desktop uses
             the inline ViewerSidePanel above. -->
        <div
          v-if="!props.readOnly && canShowViewerControls && loadedGraph"
          class="absolute left-4 z-10 sm:hidden"
          :class="enabledModels.length > 1 ? 'top-16' : 'top-4'"
        >
          <UButton
            size="xs"
            icon="i-lucide-layers"
            variant="soft"
            color="neutral"
            label="Objects"
            @click="objectsOpen = true"
          />
        </div>

        <!-- Bottom-right: input-controls help. `?` icon opens a popover
             with the appropriate legend (mouse vs touch via media query). -->
        <div
          v-if="canShowViewerControls"
          class="absolute bottom-4 right-4 z-10"
        >
          <ViewerControlsHelp />
        </div>

        <UDrawer
          v-if="!props.readOnly && loadedGraph"
          v-model:open="objectsOpen"
          :ui="{ content: 'sm:hidden h-[75vh]' }"
        >
          <template #content>
            <div class="h-full p-2">
              <ObjectsPanel
                :graph="loadedGraph"
                :author="sceneAuthor"
                :parts="focusedModel?.parts ?? null"
              />
            </div>
          </template>
        </UDrawer>
      </div>

      <SceneTimeline
        v-if="!props.readOnly && canShowViewerControls"
        class="col-span-full"
        :scenes="scenesApi.scenes.value"
        :active-scene-id="sceneAuthor.activeSceneId.value"
        :busy="sceneAuthor.tween.value !== null"
        :pinned-ids="scenesApi.pinnedSceneIds.value"
        :collapsed="scenesCollapsed"
        :can-update-active="canUpdateScene"
        @update:collapsed="(v) => (scenesCollapsed = v)"
        @select="selectScene"
        @reorder="(id, idx) => scenesApi.moveScene(id, idx)"
        @rename="(id, name) => scenesApi.updateScene(id, { name })"
        @remove="removeScene"
        @add="addScene"
        @update-active="updateActiveScene"
      />

      <!-- Bottom status bar: part readout or idle hint. -->
      <div
        v-if="canShowViewerControls"
        class="col-span-full bg-overlay backdrop-blur border-t border-subtle px-3 py-1.5 flex items-center gap-3 text-xs min-h-[32px]"
      >
        <div
          v-if="infoPart"
          class="text-xs text-hi flex items-baseline gap-2 whitespace-nowrap"
        >
          <span class="text-teal-400 font-semibold">
            #{{ infoPart.partNumber }} {{ infoPart.name }}
          </span>
          <span class="text-muted">
            {{ useFormatDistance()(infoPart.lengthM) }}
            ×
            {{ useFormatDistance()(infoPart.widthM) }}
            ×
            {{ useFormatDistance()(infoPart.thicknessM) }}
          </span>
        </div>
        <span v-else class="text-dim italic">
          Hover or select a part to view its dimensions.
        </span>
      </div>
    </div>
  </ClientOnly>
</template>
