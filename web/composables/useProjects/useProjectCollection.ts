/**
 * Project list, open-tab list, and lifecycle CRUD.
 *
 * The IDB project library is every project ever created. The localStorage
 * open-tab list (managed in `useOpenTabs`) is which of those is pinned as
 * a top-bar tab. The tab bar renders the intersection.
 *
 * The Projects page reads IDB directly so it can show closed projects too.
 */
import { computed } from 'vue';
import type { Precision } from 'cutlist';
import { trackEvent } from '~/utils/analytics';
import { getDefaultStockYaml } from '~/utils/settings';
import { useIdb } from '~/composables/useIdb';
import { resetDatabase as idbResetDatabase } from '~/composables/useIdb/db';
import {
  addOpenTab,
  clearOpenTabs,
  openTabIds,
  removeOpenTab,
  reorderOpenTabs,
} from '~/composables/useOpenTabs';
import { projectPath } from '~/utils/projectTabs';
import { activeId, activeProjectData, projectList } from './state';

type TabEntry = { id: string; name: string };

async function init(idb: ReturnType<typeof useIdb>) {
  projectList.value = await idb.getAllProjectsByRecency();
}

let collectionStarted = false;

export function startProjectCollection() {
  if (collectionStarted || !import.meta.client) return;
  collectionStarted = true;
  void init(useIdb());
}

export default function useProjectCollection() {
  const idb = useIdb();

  /** Tabs in tab-bar order, keyed by id for `[id, project]` iteration. */
  const projects = computed(() => {
    const byId = new Map(projectList.value.map((p) => [p.id, p]));
    const map = new Map<string, TabEntry>();
    for (const id of openTabIds.value) {
      if (id === activeId.value && activeProjectData.value?.id === id) {
        map.set(id, activeProjectData.value);
        continue;
      }
      const meta = byId.get(id);
      if (meta) map.set(id, meta);
    }
    return map;
  });

  async function navigateAwayIfClosed(closedId: string) {
    if (activeId.value !== closedId) return;
    const next = openTabIds.value.at(-1) ?? null;
    await navigateTo(next ? projectPath(next, null) : '/');
  }

  async function addProject(
    name: string,
    unit: 'mm' | 'in',
    precision?: Precision,
  ) {
    const project = await idb.createProject(name, {
      distanceUnit: unit,
      precision,
      stock: getDefaultStockYaml(unit),
    });
    projectList.value = [
      { id: project.id, name: project.name, updatedAt: project.updatedAt },
      ...projectList.value,
    ];
    addOpenTab(project.id);
    // Prime activeProjectData so the workspace renders immediately on the
    // navigation below — the activeId watcher would otherwise round-trip
    // through loadProject for data we already have.
    activeProjectData.value = { ...project, models: [] };
    await navigateTo(projectPath(project.id, null));
    trackEvent('project-created', { unit });
  }

  async function closeProject(id: string) {
    removeOpenTab(id);
    await navigateAwayIfClosed(id);
  }

  async function openProject(id: string) {
    addOpenTab(id);
    await navigateTo(projectPath(id, null));
  }

  async function permanentlyDeleteProject(id: string) {
    projectList.value = projectList.value.filter((p) => p.id !== id);
    removeOpenTab(id);
    await idb.deleteProject(id);
    await navigateAwayIfClosed(id);
  }

  async function resetDatabase() {
    clearOpenTabs();
    await idbResetDatabase();
    window.location.reload();
  }

  async function renameProject(id: string, name: string) {
    if (activeProjectData.value?.id === id) {
      activeProjectData.value = { ...activeProjectData.value, name };
    }
    projectList.value = projectList.value.map((p) =>
      p.id === id ? { ...p, name } : p,
    );
    await idb.updateProject(id, { name });
  }

  async function appendProject(id: string) {
    if (!projectList.value.some((p) => p.id === id)) {
      projectList.value = await idb.getAllProjectsByRecency();
    }
    addOpenTab(id);
  }

  return {
    projects,
    addProject,
    appendProject,
    closeProject,
    openProject,
    permanentlyDeleteProject,
    resetDatabase,
    renameProject,
    reorderProjects: reorderOpenTabs,
  };
}
