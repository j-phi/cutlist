import { projectPath } from '~/utils/projectTabs';

/**
 * Navigation helpers for the project workspace.
 *
 * The URL is the source of truth — `useProjects().activeId` is derived from
 * `route.params`, and tab selection is encoded in the route segment. Tab
 * navigation goes through `<NuxtLink>` directly; only project switches
 * funnel through this helper so callers don't have to know the URL shape.
 */
export default function useProjectNavigation() {
  const { activeId } = useProjects();

  /** Navigate to a project. No-op if already active. */
  function setActiveProject(id: string | null) {
    if (id === activeId.value) return;
    navigateTo(id ? projectPath(id, null) : '/');
  }

  return { setActiveProject };
}
