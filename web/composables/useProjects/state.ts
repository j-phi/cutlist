/**
 * Module-level singletons shared by the project composables.
 *
 * `activeId` is derived from the URL — writes go through `navigateTo` so
 * the route stays the single source of truth. The other refs hold IDB-backed
 * state that isn't URL-derived.
 *
 * Lives inside `useProjects/` so Nuxt's component auto-import doesn't pick
 * it up as a top-level composable.
 */
import { computed, ref } from 'vue';
import type { ArchivedProjectItem, Project, ProjectListItem } from './types';

export const activeId = computed<string | null>(() => {
  if (!import.meta.client) return null;
  const route = useRoute();
  return (route.params.projectId as string | undefined) ?? null;
});

export const projectList = ref<ProjectListItem[]>([]);
export const archivedList = ref<ArchivedProjectItem[]>([]);
export const activeProjectData = ref<Project | null>(null);
export const projectLoading = ref(false);
