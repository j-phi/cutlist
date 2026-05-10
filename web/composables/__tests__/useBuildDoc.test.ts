// @vitest-environment nuxt
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { nextTick, ref } from 'vue';
import { mockNuxtImport } from '@nuxt/test-utils/runtime';
import type { JSONContent } from '@tiptap/core';

const activeId = ref<string | null>(null);
const activeProject = ref<{ id: string; name: string } | null>(null);
const projects = ref<{ id: string; name: string }[]>([]);

mockNuxtImport('useProjects', () => () => ({
  activeId,
  activeProject,
  projects,
}));

import useBuildDoc, { isBuildDocEmpty } from '../useBuildDoc';
import { useIdb } from '../useIdb';
import { EMPTY_DOC } from '../useIdb/defaults';

const FILLED_A: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'A' }] }],
};
const FILLED_B: JSONContent = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'B' }] }],
};

describe('isBuildDocEmpty', () => {
  it('treats empty / placeholder docs as empty', () => {
    expect(
      isBuildDocEmpty({ type: 'doc', content: [{ type: 'paragraph' }] }),
    ).toBe(true);
    expect(isBuildDocEmpty({ type: 'doc' } as JSONContent)).toBe(true);
    expect(
      isBuildDocEmpty({
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      }),
    ).toBe(true);
  });

  it('treats any real content as non-empty', () => {
    // Paragraph with text.
    expect(isBuildDocEmpty(FILLED_A)).toBe(false);
    // Multiple top-level nodes.
    expect(
      isBuildDocEmpty({
        type: 'doc',
        content: [{ type: 'paragraph' }, { type: 'paragraph' }],
      }),
    ).toBe(false);
    // Non-paragraph block (image, heading, etc.).
    expect(
      isBuildDocEmpty({
        type: 'doc',
        content: [{ type: 'imageBlock', attrs: { assetId: 'x', caption: '' } }],
      }),
    ).toBe(false);
  });
});

// ─── Project-switch race ────────────────────────────────────────────────────
//
// `useBuildDoc` is module-scoped on purpose (single shared watcher), so we
// install it once for the whole file and reset external state via the
// `activeId` ref between tests rather than re-instantiating.

describe('useBuildDoc — project switch', () => {
  let api: ReturnType<typeof useBuildDoc>;

  beforeAll(() => {
    api = useBuildDoc();
  });

  beforeEach(async () => {
    activeId.value = null;
    activeProject.value = null;
    projects.value = [];
    await nextTick();
  });

  async function settle(): Promise<void> {
    // fake-indexeddb resolves through macrotasks, not microtasks, so
    // nextTick alone won't advance an in-flight read. Yield via
    // setTimeout each iteration to let those callbacks run.
    for (let i = 0; i < 50; i++) {
      if (activeId.value == null && api.loadedId.value == null) return;
      if (activeId.value != null && api.loadedId.value === activeId.value) {
        return;
      }
      await new Promise<void>((r) => setTimeout(r, 0));
      await nextTick();
    }
  }

  it('clears the previous project doc/title synchronously when activeId switches', async () => {
    const idb = useIdb();
    const a = await idb.createProject('Project A');
    const b = await idb.createProject('Project B');
    await idb.putBuildDoc({
      projectId: a.id,
      title: 'Title A',
      doc: FILLED_A,
      updatedAt: new Date().toISOString(),
    });
    await idb.putBuildDoc({
      projectId: b.id,
      title: 'Title B',
      doc: FILLED_B,
      updatedAt: new Date().toISOString(),
    });
    projects.value = [a, b];

    activeId.value = a.id;
    activeProject.value = a;
    await settle();
    expect(api.title.value).toBe('Title A');
    expect(api.doc.value).toEqual(FILLED_A);
    expect(api.loadedId.value).toBe(a.id);

    // Switch to B. The IDB read is awaited inside the watcher, so
    // synchronously after the activeId flip the visible state must have
    // been wiped — not still rendering A's content next to B's identity.
    activeId.value = b.id;
    activeProject.value = b;
    await nextTick();

    expect(api.title.value).toBe('');
    expect(api.doc.value).toBe(EMPTY_DOC);
    expect(api.loadedId.value).toBe(null);

    await settle();
    expect(api.title.value).toBe('Title B');
    expect(api.doc.value).toEqual(FILLED_B);
    expect(api.loadedId.value).toBe(b.id);
  });

  // ─── Orphan-asset sweep ──────────────────────────────────────────────────
  //
  // The sweep diffs `getAssetsForProject` against `collectAssetIds(doc)` and
  // bulk-deletes anything not referenced. Tiptap history is in-memory only,
  // so deleting on fresh load is safe. One test covers both the doc-with-
  // refs and no-doc cases (no-doc seeds EMPTY_DOC, which has zero refs).

  it('deletes assets that the loaded doc no longer references', async () => {
    const idb = useIdb();
    const project = await idb.createProject('Sweepy');
    const liveAsset = await idb.createAsset({
      projectId: project.id,
      mimeType: 'image/png',
      blob: new Blob([new TextEncoder().encode('keep')], { type: 'image/png' }),
    });
    const orphanAsset = await idb.createAsset({
      projectId: project.id,
      mimeType: 'image/png',
      blob: new Blob([new TextEncoder().encode('drop')], { type: 'image/png' }),
    });
    await idb.putBuildDoc({
      projectId: project.id,
      title: 'Sweepy',
      doc: {
        type: 'doc',
        content: [
          { type: 'imageBlock', attrs: { assetId: liveAsset.id, caption: '' } },
        ],
      },
      updatedAt: new Date().toISOString(),
    });
    projects.value = [project];

    activeId.value = project.id;
    activeProject.value = project;
    await settle();

    // Sweep is fire-and-forget; settle() only waits for loadedId to flip.
    for (let i = 0; i < 20; i++) {
      await new Promise<void>((r) => setTimeout(r, 0));
      await nextTick();
      if ((await idb.getAsset(orphanAsset.id)) === undefined) break;
    }

    expect(await idb.getAsset(liveAsset.id)).toBeDefined();
    expect(await idb.getAsset(orphanAsset.id)).toBeUndefined();
  });
});
