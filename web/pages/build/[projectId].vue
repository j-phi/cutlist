<script lang="ts" setup>
const { activeProject } = useProjects();
const { showConfirm, pendingGrainLock, confirmChange, cancelChange } =
  useGrainLockConfirm();
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
