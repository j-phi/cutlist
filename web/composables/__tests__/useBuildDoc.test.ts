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
  it('treats the fresh-editor doc as empty', () => {
    expect(
      isBuildDocEmpty({ type: 'doc', content: [{ type: 'paragraph' }] }),
    ).toBe(true);
  });

  it('treats a doc with no content array as empty', () => {
    expect(isBuildDocEmpty({ type: 'doc' } as JSONContent)).toBe(true);
  });

  it('treats a paragraph with explicit empty content as empty', () => {
    expect(
      isBuildDocEmpty({
        type: 'doc',
        content: [{ type: 'paragraph', content: [] }],
      }),
    ).toBe(true);
  });

  it('treats a paragraph with text as non-empty', () => {
    expect(isBuildDocEmpty(FILLED_A)).toBe(false);
  });

  it('treats multiple top-level nodes as non-empty', () => {
    expect(
      isBuildDocEmpty({
        type: 'doc',
        content: [{ type: 'paragraph' }, { type: 'paragraph' }],
      }),
    ).toBe(false);
  });

  it('treats a non-paragraph block (e.g. heading, image) as non-empty', () => {
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
    // Drive the activeId watcher to a clean baseline before each test.
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

    // Activate A and let its doc load.
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

    // Once the load resolves, B's content lands.
    await settle();
    expect(api.title.value).toBe('Title B');
    expect(api.doc.value).toEqual(FILLED_B);
    expect(api.loadedId.value).toBe(b.id);
  });
});
