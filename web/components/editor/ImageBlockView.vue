<script lang="ts" setup>
import type { NodeViewProps } from '@tiptap/vue-3';
import { NodeViewWrapper } from '@tiptap/vue-3';
import BlockDragHandle from '~/components/editor/BlockDragHandle.vue';
import EmbedCaption from '~/components/editor/EmbedCaption.vue';

const props = defineProps<NodeViewProps>();

const { uploadImageAsset, useAssetUrl } = useDocAssets();
const { activeProject } = useProjects();

const assetId = computed(() => props.node.attrs.assetId as string);
const caption = computed(() => props.node.attrs.caption as string);

const url = useAssetUrl(assetId);

const fileInput = ref<HTMLInputElement>();
const uploading = ref(false);
const uploadError = ref<string | null>(null);

async function onFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  const projectId = activeProject.value?.id;
  if (!projectId) {
    uploadError.value = 'No project active.';
    return;
  }
  uploading.value = true;
  uploadError.value = null;
  try {
    const asset = await uploadImageAsset(file, projectId);
    props.updateAttributes({ assetId: asset.id });
  } catch (err) {
    uploadError.value = err instanceof Error ? err.message : 'Upload failed.';
  } finally {
    uploading.value = false;
  }
}
</script>

<template>
  <NodeViewWrapper class="doc-embed group/embed block my-6 relative">
    <BlockDragHandle />

    <figure class="space-y-2" contenteditable="false">
      <div
        class="relative bg-default border rounded-lg overflow-hidden transition-shadow"
        :class="[
          url ? '' : 'aspect-[16/9] flex items-center justify-center',
          selected
            ? 'border-teal-400 ring-2 ring-teal-400/60'
            : 'border-subtle',
        ]"
      >
        <img v-if="url" :src="url" :alt="caption" class="w-full h-auto block" />
        <button
          v-else
          type="button"
          class="absolute inset-0 flex flex-col items-center justify-center gap-2 text-dim hover:text-body p-6 text-center transition-colors"
          :disabled="uploading"
          @click="fileInput?.click()"
        >
          <UIcon
            v-if="uploading"
            name="i-lucide-loader-circle"
            class="w-8 h-8 animate-spin"
          />
          <UIcon v-else name="i-lucide-image-plus" class="w-8 h-8" />
          <span class="text-sm">{{
            uploading ? 'Compressing…' : 'Add an image'
          }}</span>
        </button>

        <button
          v-if="url"
          type="button"
          class="absolute top-2 right-2 px-3 py-1.5 text-xs font-medium rounded-md bg-overlay backdrop-blur border border-subtle text-body hover:bg-elevated disabled:opacity-50 opacity-0 group-hover/embed:opacity-100 focus-visible:opacity-100 transition-opacity"
          :disabled="uploading"
          @click="fileInput?.click()"
        >
          {{ uploading ? 'Compressing…' : 'Replace' }}
        </button>

        <input
          ref="fileInput"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          class="hidden"
          @change="onFile"
        />
      </div>

      <p v-if="uploadError" class="text-xs text-red-400">{{ uploadError }}</p>

      <EmbedCaption
        :model-value="caption"
        @update:model-value="
          (value) => props.updateAttributes({ caption: value })
        "
      />
    </figure>
  </NodeViewWrapper>
</template>
