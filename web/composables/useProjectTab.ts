/**
 * Read-only handle to the currently-active workspace tab.
 *
 * Derived from `useRoute().params.tab` — the URL is the source of truth.
 * Tab switches are performed via `useProjectNavigation().setTab(tab)` which
 * calls `navigateTo(projectPath(activeId, tab), { replace: true })`. The
 * computed re-evaluates on the resulting route change.
 */
import { computed } from 'vue';
import {
  DEFAULT_PROJECT_TAB,
  tabFromUrlSegment,
  type ProjectTabId,
} from '~/utils/projectTabs';

export default function useProjectTab() {
  const route = useRoute();
  return computed<ProjectTabId>(() => {
    if (!import.meta.client) return DEFAULT_PROJECT_TAB;
    const segment = route.params.tab as string | undefined;
    return tabFromUrlSegment(segment);
  });
}
