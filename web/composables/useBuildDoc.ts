/**
 * Reactive build doc for the active project.
 *
 * Holds the title (always-string, seeded from the project name on first
 * load when no record exists) and the Tiptap JSON doc. Mutations are
 * debounced — Tiptap's `onUpdate` fires per-keystroke, which would hammer
 * IDB without a trailing batch. The trailing flush also runs on `flush()`
 * (called from blur / unmount) and when the active project switches.
 *
 * State is module-scoped and the `activeId` watcher is installed in a
 * detached effect scope on first use — same convention as `useScenes`
 * and `useAnnotations`. The detached scope matters: without it the
 * watcher would be bound to the *first caller's* component scope, and
 * unmounting that component (e.g. switching off the Build tab) would
 * silently dispose it, leaving subsequent project switches unobserved.
 */

import type { JSONContent } from '@tiptap/core';
import { effectScope } from 'vue';
import { EMPTY_DOC } from '~/composables/useIdb/defaults';

const DEBOUNCE_MS = 400;

const title = ref('');
// `shallowRef` (not `ref`) — the doc is replaced wholesale on every
// update, so deep reactivity is wasted work. More importantly, a deep
// `ref` wraps the JSON tree in Vue Proxies, and structured-clone (used
// by IDB writes) refuses to serialise Proxies with `DataCloneError`.
const doc = shallowRef<JSONContent>(EMPTY_DOC);
// Reactive — consumers (e.g. InstructionsTab) watch this to know when the
// async load for the active project has settled, so an initial mode
// decision sees the real doc instead of the EMPTY_DOC placeholder.
const loadedId = ref<string | null>(null);
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let watcherInstalled = false;

async function flushNow(): Promise<void> {
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  if (!dirty || !loadedId.value) return;
  const id = loadedId.value;
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
    effectScope(true).run(() => {
      watch(
        activeId,
        async (id) => {
          // Snapshot any pending writes for the previous project before
          // we wipe the live refs. We can't `await flushNow()` first —
          // that would leave the previous project's doc/title visible
          // for the duration of the IDB write, which is exactly the
          // stale flash we're avoiding.
          const pending =
            dirty && loadedId.value
              ? {
                  projectId: loadedId.value,
                  title: title.value,
                  doc: doc.value,
                  updatedAt: new Date().toISOString(),
                }
              : null;

          // Reset visible state synchronously so the UI never renders
          // the previous project's doc next to the new project's
          // identity while the next IDB read is in flight.
          if (timer) {
            clearTimeout(timer);
            timer = null;
          }
          dirty = false;
          loadedId.value = null;
          title.value = '';
          doc.value = EMPTY_DOC;

          // Trailing flush for the previous project runs in parallel
          // with the next load — they touch different records, so
          // there's no ordering hazard.
          if (pending) void idb.putBuildDoc(pending);

          if (!id) return;

          const existing = await idb.getBuildDoc(id);
          // Stale-load guard: if the user switched projects again
          // while we were reading, drop this result — the next watcher
          // invocation owns the load for the now-active project.
          if (activeId.value !== id) return;

          if (existing) {
            title.value = existing.title;
            doc.value = existing.doc;
          } else {
            // No record yet — seed the title with the project name.
            // `doc` stays at the EMPTY_DOC we already reset to above;
            // the first user edit triggers `schedule()` which writes
            // the full record.
            title.value = activeProject.value?.name ?? '';
          }
          loadedId.value = id;
        },
        { immediate: true },
      );
    });
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
    loadedId,
    setTitle,
    setDoc,
    flush: flushNow,
  };
}

/**
 * Returns true when `doc` is the empty Tiptap document — i.e. a single
 * empty paragraph. Used by the Instructions tab to decide whether to
 * start in the rendered view or jump straight to the editor.
 */
export function isBuildDocEmpty(doc: JSONContent): boolean {
  const content = doc.content ?? [];
  if (content.length !== 1) return content.length === 0;
  const [node] = content;
  return node.type === 'paragraph' && (node.content?.length ?? 0) === 0;
}
