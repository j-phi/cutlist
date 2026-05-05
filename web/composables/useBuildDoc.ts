/**
 * Reactive build doc for the active project.
 *
 * Holds an optional title and the editor HTML. Mutations are debounced —
 * Tiptap's `onUpdate` fires per-keystroke, which would hammer IDB without
 * a trailing batch. The trailing flush also runs on `flush()` (called from
 * blur / unmount) and when the active project switches.
 */

import type { BuildDocPatch } from '~/composables/useIdb/buildDocs';

const DEBOUNCE_MS = 400;

const html = ref('');
const title = ref<string | undefined>(undefined);
let loadedForId: string | null = null;
let pendingPatch: BuildDocPatch | null = null;
let pendingProjectId: string | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;

export default function useBuildDoc() {
  const idb = useIdb();
  const { activeId } = useProjects();

  watch(
    activeId,
    async (id) => {
      if (!id) {
        await flushNow();
        html.value = '';
        title.value = undefined;
        loadedForId = null;
        return;
      }
      if (id === loadedForId) return;
      // Flush pending writes for the previous project before swapping
      // refs — otherwise a fast switch loses the trailing keystroke.
      await flushNow();
      const doc = await idb.getBuildDoc(id);
      html.value = doc?.html ?? '';
      title.value = doc?.title;
      loadedForId = id;
    },
    { immediate: true },
  );

  async function flushNow() {
    if (!pendingPatch || !pendingProjectId) return;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    const patch = pendingPatch;
    const projectId = pendingProjectId;
    pendingPatch = null;
    pendingProjectId = null;
    await idb.updateBuildDoc(projectId, patch);
  }

  function schedule(patch: BuildDocPatch) {
    const projectId = activeId.value;
    if (!projectId) return;
    pendingPatch = { ...pendingPatch, ...patch };
    pendingProjectId = projectId;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      void flushNow();
    }, DEBOUNCE_MS);
  }

  /**
   * Update the editor HTML. Reflects in `html` immediately; the IDB write
   * is debounced (call `flush()` to force-commit, e.g. on blur or unmount).
   */
  function setHtml(next: string) {
    html.value = next;
    schedule({ html: next });
  }

  /** Update the title. Same debouncing semantics as `setHtml`. */
  function setTitle(next: string) {
    title.value = next;
    schedule({ title: next });
  }

  /** Re-read from IDB. Used by the import flow after a fresh write. */
  async function reload(projectId: string) {
    const doc = await idb.getBuildDoc(projectId);
    html.value = doc?.html ?? '';
    title.value = doc?.title;
    loadedForId = projectId;
  }

  return {
    html,
    title,
    setHtml,
    setTitle,
    flush: flushNow,
    reload,
  };
}
