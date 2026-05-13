/**
 * In-memory ObjectGraph cache for the active project's source models.
 *
 * On model dropdown switches, ModelTab used to re-read `rawSource` from IDB
 * and re-run the GLTF/COLLADA loader on every flip — hundreds of ms on
 * larger assemblies. This composable caches the *derived* `ObjectGraph` so
 * the second visit to a model is essentially free. The `rawSource` itself
 * stays in IDB; we only keep the parsed graph in memory.
 *
 * Lifetime is project-scoped: switching projects clears the map. Deletes
 * are also pruned by watching `activeProject.models` for disappearance.
 *
 * State is held in a `createGlobalState` so unmount/remount of the same
 * ModelTab in one project doesn't lose the cache.
 */

import type { ObjectGraph } from '~/utils/types';
import { useIdb } from '~/composables/useIdb';
import { useActiveProject } from '~/composables/useProjects';
import { resolveModelScene } from '~/utils/resolveModelScene';

export default createGlobalState(() => {
  const cache = new Map<string, ObjectGraph>();
  const idb = useIdb();
  const { activeId, activeProject } = useActiveProject();

  let lastProjectId: string | null = activeId.value;
  let lastModelIds: ReadonlySet<string> = new Set(
    activeProject.value?.models.map((m) => m.id) ?? [],
  );

  // Project switch — drop everything. The model ids are project-scoped so
  // there's no cross-project collision risk, but keeping the map bounded is
  // worth more than chasing a hypothetical hit rate.
  watch(activeId, (id) => {
    if (id !== lastProjectId) {
      cache.clear();
      lastProjectId = id;
      lastModelIds = new Set(
        activeProject.value?.models.map((m) => m.id) ?? [],
      );
    }
  });

  // Model deletion — purge any cache entries whose model just disappeared
  // from the active project. The IDB cascade in `deleteModel` already wiped
  // its scenes/annotations; this just keeps the in-memory graph from
  // outliving the model record.
  watch(
    () => activeProject.value?.models.map((m) => m.id) ?? [],
    (ids) => {
      const next = new Set(ids);
      for (const id of lastModelIds) {
        if (!next.has(id)) cache.delete(id);
      }
      lastModelIds = next;
    },
  );

  /**
   * Returns the cached `ObjectGraph` for `modelId`, deriving (and caching)
   * it from `rawSource` on cache miss. Resolves to `null` when the model
   * has no stored raw source — the caller should render an empty state.
   */
  async function getModelGraph(modelId: string): Promise<ObjectGraph | null> {
    const hit = cache.get(modelId);
    if (hit) return hit;
    const project = activeProject.value;
    const meta = project?.models.find((m) => m.id === modelId);
    if (!meta) return null;
    const rawSource = await idb.getModelRawSource(modelId);
    if (rawSource == null) return null;
    const graph = await resolveModelScene({ rawSource });
    if (!graph) return null;
    cache.set(modelId, graph);
    return graph;
  }

  /** Drop a single entry. Exposed for tests / manual invalidation. */
  function purge(modelId: string): void {
    cache.delete(modelId);
  }

  /** Drop everything. Exposed for tests. */
  function clear(): void {
    cache.clear();
  }

  return {
    getModelGraph,
    purge,
    clear,
  };
});
