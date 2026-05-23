import {
  projectPath,
  isProjectTabId,
  type ProjectTabId,
} from '~/utils/projectTabs';
import { STORAGE_KEYS } from '~/utils/localStorage';

/** Read the last-visited tab for a project from localStorage. */
export function readSavedTab(projectId: string): ProjectTabId | null {
  if (!import.meta.client) return null;
  try {
    const stored = localStorage.getItem(
      STORAGE_KEYS.ui.projectActiveTab(projectId),
    );
    return isProjectTabId(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Wraps project navigation so callers don't have to know the URL shape.
 * Tab switches use `<NuxtLink>` directly — only project switches funnel
 * through here.
 */
export default function useProjectNavigation() {
  const { activeId } = useProjects();

  function setActiveProject(id: string | null) {
    if (id === activeId.value) return;
    if (!id) {
      navigateTo('/');
      return;
    }
    navigateTo(projectPath(id, readSavedTab(id)));
  }

  return { setActiveProject };
}
