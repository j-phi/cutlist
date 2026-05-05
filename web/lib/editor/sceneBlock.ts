/**
 * Scene block — a Tiptap atom node referencing a saved viewer scene.
 *
 * Serialises to `<scene-block data-model-id="…" data-scene-id="…" data-caption="…" />`
 * so referenced ids round-trip through the export/import pipeline.
 */

import { Node, mergeAttributes } from '@tiptap/core';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import SceneBlockView from '~/components/editor/SceneBlockView.vue';

export const SceneBlock = Node.create({
  name: 'sceneBlock',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      modelId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-model-id') ?? '',
        renderHTML: (attrs) => ({ 'data-model-id': attrs.modelId }),
      },
      sceneId: {
        default: '',
        parseHTML: (element) => element.getAttribute('data-scene-id') ?? '',
        renderHTML: (attrs) => ({ 'data-scene-id': attrs.sceneId }),
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
    return [{ tag: 'scene-block' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['scene-block', mergeAttributes(HTMLAttributes)];
  },

  addNodeView() {
    return VueNodeViewRenderer(SceneBlockView);
  },
});

export default SceneBlock;
