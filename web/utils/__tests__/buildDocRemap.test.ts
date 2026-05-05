// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { remapBuildDocHtml } from '../buildDocRemap';

describe('remapBuildDocHtml', () => {
  it('rewrites image-block asset ids in place', () => {
    const html =
      '<p>before</p>' +
      '<image-block data-asset-id="old-1" data-caption="hello"></image-block>' +
      '<p>after</p>';

    const out = remapBuildDocHtml(html, {
      assetIdMap: new Map([['old-1', 'new-1']]),
      modelIdMap: new Map(),
      sceneIdMap: new Map(),
    });

    expect(out).toContain('data-asset-id="new-1"');
    expect(out).not.toContain('data-asset-id="old-1"');
    // Caption and surrounding paragraphs untouched.
    expect(out).toContain('data-caption="hello"');
    expect(out).toContain('<p>before</p>');
    expect(out).toContain('<p>after</p>');
  });

  it('rewrites scene-block model and scene ids', () => {
    const html =
      '<scene-block data-model-id="m-old" data-scene-id="s-old"></scene-block>';

    const out = remapBuildDocHtml(html, {
      assetIdMap: new Map(),
      modelIdMap: new Map([['m-old', 'm-new']]),
      sceneIdMap: new Map([['s-old', 's-new']]),
    });

    expect(out).toContain('data-model-id="m-new"');
    expect(out).toContain('data-scene-id="s-new"');
  });

  it('blanks orphan ids that have no entry in the maps', () => {
    const html =
      '<image-block data-asset-id="missing"></image-block>' +
      '<scene-block data-model-id="missing-m" data-scene-id="missing-s"></scene-block>';

    const out = remapBuildDocHtml(html, {
      assetIdMap: new Map(),
      modelIdMap: new Map(),
      sceneIdMap: new Map(),
    });

    expect(out).toContain('data-asset-id=""');
    expect(out).toContain('data-model-id=""');
    expect(out).toContain('data-scene-id=""');
  });

  it('returns empty html unchanged', () => {
    expect(
      remapBuildDocHtml('', {
        assetIdMap: new Map(),
        modelIdMap: new Map(),
        sceneIdMap: new Map(),
      }),
    ).toBe('');
  });
});
