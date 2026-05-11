<script lang="ts" setup>
import type { NodeViewProps } from '@tiptap/vue-3';
import { NodeViewWrapper } from '@tiptap/vue-3';
import type { IdbScene } from '~/composables/useIdb';
import SceneViewer from '~/components/editor/SceneViewer.vue';
import BlockDragHandle from '~/components/editor/BlockDragHandle.vue';
import EmbedCaption from '~/components/editor/EmbedCaption.vue';
import { useEditable } from '~/lib/editor/useEditable';

const props = defineProps<NodeViewProps>();

const idb = useIdb();
const { activeProject } = useProjects();
const editable = useEditable();

const modelId = computed(() => props.node.attrs.modelId as string);
const sceneId = computed(() => props.node.attrs.sceneId as string);
const caption = computed(() => props.node.attrs.caption as string);
const hasSceneRef = computed(() => !!modelId.value && !!sceneId.value);

// ─── Scene picker source ──────────────────────────────────────────────────
//
// Manual models have no viewer-renderable geometry, so they're filtered
// out of the picker. Scenes for the remaining models are loaded once per
// project and then grouped by model id so the optgroup renderer doesn't
// have to filter inside its v-for.

const eligibleModels = computed(() =>
  (activeProject.value?.models ?? []).filter((m) => m.source !== 'manual'),
);

// Loads scenes for every eligible model (picker options) plus this embed's
// own modelId — the embed's modelId can land before `activeProject` rehydrates
// after import, so without the explicit add the thumbnail computed below would
// miss its scene. Generation counter prevents stale async results from
// clobbering newer ones when inputs change mid-flight.
const scenesByModelId = ref<Map<string, IdbScene[]>>(new Map());
let loadGen = 0;

watch(
  [eligibleModels, modelId],
  async ([models, embedModelId]) => {
    const gen = ++loadGen;
    const ids = new Set(models.map((m) => m.id));
    if (embedModelId) ids.add(embedModelId);
    const entries = await Promise.all(
      [...ids].map(
        async (id) => [id, await idb.getScenesForModel(id)] as const,
      ),
    );
    if (gen !== loadGen) return;
    scenesByModelId.value = new Map(entries);
  },
  { immediate: true },
);

const thumbnail = computed(() => {
  const scenes = scenesByModelId.value.get(modelId.value);
  return scenes?.find((s) => s.id === sceneId.value)?.thumbnailDataUrl;
});

// ─── Picker change handler ────────────────────────────────────────────────
//
// `<option value="">` clears; otherwise the value is `"<modelId>::<sceneId>"`
// — a small composite string keeps the markup as a single native select.

const SEPARATOR = '::';

const pickerValue = computed(() =>
  hasSceneRef.value ? `${modelId.value}${SEPARATOR}${sceneId.value}` : '',
);

function onPick(e: Event) {
  const value = (e.target as HTMLSelectElement).value;
  if (!value) {
    props.updateAttributes({ modelId: '', sceneId: '' });
    return;
  }
  const [m, s] = value.split(SEPARATOR);
  props.updateAttributes({ modelId: m, sceneId: s });
}

// ─── Live viewer activation ───────────────────────────────────────────────

const active = ref(false);
</script>

<template>
  <NodeViewWrapper class="doc-embed group/embed block my-6 relative">
    <BlockDragHandle />

    <figure class="space-y-2" contenteditable="false">
      <div
        class="relative bg-default border rounded-lg overflow-hidden transition-shadow"
        :class="[
          active ? 'aspect-[4/3]' : 'aspect-[16/9]',
          selected
            ? 'border-teal-400 ring-2 ring-teal-400/60'
            : 'border-subtle',
        ]"
      >
        <SceneViewer
          v-if="active && hasSceneRef"
          :model-id="modelId"
          :scene-id="sceneId"
        />
        <template v-else>
          <img
            v-if="thumbnail"
            :src="thumbnail"
            :alt="caption || 'Scene preview'"
            class="absolute inset-0 w-full h-full object-cover"
          />
          <div
            v-else
            class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-dim text-center"
          >
            <UIcon name="i-lucide-box" class="w-8 h-8" />
            <p class="text-sm">No scene selected</p>
          </div>
          <button
            v-if="hasSceneRef"
            type="button"
            class="absolute bottom-2 right-2 px-4 py-2 rounded-full bg-overlay backdrop-blur border border-subtle text-sm font-medium text-body hover:bg-elevated flex items-center gap-2 focus:outline-none focus:border-teal-500/50"
            @click="active = true"
          >
            <UIcon name="i-lucide-play" class="w-4 h-4" />
            View in 3D
          </button>
        </template>

        <!-- Scene picker: hover-revealed top-left overlay so it doesn't
             sit over the content at rest. Edit-mode only. -->
        <select
          v-if="editable"
          :value="pickerValue"
          class="absolute top-2 left-2 z-20 max-w-[60%] px-2 py-1 bg-overlay backdrop-blur border border-subtle rounded-md text-xs text-body focus:outline-none focus:border-teal-500/50 opacity-0 group-hover/embed:opacity-100 focus:opacity-100 transition-opacity"
          @change="onPick"
        >
          <option value="">— Pick a scene —</option>
          <optgroup v-for="m in eligibleModels" :key="m.id" :label="m.filename">
            <option
              v-for="scene in scenesByModelId.get(m.id) ?? []"
              :key="scene.id"
              :value="`${m.id}${SEPARATOR}${scene.id}`"
            >
              {{ scene.name }}
            </option>
          </optgroup>
        </select>

        <button
          v-if="active"
          type="button"
          class="absolute top-2 right-2 px-3 py-1.5 text-xs font-medium rounded-md bg-overlay backdrop-blur border border-subtle text-body hover:bg-elevated z-20"
          @click="active = false"
        >
          Collapse
        </button>
      </div>

      <EmbedCaption
        :model-value="caption"
        @update:model-value="
          (value) => props.updateAttributes({ caption: value })
        "
      />
    </figure>
  </NodeViewWrapper>
</template>
