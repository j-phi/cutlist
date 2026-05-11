<script lang="ts" setup>
import { startProjects } from '~/composables/useProjects';

startProjects();
useAppErrors();
</script>

<template>
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
  </UApp>
</template>
