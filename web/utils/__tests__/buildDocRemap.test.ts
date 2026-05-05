import { describe, expect, it } from 'vitest';
import type { JSONContent } from '@tiptap/core';
import { collectAssetIds, remapBuildDoc } from '../buildDocRemap';

function doc(content: JSONContent[]): JSONContent {
  return { type: 'doc', content };
}

describe('remapBuildDoc', () => {
  it('rewrites image-block asset ids in place', () => {
    const input = doc([
      { type: 'paragraph', content: [{ type: 'text', text: 'before' }] },
      {
        type: 'imageBlock',
        attrs: { assetId: 'old-1', caption: 'hello' },
      },
      { type: 'paragraph', content: [{ type: 'text', text: 'after' }] },
    ]);

    const out = remapBuildDoc(input, {
      assetIdMap: new Map([['old-1', 'new-1']]),
      modelIdMap: new Map(),
      sceneIdMap: new Map(),
    });

    const image = out.content?.[1];
    expect(image?.attrs?.assetId).toBe('new-1');
    expect(image?.attrs?.caption).toBe('hello');
    // Surrounding paragraphs untouched.
    expect(out.content?.[0]).toEqual(input.content?.[0]);
    expect(out.content?.[2]).toEqual(input.content?.[2]);
  });

  it('rewrites scene-block model and scene ids', () => {
    const input = doc([
      {
        type: 'sceneBlock',
        attrs: { modelId: 'm-old', sceneId: 's-old', caption: '' },
      },
    ]);

    const out = remapBuildDoc(input, {
      assetIdMap: new Map(),
      modelIdMap: new Map([['m-old', 'm-new']]),
      sceneIdMap: new Map([['s-old', 's-new']]),
    });

    expect(out.content?.[0]?.attrs?.modelId).toBe('m-new');
    expect(out.content?.[0]?.attrs?.sceneId).toBe('s-new');
  });

  it('blanks orphan ids that have no entry in the maps', () => {
    const input = doc([
      { type: 'imageBlock', attrs: { assetId: 'missing', caption: '' } },
      {
        type: 'sceneBlock',
        attrs: { modelId: 'missing-m', sceneId: 'missing-s', caption: '' },
      },
    ]);

    const out = remapBuildDoc(input, {
      assetIdMap: new Map(),
      modelIdMap: new Map(),
      sceneIdMap: new Map(),
    });

    expect(out.content?.[0]?.attrs?.assetId).toBe('');
    expect(out.content?.[1]?.attrs?.modelId).toBe('');
    expect(out.content?.[1]?.attrs?.sceneId).toBe('');
  });

  it('walks nested content', () => {
    const input: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [
                {
                  type: 'imageBlock',
                  attrs: { assetId: 'old-1', caption: '' },
                },
              ],
            },
          ],
        },
      ],
    };

    const out = remapBuildDoc(input, {
      assetIdMap: new Map([['old-1', 'new-1']]),
      modelIdMap: new Map(),
      sceneIdMap: new Map(),
    });

    const image = out.content?.[0]?.content?.[0]?.content?.[0];
    expect(image?.attrs?.assetId).toBe('new-1');
  });

  it('returns an empty doc unchanged structurally', () => {
    const empty = doc([{ type: 'paragraph' }]);
    const out = remapBuildDoc(empty, {
      assetIdMap: new Map(),
      modelIdMap: new Map(),
      sceneIdMap: new Map(),
    });
    expect(out).toEqual(empty);
  });
});

describe('collectAssetIds', () => {
  it('returns the set of asset ids referenced by image blocks', () => {
    const input = doc([
      { type: 'imageBlock', attrs: { assetId: 'a' } },
      { type: 'paragraph', content: [{ type: 'text', text: 'x' }] },
      { type: 'imageBlock', attrs: { assetId: 'b' } },
      { type: 'imageBlock', attrs: { assetId: '' } },
    ]);
    const ids = collectAssetIds(input);
    expect(ids).toEqual(new Set(['a', 'b']));
  });

  it('walks nested content', () => {
    const input: JSONContent = {
      type: 'doc',
      content: [
        {
          type: 'bulletList',
          content: [
            {
              type: 'listItem',
              content: [{ type: 'imageBlock', attrs: { assetId: 'nested' } }],
            },
          ],
        },
      ],
    };
    expect(collectAssetIds(input)).toEqual(new Set(['nested']));
  });
});
