import { projectPath } from '~/utils/projectTabs';

/**
 * Wraps project navigation so callers don't have to know the URL shape.
 * Tab switches use `<NuxtLink>` directly — only project switches funnel
 * through here.
 */
export default function useProjectNavigation() {
  const { activeId } = useProjects();

  function setActiveProject(id: string | null) {
    if (id === activeId.value) return;
    navigateTo(id ? projectPath(id, null) : '/');
  }

  return { setActiveProject };
}
