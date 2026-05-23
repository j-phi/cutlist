<script lang="ts" setup>
import { tabFromUrlSegment } from '~/utils/projectTabs';
import { STORAGE_KEYS } from '~/utils/localStorage';

const { activeProject } = useProjects();
const { showConfirm, pendingGrainLock, confirmChange, cancelChange } =
  useGrainLockConfirm();

const route = useRoute();

watch(
  () => route.path,
  (path) => {
    const projectId = route.params.projectId as string;
    if (!projectId) return;
    const prefix = `/build/${projectId}/`;
    const segment = path.startsWith(prefix) ? path.slice(prefix.length) : '';
    const tab = tabFromUrlSegment(segment);
    try {
      localStorage.setItem(STORAGE_KEYS.ui.projectActiveTab(projectId), tab);
    } catch {}
  },
  { immediate: true },
);
</script>

<template>
  <AppShell>
    <ClientOnly>
      <div class="flex flex-col flex-1 min-w-0 bg-base relative z-10">
        <ProjectWorkspaceNav />
        <div class="relative flex-1 min-h-0">
          <NuxtPage v-if="activeProject" />
        </div>
        <GrainLockConfirmModal
          :open="showConfirm"
          :grain-lock="pendingGrainLock"
          @confirm="confirmChange"
          @cancel="cancelChange"
        />
      </div>
    </ClientOnly>
  </AppShell>
</template>
