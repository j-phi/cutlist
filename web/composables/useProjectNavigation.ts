import { projectPath, type ProjectTabId } from '~/utils/projectTabs';

/**
 * Navigation helpers for the project workspace.
 *
 * The URL is the source of truth — `useProjects().activeId` and
 * `useProjectTab()` are derived from `route.params`. These helpers wrap
 * `navigateTo` so callers don't have to know the URL shape. Project
 * switches push history; tab switches replace (so tab toggling doesn't
 * clutter the back stack).
 */
export default function useProjectNavigation() {
  const { activeId } = useProjects();
  const tab = useProjectTab();

  /** Navigate to a project. No-op if already active. */
  function setActiveProject(id: string | null) {
    if (id === activeId.value) return;
    navigateTo(id ? projectPath(id, null) : '/');
  }

  /** Switch the workspace tab. Replace, not push — tab toggling shouldn't
   *  litter history. No-op if no project is active or the tab is unchanged. */
  function setTab(next: ProjectTabId) {
    if (!activeId.value) return;
    if (next === tab.value) return;
    navigateTo(projectPath(activeId.value, next), { replace: true });
  }

  return { setActiveProject, setTab };
}
