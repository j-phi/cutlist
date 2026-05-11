/**
 * Editor-only NodeView around `@tiptap/extension-youtube` — gives the
 * iframe the same drag-handle / selection chrome as Image and Scene
 * blocks. `renderHTML` is inherited untouched, so marketplace
 * `generateHTML` output is unchanged.
 */

import Youtube from '@tiptap/extension-youtube';
import { VueNodeViewRenderer } from '@tiptap/vue-3';
import YoutubeBlockView from '~/components/editor/YoutubeBlockView.vue';

export const YoutubeBlock = Youtube.extend({
  addNodeView() {
    return VueNodeViewRenderer(YoutubeBlockView);
  },
});

export default YoutubeBlock;
