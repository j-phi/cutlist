/**
 * Project list and archive operations.
 *
 * Owns the project list, the archive list, and lifecycle CRUD that affects
 * either (add/close/restore/delete/clear/rename/reorder). Initial population
 * runs once from `startProjects()`. Lifecycle paths that need to surface a
 * different project to the user navigate via `navigateTo(projectPath(...))`;
 * the URL is the source of truth for `activeId`.
 */
import { computed } from 'vue';
import * as Sentry from '@sentry/nuxt';
import type { Precision } from 'cutlist';
import { DEFAULT_SETTINGS, getDefaultStockYaml } from '~/utils/settings';
import { useIdb } from '~/composables/useIdb';
import { resetDatabase as idbResetDatabase } from '~/composables/useIdb/db';
import { projectPath } from '~/utils/projectTabs';
import {
  activeId,
  activeProjectData,
  archivedList,
  projectList,
} from './state';
import type { Project } from './types';

async function init(idb: ReturnType<typeof useIdb>) {
  const [list, archived] = await Promise.all([
    idb.getProjectList(),
    idb.getArchivedList(),
  ]);
  projectList.value = list;
  archivedList.value = archived;
}

let collectionStarted = false;

export function startProjectCollection() {
  if (collectionStarted || !import.meta.client) return;
  collectionStarted = true;
  void init(useIdb());
}

export default function useProjectCollection() {
  const idb = useIdb();

  const projects = computed(() => {
    const map = new Map<string, Project>();
    for (const p of projectList.value) {
      if (
        p.id === activeId.value &&
        activeProjectData.value?.id === activeId.value
      ) {
        map.set(p.id, activeProjectData.value);
      } else {
        map.set(p.id, {
          id: p.id,
          name: p.name,
          models: [],
          colorMap: {},
          excludedColors: [],
          stock: '',
          distanceUnit: DEFAULT_SETTINGS.distanceUnit,
          precision: DEFAULT_SETTINGS.precision,
          bladeWidth: DEFAULT_SETTINGS.bladeWidth,
          margin: DEFAULT_SETTINGS.margin,
          defaultAlgorithm: DEFAULT_SETTINGS.defaultAlgorithm,
          showPartNumbers: DEFAULT_SETTINGS.showPartNumbers,
        });
      }
    }
    return map;
  });

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
      ...projectList.value,
      { id: project.id, name: project.name, updatedAt: project.updatedAt },
    ];
    // Prime `activeProjectData` so the workspace renders immediately when
    // the navigation below resolves — the activeId watcher would otherwise
    // round-trip through `loadProject` for data we already have.
    activeProjectData.value = { ...project, models: [] };
    await navigateTo(projectPath(project.id, null));
    Sentry.metrics.count('project.created', 1, {
      attributes: { unit },
    });
  }

  async function closeProject(id: string) {
    const item = projectList.value.find((p) => p.id === id);
    const remaining = projectList.value.filter((p) => p.id !== id);
    const wasActive = activeId.value === id;
    projectList.value = remaining;
    await idb.archiveProject(id);
    const archivedAt = new Date().toISOString();
    archivedList.value = [
      { id, name: item?.name ?? '', archivedAt },
      ...archivedList.value,
    ];
    if (wasActive) {
      const nextId =
        remaining.length > 0 ? remaining[remaining.length - 1].id : null;
      await navigateTo(nextId ? projectPath(nextId, null) : '/');
    }
  }

  async function restoreProject(id: string) {
    const item = archivedList.value.find((p) => p.id === id);
    if (!item) return;
    await idb.unarchiveProject(id);
    archivedList.value = archivedList.value.filter((p) => p.id !== id);
    const updatedAt = new Date().toISOString();
    projectList.value = [
      ...projectList.value,
      { id, name: item.name, updatedAt },
    ];
    await navigateTo(projectPath(id, null));
  }

  async function permanentlyDeleteProject(id: string) {
    archivedList.value = archivedList.value.filter((p) => p.id !== id);
    await idb.deleteProject(id);
  }

  async function clearHistory() {
    const ids = archivedList.value.map((p) => p.id);
    archivedList.value = [];
    await Promise.all(ids.map((id) => idb.deleteProject(id)));
  }

  async function resetDatabase() {
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
    const project = await idb.getProjectWithModels(id);
    if (!project) return;
    projectList.value = [
      ...projectList.value,
      { id: project.id, name: project.name, updatedAt: project.updatedAt },
    ];
  }

  async function reloadProjectList() {
    const [list, archived] = await Promise.all([
      idb.getProjectList(),
      idb.getArchivedList(),
    ]);
    projectList.value = list;
    archivedList.value = archived;
  }

  function reorderProjects(ids: string[]) {
    const map = new Map(projectList.value.map((p) => [p.id, p]));
    projectList.value = ids.map((id) => map.get(id)!).filter(Boolean);
  }

  return {
    projects,
    archivedList,
    addProject,
    appendProject,
    closeProject,
    restoreProject,
    permanentlyDeleteProject,
    clearHistory,
    resetDatabase,
    renameProject,
    reorderProjects,
    reloadProjectList,
  };
}
