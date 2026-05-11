<script lang="ts" setup>
import type { NodeViewProps } from '@tiptap/vue-3';
import { NodeViewWrapper } from '@tiptap/vue-3';
import { getEmbedUrlFromYoutubeUrl } from '@tiptap/extension-youtube';
import BlockDragHandle from '~/components/editor/BlockDragHandle.vue';

const props = defineProps<NodeViewProps>();

const embedUrl = computed(() =>
  getEmbedUrlFromYoutubeUrl({
    url: props.node.attrs.src as string,
    nocookie: true,
    modestBranding: true,
    startAt: Number(props.node.attrs.start) || 0,
  }),
);
</script>

<template>
  <NodeViewWrapper class="doc-embed group/embed block my-6 relative">
    <BlockDragHandle />

    <div
      class="relative w-full aspect-video bg-default border rounded-lg overflow-hidden transition-shadow"
      :class="
        selected ? 'border-teal-400 ring-2 ring-teal-400/60' : 'border-subtle'
      "
      contenteditable="false"
    >
      <iframe
        v-if="embedUrl"
        :src="embedUrl"
        class="absolute inset-0 w-full h-full"
        frameborder="0"
        allow="
          accelerometer;
          clipboard-write;
          encrypted-media;
          gyroscope;
          picture-in-picture;
          web-share;
        "
        allowfullscreen
      />
    </div>
  </NodeViewWrapper>
</template>
