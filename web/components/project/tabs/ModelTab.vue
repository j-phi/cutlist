<script lang="ts" setup>
import type { BoardLayoutLeftover } from 'cutlist';
import type { CameraMode } from '~/composables/useIdb';
import type { ViewPreset } from '~/lib/viewer/types';
import type {
  GroupId,
  ObjectGraph,
  ObjectNode,
  PartNumber,
} from '~/utils/types';
import ViewCube from '~/components/viewer/ViewCube.vue';
import ObjectsPanel from '~/components/viewer/ObjectsPanel.vue';
import { useSceneAuthor } from '~/composables/useSceneAuthor';
import { computePartNumberOffsets } from '~/utils/partNumberOffsets';

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
});

const displayModels = computed(() => {
  const idx = Math.min(focusedModelIdx.value, enabledModels.value.length - 1);
  const m = enabledModels.value[idx];
  return m ? [m] : [];
});

const hasModelData = computed(() => enabledModels.value.length > 0);

const hasOnlyManualModels = computed(
  () =>
    allEnabledModels.value.length > 0 &&
    allEnabledModels.value.every((m) => m.source === 'manual'),
);

// In-memory cache to avoid redundant IDB reads when switching models.
const rawSourceCache = new Map<string, object | string>();
const allRawData = ref<Map<
  string,
  { raw: object | string; source: 'gltf' | 'collada' }
> | null>(null);

async function loadRawData() {
  if (!activeId.value || displayModels.value.length === 0) {
    allRawData.value = null;
    return;
  }
  const entries = await Promise.all(
    displayModels.value.map(async (m) => {
      let raw = rawSourceCache.get(m.id);
      if (raw == null) {
        const fetched = await idb.getModelRawSource(m.id);
        if (fetched != null) {
          raw = fetched;
          rawSourceCache.set(m.id, raw);
        }
      }
      return raw != null
        ? ([m.id, { raw, source: m.source as 'gltf' | 'collada' }] as const)
        : null;
    }),
  );
  allRawData.value = new Map(
    entries.filter((e): e is NonNullable<typeof e> => e != null),
  );
}

watch(
  [activeId, () => displayModels.value.map((m) => m.id).join(',')],
  loadRawData,
  { immediate: true },
);

const loadedGraph = ref<ObjectGraph | null>(null);

function shiftGraph(graph: ObjectGraph, offset: number): ObjectGraph {
  if (offset === 0) return graph;
  const objects: ObjectNode[] = graph.objects.map((o) => ({
    ...o,
    groupId: o.groupId + offset,
    partNumber: o.partNumber + offset,
  }));
  const partIndex = new Map<PartNumber, ObjectNode[]>();
  for (const o of objects) {
    const list = partIndex.get(o.partNumber);
    if (list) list.push(o);
    else partIndex.set(o.partNumber, [o]);
  }
  const objectIndex = new Map<GroupId, ObjectNode>();
  for (const o of objects) objectIndex.set(o.groupId, o);
  const parts = graph.parts.map((p) => ({
    ...p,
    partNumber: p.partNumber + offset,
  }));
  return {
    ...graph,
    parts,
    objects,
    objectIndex,
    partIndex,
  };
}

async function loadAllModels() {
  const data = allRawData.value;
  if (!data || !viewer.ready.value) return;

  const { resolveModelScene } = await import('~/utils/resolveModelScene');

  viewer.clearModels();
  loadedGraph.value = null;

  // Use offsets from ALL enabled models so part numbers stay consistent with BOM
  const allOffsets = computePartNumberOffsets(enabledModels.value);
  const models = displayModels.value;

  for (const model of models) {
    const modelIdx = enabledModels.value.findIndex((m) => m.id === model.id);
    const offset = modelIdx >= 0 ? allOffsets[modelIdx] : 0;
    const entry = data.get(model.id);
    if (entry) {
      const graph = await resolveModelScene({
        source: entry.source,
        rawSource: entry.raw,
      });
      if (graph) {
        await viewer.loadModel(graph, offset);
        loadedGraph.value = shiftGraph(graph, offset);
      }
    }
  }
}

watch(allRawData, loadAllModels);
watch(
  () => viewer.ready.value,
  (isReady) => {
    if (isReady) loadAllModels();
  },
);

function findPart(partNum: number | null): BoardLayoutLeftover | undefined {
  if (partNum == null || !boardLayouts.value) return;
  return [
    ...boardLayouts.value.layouts.flatMap((l) => l.placements),
    ...boardLayouts.value.leftovers,
  ].find((p) => p.partNumber === partNum);
}

const infoPart = computed(
  () =>
    findPart(store.selectedPartNumber.value) ??
    findPart(store.hoveredPartNumber.value),
);

const cameraMode = ref<CameraMode>('perspective');
const floorVisible = ref(true);

const sceneAuthor = useSceneAuthor({
  setObjectVisible: (id, visible) => viewer.setObjectVisible(id, visible),
  setAllObjectsVisible: (visible) => viewer.setAllObjectsVisible(visible),
  resetAllOffsets: () => viewer.resetAllOffsets(),
  getObjectIds: () => loadedGraph.value?.objects.map((o) => o.groupId) ?? [],
});

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
}

function onFloorVisible(v: boolean) {
  floorVisible.value = v;
  viewer.setFloorVisible(v);
}
</script>

<template>
  <ClientOnly>
    <div class="relative h-full overflow-hidden">
      <!-- 3D Canvas -->
      <div ref="canvasContainer" class="absolute inset-0 bg-mist-950" />

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
