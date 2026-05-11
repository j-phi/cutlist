/**
 * Render-only Tiptap extensions for the plans marketplace detail page.
 * Used with `generateHTML` (no editor mount) against a doc whose embed
 * nodes already carry a `resolvedUrl` attr — see `injectResolvedRefs`.
 *
 * Mirrors `BuildDocEditor`'s `StarterKit.configure(...)` so any node an
 * author can produce renders here too. Drift = nodes in storage that
 * silently render as the empty string.
 */

import { Node } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import Typography from '@tiptap/extension-typography';
import Youtube from '@tiptap/extension-youtube';

const configuredStarterKit = StarterKit.configure({
  codeBlock: false,
  blockquote: false,
  horizontalRule: false,
  link: { openOnClick: false },
});

const ImageBlockRender = Node.create({
  name: 'imageBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      assetId: { default: '' },
      caption: { default: '' },
      resolvedUrl: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'image-block' }];
  },
  renderHTML({ node }) {
    const caption = (node.attrs.caption as string) || '';
    const content: Array<unknown> = [
      ['img', { src: node.attrs.resolvedUrl, alt: caption, loading: 'lazy' }],
    ];
    if (caption) {
      content.push(['figcaption', { class: 'plan-doc__caption' }, caption]);
    }
    return ['figure', { class: 'plan-doc__figure' }, ...content];
  },
});

const SceneBlockRender = Node.create({
  name: 'sceneBlock',
  group: 'block',
  atom: true,
  addAttributes() {
    return {
      modelId: { default: '' },
      sceneId: { default: '' },
      caption: { default: '' },
      resolvedUrl: { default: '' },
    };
  },
  parseHTML() {
    return [{ tag: 'scene-block' }];
  },
  renderHTML({ node }) {
    const caption = (node.attrs.caption as string) || '';
    const content: Array<unknown> = [
      [
        'img',
        {
          src: node.attrs.resolvedUrl,
          alt: caption || 'Scene snapshot',
          loading: 'lazy',
        },
      ],
    ];
    if (caption) {
      content.push(['figcaption', { class: 'plan-doc__caption' }, caption]);
    }
    return ['figure', { class: 'plan-doc__figure' }, ...content];
  },
});

export const marketplaceExtensions = [
  configuredStarterKit,
  Typography,
  ImageBlockRender,
  SceneBlockRender,
  Youtube.configure({ nocookie: true, modestBranding: true }),
];
