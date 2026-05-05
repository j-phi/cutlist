/**
 * Image block — a Tiptap atom node referencing an asset stored in IDB.
 *
 * Serialises to `<image-block data-asset-id="…" data-caption="…" />` so
 * referenced ids round-trip through the export/import pipeline.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import ImageBlockView from '~/components/editor/ImageBlockView.vue';

export const ImageBlock = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      assetId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-asset-id') ?? '',
        renderHTML: (attrs) => ({ 'data-asset-id': attrs.assetId }),
      },
      caption: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-caption') ?? '',
        renderHTML: (attrs) =>
          attrs.caption ? { 'data-caption': attrs.caption } : {},
      },
    };
  },

  parseHTML() {
    return [{ tag: 'image-block' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['image-block', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return VueNodeViewRenderer(ImageBlockView);
  },
});

export default ImageBlock;
