import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { injectResolvedRefs } from '../injectResolvedRefs';

const maps = {
  assetUrls: new Map([['asset-1', '/plans/_build/p/assets/asset-1.png']]),
  sceneUrls: new Map([['scene-1', '/plans/_build/p/scenes/scene-1.png']]),
};

describe('injectResolvedRefs', () => {
  it('sets resolvedUrl on imageBlock nodes', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'imageBlock', attrs: { assetId: 'asset-1', caption: 'cap' } },
      ],
    };
    const out = injectResolvedRefs(doc, maps);
    expect(out.content?.[0].attrs).toEqual({
      assetId: 'asset-1',
      caption: 'cap',
      resolvedUrl: '/plans/_build/p/assets/asset-1.png',
    });
  });

  it('sets resolvedUrl on sceneBlock nodes', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'sceneBlock',
          attrs: { modelId: 'm', sceneId: 'scene-1', caption: '' },
        },
      ],
    };
    const out = injectResolvedRefs(doc, maps);
    expect(out.content?.[0].attrs?.resolvedUrl).toBe(
      '/plans/_build/p/scenes/scene-1.png',
    );
  });

  it('leaves resolvedUrl empty when the ref is missing', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [{ type: 'imageBlock', attrs: { assetId: 'missing' } }],
    };
    const out = injectResolvedRefs(doc, maps);
    expect(out.content?.[0].attrs?.resolvedUrl).toBe('');
  });

  it('recurses through nested content', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'blockquote',
          content: [{ type: 'imageBlock', attrs: { assetId: 'asset-1' } }],
        },
      ],
    };
    const out = injectResolvedRefs(doc, maps);
    expect(out.content?.[0].content?.[0].attrs?.resolvedUrl).toBe(
      '/plans/_build/p/assets/asset-1.png',
    );
  });

  it('leaves non-embed nodes alone', () => {
    const doc: JSONContent = {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      ],
    };
    const out = injectResolvedRefs(doc, maps);
    expect(out).toEqual(doc);
  });
});
