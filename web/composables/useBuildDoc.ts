/**
 * Reactive build doc for the active project.
 *
 * Holds the title (always-string, seeded from the project name on first
 * load when no record exists) and the Tiptap JSON doc. Mutations are
 * debounced — Tiptap's `onUpdate` fires per-keystroke, which would hammer
 * IDB without a trailing batch. The trailing flush also runs on `flush()`
 * (called from blur / unmount) and when the active project switches.
 *
 * State and the `activeId` watcher are module-scoped, so calling the
 * composable from multiple components doesn't multiply watchers — the
 * initial install is gated by `watcherInstalled`.
 */

import type { JSONContent } from '@tiptap/core';
import { EMPTY_DOC } from '~/composables/useIdb/defaults';

const DEBOUNCE_MS = 400;

const title = ref('');
// `shallowRef` (not `ref`) — the doc is replaced wholesale on every
// update, so deep reactivity is wasted work. More importantly, a deep
// `ref` wraps the JSON tree in Vue Proxies, and structured-clone (used
// by IDB writes) refuses to serialise Proxies with `DataCloneError`.
const doc = shallowRef<JSONContent>(EMPTY_DOC);
let loadedForId: string | null = null;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let watcherInstalled = false;

async function flushNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!dirty || !loadedForId) return;
  const id = loadedForId;
  dirty = false;
  const { putBuildDoc } = useIdb();
  await putBuildDoc({
    projectId: id,
    title: title.value,
    doc: doc.value,
    updatedAt: new Date().toISOString(),
  });
}

function schedule(): void {
  dirty = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void flushNow();
  }, DEBOUNCE_MS);
}

export default function useBuildDoc() {
  const idb = useIdb();
  const { activeId, activeProject } = useProjects();

  if (!watcherInstalled) {
    watcherInstalled = true;
    watch(
      activeId,
      async (id) => {
        // Flush pending writes for the previous project before swapping
        // refs — otherwise a fast switch loses the trailing keystroke.
        await flushNow();
        if (!id) {
          title.value = '';
          doc.value = EMPTY_DOC;
          loadedForId = null;
          return;
        }
        const existing = await idb.getBuildDoc(id);
        if (existing) {
          title.value = existing.title;
          doc.value = existing.doc;
        } else {
          // No record yet — seed with the project name. The first user
          // edit triggers `schedule()` which writes the full record,
          // baking in the seeded title at that moment.
          title.value = activeProject.value?.name ?? '';
          doc.value = EMPTY_DOC;
        }
        loadedForId = id;
      },
      { immediate: true },
    );
  }

  /** Update the doc body. Reactive immediately; IDB write is debounced. */
  function setDoc(next: JSONContent): void {
    doc.value = next;
    schedule();
  }

  /** Update the title. Same debouncing semantics as `setDoc`. */
  function setTitle(next: string): void {
    title.value = next;
    schedule();
  }

  return {
    title,
    doc,
    setTitle,
    setDoc,
    flush: flushNow,
  };
}
