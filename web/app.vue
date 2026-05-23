<script lang="ts" setup>
import { startProjects } from '~/composables/useProjects';
import useStorageDurability from '~/composables/useStorageDurability';

startProjects();
useAppErrors();

// FR-DUR-1: request persistent storage and record usage/quota at boot.
if (import.meta.client) {
  void useStorageDurability().init();
}
</script>

<template>
  <UApp>
    <StorageDurabilityBanner />
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
