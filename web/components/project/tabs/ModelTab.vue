<script lang="ts" setup>
import type { BoardLayoutLeftover } from 'cutlist';
import type { CameraMode } from '~/composables/useIdb';
import type { GizmoMode, ViewPreset } from '~/lib/viewer/types';
import type { ObjectGraph } from '~/utils/types';
import ViewCube from '~/components/viewer/ViewCube.vue';
import ObjectsPanel from '~/components/viewer/ObjectsPanel.vue';
import SceneTimeline from '~/components/viewer/SceneTimeline.vue';
import AnnotationLabels from '~/components/viewer/AnnotationLabels.vue';
import CalloutLabel from '~/components/viewer/CalloutLabel.vue';
import DimensionLabel from '~/components/viewer/DimensionLabel.vue';
import { useSceneAuthor } from '~/composables/useSceneAuthor';
import { useScenes } from '~/composables/useScenes';
import { useAnnotations } from '~/composables/useAnnotations';
import { useAnnotationAuthor } from '~/composables/useAnnotationAuthor';
import { AnnotationProjector } from '~/lib/viewer/modules/AnnotationProjector';
import {
  calloutKindHooks,
  createCalloutHandler,
} from '~/lib/viewer/annotations/callout';
import {
  createDimensionHandler,
  createDimensionKindHooks,
} from '~/lib/viewer/annotations/dimension';

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
const formatDistance = useFormatDistance();
const idb = useIdb();

const canvasContainer = ref<HTMLElement>();
const viewer = useThreeViewer(canvasContainer);

// Model switcher — always show exactly one model
const focusedModelIdx = ref(0);

watch(activeId, () => {
  focusedModelIdx.value = 0;
  rawSourceCache.clear();
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

// In-memory cache to avoid redundant IDB reads when switching models.
const rawSourceCache = new Map<string, object | string>();
const focusedRawData = ref<{
  modelId: string;
  raw: object | string;
  source: 'gltf' | 'collada';
} | null>(null);

async function loadRawData() {
  const model = focusedModel.value;
  if (!activeId.value || !model) {
    focusedRawData.value = null;
    return;
  }
  let raw = rawSourceCache.get(model.id);
  if (raw == null) {
    const fetched = await idb.getModelRawSource(model.id);
    if (fetched == null) {
      focusedRawData.value = null;
      return;
    }
    raw = fetched;
    rawSourceCache.set(model.id, raw);
  }
  focusedRawData.value = {
    modelId: model.id,
    raw,
    source: model.source as 'gltf' | 'collada',
  };
}

watch([activeId, focusedModelId], loadRawData, { immediate: true });

const loadedGraph = ref<ObjectGraph | null>(null);

async function loadFocusedModel() {
  const data = focusedRawData.value;
  if (!data || !viewer.ready.value) return;

  const { resolveModelScene } = await import('~/utils/resolveModelScene');

  viewer.clearModels();
  loadedGraph.value = null;

  const graph = await resolveModelScene({
    source: data.source,
    rawSource: data.raw,
  });
  if (graph) {
    await viewer.loadModel(graph);
    loadedGraph.value = graph;
    // After the viewer has the new model loaded, replay the remembered
    // active scene (if any) so the camera/visibility/offsets match the
    // marker the timeline is showing. `useSceneAuthor` has already
    // populated `activeSceneId` from the per-model memory map; we just
    // need to wait until both the model and its scenes are in memory
    // before applying. `jumpToScene` is a one-shot apply (no tween).
    const sid = sceneAuthor.activeSceneId.value;
    if (sid) {
      const scene = scenesApi.scenes.value.find((s) => s.id === sid);
      if (scene) sceneAuthor.jumpToScene(scene);
    }
  }
}

// Single watch on the combined predicate avoids a double-fire on initial
// mount (once when raw data lands, once when viewer becomes ready). The
// downstream `loadFocusedModel` is idempotent enough that an extra call
// would be harmless, but it would also re-clear the loaded graph and
// momentarily blank the panel UI — so we gate on both upstream signals.
watch(
  () => ({
    data: focusedRawData.value,
    ready: viewer.ready.value,
  }),
  ({ data, ready }) => {
    if (data && ready) void loadFocusedModel();
  },
);

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

const cameraMode = ref<CameraMode>('perspective');
const floorVisible = ref(true);
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
const annotationsApi = useAnnotations();
const annotationAuthor = useAnnotationAuthor(
  viewer,
  annotationsApi,
  sceneAuthor.activeSceneId,
);

const renderableSceneId = computed<string | null>(() => {
  if (sceneAuthor.tweening.value && sceneAuthor.tweenT.value < 0.5) {
    return sceneAuthor.tweenFromSceneId.value;
  }
  return sceneAuthor.activeSceneId.value;
});

const visibleAnnotations = computed(() => {
  const sid = renderableSceneId.value;
  if (!sid) return [];
  return annotationsApi.annotations.value.filter((a) => a.sceneId === sid);
});

const projectableAnnotations = computed(() => {
  const list = visibleAnnotations.value;
  const draft = annotationAuthor.preview.value;
  if (draft && draft.sceneId === renderableSceneId.value) {
    return [...list, draft];
  }
  return list;
});

const projector = new AnnotationProjector(
  viewer,
  () => projectableAnnotations.value,
);
projector.registerKind('callout', calloutKindHooks);
projector.registerKind('dimension', createDimensionKindHooks(viewer));

watch(
  () => viewer.ready.value,
  (isReady) => {
    if (!isReady) return;
    projector.start();
    annotationAuthor.registerHandler(
      'callout',
      createCalloutHandler({
        viewer,
        annotationsApi,
        activeSceneId: sceneAuthor.activeSceneId,
        author: annotationAuthor,
      }),
    );
    annotationAuthor.registerHandler(
      'dimension',
      createDimensionHandler({
        viewer,
        annotationsApi,
        activeSceneId: sceneAuthor.activeSceneId,
        author: annotationAuthor,
      }),
    );
  },
  { immediate: true },
);

onUnmounted(() => projector.dispose());

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
  if (!sceneAuthor.activeSceneId.value || sceneAuthor.tweening.value) return;
  annotationAuthor.enter('callout');
}

function onAddDimension() {
  if (!sceneAuthor.activeSceneId.value || sceneAuthor.tweening.value) return;
  annotationAuthor.enter('dimension');
}

const annotationKindComponents = {
  callout: CalloutLabel,
  dimension: DimensionLabel,
};

async function onAddScene() {
  if (sceneAuthor.tweening.value) return;
  const state = sceneAuthor.captureCurrentSceneState();
  const thumbnail = sceneAuthor.captureThumbnail() ?? undefined;
  const id = await scenesApi.addScene({ state, thumbnail });
  if (id) sceneAuthor.activeSceneId.value = id;
  sceneAuthor.dirty.value = false;
}

async function onSelectScene(id: string) {
  if (sceneAuthor.tweening.value) return;
  const scene = scenesApi.scenes.value.find((s) => s.id === id);
  if (!scene) return;
  await sceneAuthor.tweenToScene(scene);
}

async function onUpdateActiveScene() {
  const id = sceneAuthor.activeSceneId.value;
  if (!id) return;
  const state = sceneAuthor.captureCurrentSceneState();
  const thumbnail = sceneAuthor.captureThumbnail() ?? undefined;
  const { sceneStateToIdb } = await import('~/lib/scene');
  await scenesApi.updateScene(id, {
    ...sceneStateToIdb(state),
    thumbnailDataUrl: thumbnail,
  });
  sceneAuthor.markClean();
}

async function onRemoveScene(id: string) {
  if (sceneAuthor.activeSceneId.value === id) {
    sceneAuthor.activeSceneId.value = null;
    sceneAuthor.dirty.value = false;
  }
  await scenesApi.removeScene(id);
}

const canUpdateScene = computed(
  () =>
    sceneAuthor.dirty.value &&
    sceneAuthor.activeSceneId.value !== null &&
    !sceneAuthor.tweening.value,
);

watch(
  () => viewer.ready.value,
  (isReady) => {
    if (!isReady) return;
    cameraMode.value = viewer.getCameraMode();
    floorVisible.value = viewer.getFloorVisible();
  },
);

function onSnap(preset: ViewPreset) {
  viewer.applyViewPreset(preset);
}

function onCameraMode(mode: CameraMode) {
  cameraMode.value = mode;
  viewer.setCameraMode(mode);
  sceneAuthor.markDirty();
}

function onFloorVisible(v: boolean) {
  floorVisible.value = v;
  viewer.setFloorVisible(v);
  sceneAuthor.markDirty();
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
        v-if="hasModelData && !hasOnlyManualModels"
        :annotations="annotationsApi.annotations.value"
        :active-scene-id="sceneAuthor.activeSceneId.value"
        :tween-from-scene-id="sceneAuthor.tweenFromSceneId.value"
        :tween-t="sceneAuthor.tweenT.value"
        :tweening="sceneAuthor.tweening.value"
        :projector="projector"
        :draft-id="annotationAuthor.draftId.value"
        :preview="annotationAuthor.preview.value"
        :kind-components="annotationKindComponents"
        :on-leader-opacity-scale="(s) => viewer.setLeaderOpacityScale(s)"
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

      <!-- Empty state: no models -->
      <div
        v-if="enabledModels.length === 0"
        class="absolute inset-0 flex items-center justify-center"
      >
        <p class="bg-base border border-default rounded p-4 text-muted">
          Import a model in the BOM tab to view it in 3D.
        </p>
      </div>

      <!-- Empty state: only manual parts -->
      <div
        v-else-if="hasOnlyManualModels"
        class="absolute inset-0 flex items-center justify-center"
      >
        <p class="bg-base border border-default rounded p-4 text-muted">
          Parts were added manually — no 3D model to view.
        </p>
      </div>

      <!-- Empty state: models exist but no raw source stored (pre-feature import) -->
      <div
        v-else-if="!hasModelData"
        class="absolute inset-0 flex items-center justify-center"
      >
        <p class="bg-base border border-default rounded p-4 text-muted">
          Re-import your model to enable 3D preview.
        </p>
      </div>

      <!-- Model switcher (only when multiple enabled models) -->
      <div v-if="enabledModels.length > 1" class="absolute top-4 left-4 z-10">
        <select
          :value="focusedModelIdx === null ? '' : String(focusedModelIdx)"
          class="model-select bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2 text-sm text-body hover:text-hi cursor-pointer appearance-none pr-8 focus:outline-none focus:border-default"
          @change="
            (e) => {
              focusedModelIdx = Number((e.target as HTMLSelectElement).value);
            }
          "
        >
          <option
            v-for="(m, i) in enabledModels"
            :key="m.id"
            :value="String(i)"
            style="background: #161b1d; color: #e3e7e8"
          >
            {{ m.filename }}
          </option>
        </select>
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
        v-if="hasModelData && !hasOnlyManualModels && loadedGraph"
        class="absolute top-4 left-4 z-10"
        :class="enabledModels.length > 1 ? 'top-16' : 'top-4'"
      >
        <ObjectsPanel :graph="loadedGraph" :author="sceneAuthor" />
      </div>

      <!-- Gizmo mode toolbar (only when something is selected) -->
      <div
        v-if="hasModelData && !hasOnlyManualModels && hasSelection"
        class="absolute top-4 z-10"
        :class="props.showOpenButton ? 'right-[16.5rem]' : 'right-32'"
      >
        <div
          class="bg-overlay backdrop-blur border border-subtle rounded-lg p-1 flex gap-1"
        >
          <UButton
            size="xs"
            :color="gizmoMode === 'translate' ? 'primary' : 'neutral'"
            :variant="gizmoMode === 'translate' ? 'soft' : 'ghost'"
            icon="i-lucide-move"
            label="Move"
            @click="onGizmoMode('translate')"
          />
          <UButton
            size="xs"
            :color="gizmoMode === 'rotate' ? 'primary' : 'neutral'"
            :variant="gizmoMode === 'rotate' ? 'soft' : 'ghost'"
            icon="i-lucide-rotate-3d"
            label="Rotate"
            @click="onGizmoMode('rotate')"
          />
        </div>
      </div>

      <!-- View cube + projection / floor toggles -->
      <div
        v-if="hasModelData && !hasOnlyManualModels"
        class="absolute top-4 z-10"
        :class="props.showOpenButton ? 'right-44' : 'right-4'"
      >
        <ViewCube
          :camera-direction="viewer.cameraDirection.value"
          :camera-mode="cameraMode"
          :floor-visible="floorVisible"
          @snap="onSnap"
          @update:camera-mode="onCameraMode"
          @update:floor-visible="onFloorVisible"
        />
      </div>

      <!-- Part info panel -->
      <div
        v-if="infoPart"
        class="absolute bottom-4 left-4 z-10 bg-overlay backdrop-blur border border-subtle rounded-lg p-3 min-w-[200px]"
      >
        <p class="text-teal-400 font-bold text-lg mb-1">
          #{{ infoPart.partNumber }} {{ infoPart.name }}
        </p>
        <table class="text-sm text-body">
          <tbody>
            <tr>
              <td class="pr-3 text-muted">Width</td>
              <td>{{ formatDistance(infoPart.widthM) }}</td>
            </tr>
            <tr>
              <td class="pr-3 text-muted">Length</td>
              <td>{{ formatDistance(infoPart.lengthM) }}</td>
            </tr>
            <tr>
              <td class="pr-3 text-muted">Thickness</td>
              <td>
                {{ formatDistance(infoPart.thicknessM) }}
              </td>
            </tr>
            <tr>
              <td class="pr-3 text-muted">Material</td>
              <td>{{ infoPart.material }}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <!-- Scene timeline (bottom strip) -->
      <div
        v-if="hasModelData && !hasOnlyManualModels"
        class="absolute left-0 right-0 bottom-0 z-10"
      >
        <div class="flex justify-end gap-2 px-3 pb-2">
          <UButton
            v-if="sceneAuthor.activeSceneId.value"
            size="xs"
            :color="
              annotationAuthor.mode.value === 'pick' &&
              annotationAuthor.pickKind.value === 'callout'
                ? 'primary'
                : 'neutral'
            "
            :variant="
              annotationAuthor.mode.value === 'pick' &&
              annotationAuthor.pickKind.value === 'callout'
                ? 'solid'
                : 'soft'
            "
            icon="i-lucide-message-square-text"
            label="Callout"
            @click="onAddCallout"
          />
          <UButton
            v-if="sceneAuthor.activeSceneId.value"
            size="xs"
            :color="
              annotationAuthor.mode.value === 'pick' &&
              annotationAuthor.pickKind.value === 'dimension'
                ? 'primary'
                : 'neutral'
            "
            :variant="
              annotationAuthor.mode.value === 'pick' &&
              annotationAuthor.pickKind.value === 'dimension'
                ? 'solid'
                : 'soft'
            "
            icon="i-lucide-ruler"
            label="Dimension"
            @click="onAddDimension"
          />
          <UButton
            v-if="canUpdateScene"
            size="xs"
            color="primary"
            variant="solid"
            label="Update scene"
            @click="onUpdateActiveScene"
          />
        </div>
        <SceneTimeline
          :scenes="scenesApi.scenes.value"
          :active-scene-id="sceneAuthor.activeSceneId.value"
          :busy="sceneAuthor.tweening.value"
          @select="onSelectScene"
          @reorder="(id, idx) => scenesApi.moveScene(id, idx)"
          @rename="(id, name) => scenesApi.updateScene(id, { name })"
          @remove="onRemoveScene"
          @add="onAddScene"
        />
      </div>

      <!-- Bottom-right controls — desktop mouse legend (OnShape-style mapping) -->
      <div
        class="absolute bottom-4 right-4 z-10 hidden sm:flex flex-col items-end gap-2"
      >
        <div
          class="bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2.5 flex flex-col gap-2"
        >
          <!-- Right-drag → Orbit -->
          <div class="flex items-center gap-2.5">
            <svg
              width="18"
              height="24"
              viewBox="0 0 18 24"
              fill="none"
              class="shrink-0 text-muted"
            >
              <rect
                x="1"
                y="5"
                width="16"
                height="18"
                rx="8"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <path
                d="M17 13H9V5a8 8 0 0 1 8 8Z"
                fill="currentColor"
                fill-opacity="0.5"
              />
              <line
                x1="9"
                y1="5"
                x2="9"
                y2="13"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <rect
                x="7"
                y="8"
                width="4"
                height="5"
                rx="2"
                fill="currentColor"
                fill-opacity="0.3"
              />
            </svg>
            <span class="text-xs text-muted">Right-drag</span>
            <span class="text-xs text-body ml-auto pl-3">Orbit</span>
          </div>
          <!-- Middle-drag → Pan -->
          <div class="flex items-center gap-2.5">
            <svg
              width="18"
              height="24"
              viewBox="0 0 18 24"
              fill="none"
              class="shrink-0 text-muted"
            >
              <rect
                x="1"
                y="5"
                width="16"
                height="18"
                rx="8"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <line
                x1="9"
                y1="5"
                x2="9"
                y2="13"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <rect
                x="7"
                y="8"
                width="4"
                height="5"
                rx="2"
                fill="currentColor"
                fill-opacity="0.6"
              />
              <path
                d="M9 16v3M7 17l2 2 2-2"
                stroke="currentColor"
                stroke-width="1.25"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            <span class="text-xs text-muted">Mid-drag</span>
            <span class="text-xs text-body ml-auto pl-3">Pan</span>
          </div>
          <!-- Scroll → Zoom -->
          <div class="flex items-center gap-2.5">
            <svg
              width="18"
              height="24"
              viewBox="0 0 18 24"
              fill="none"
              class="shrink-0 text-muted"
            >
              <rect
                x="1"
                y="5"
                width="16"
                height="18"
                rx="8"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <line
                x1="9"
                y1="5"
                x2="9"
                y2="13"
                stroke="currentColor"
                stroke-width="1.25"
              />
              <rect
                x="7"
                y="8"
                width="4"
                height="5"
                rx="2"
                fill="currentColor"
              />
            </svg>
            <span class="text-xs text-muted">Scroll</span>
            <span class="text-xs text-body ml-auto pl-3">Zoom</span>
          </div>
        </div>
      </div>

      <!-- Bottom-right controls — mobile touch legend -->
      <div
        class="absolute bottom-4 right-4 z-10 flex sm:hidden flex-col items-end gap-2"
      >
        <div
          class="bg-overlay backdrop-blur border border-subtle rounded-lg px-3 py-2.5 flex flex-col gap-2"
        >
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-pointer" class="shrink-0 text-muted size-4" />
            <span class="text-xs text-muted">1 finger</span>
            <span class="text-xs text-body ml-auto pl-3">Orbit</span>
          </div>
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-move" class="shrink-0 text-muted size-4" />
            <span class="text-xs text-muted">2 fingers</span>
            <span class="text-xs text-body ml-auto pl-3">Pan</span>
          </div>
          <div class="flex items-center gap-2.5">
            <UIcon name="i-lucide-zoom-in" class="shrink-0 text-muted size-4" />
            <span class="text-xs text-muted">Pinch</span>
            <span class="text-xs text-body ml-auto pl-3">Zoom</span>
          </div>
        </div>
      </div>
    </div>
  </ClientOnly>
</template>

<style scoped>
.model-select {
  background-image: url("data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%239ca8ab' stroke-width='2'><path d='M6 9l6 6 6-6'/></svg>");
  background-repeat: no-repeat;
  background-position: right 10px center;
}
</style>
