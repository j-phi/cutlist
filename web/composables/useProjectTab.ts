import { DEFAULT_PROJECT_TAB, type ProjectTabId } from '~/utils/projectTabs';

const useTabMap = createGlobalState(() =>
  useSessionStorage<Record<string, ProjectTabId | undefined>>(
    '@cutlist/tab-map',
    {},
  ),
);

export default function () {
  const { activeId: projectId } = useProjects();
  const map = useTabMap();
  const key = computed(() => projectId.value ?? '__local__');
  return computed<ProjectTabId>({
    get() {
      return map.value[key.value] ?? DEFAULT_PROJECT_TAB;
    },
    set(value) {
      map.value[key.value] = value;
    },
  });
}
