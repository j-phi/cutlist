<script lang="ts" setup>
/**
 * F3 — surfaces the storage-durability state (FR-DUR-2/-3).
 *
 *  - FR-DUR-2: a one-time, dismissible banner while persistent storage is
 *    denied/unavailable, telling the user their work lives only in this
 *    browser and to export a backup.
 *  - FR-DUR-3: a proactive low-space warning while usage ≥ 80% of quota,
 *    shown BEFORE a write fails. This one is not dismissible — it reflects a
 *    live condition and clears when space frees up.
 *
 * Floating element → `bg-elevated` per the theming rules.
 */
import { computed } from 'vue';
import useStorageDurability from '~/composables/useStorageDurability';

const { showBackupBanner, lowSpace, usage, quota, dismissBanner } =
  useStorageDurability();

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let value = bytes / 1024;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i += 1;
  }
  return `${value.toFixed(value < 10 ? 1 : 0)} ${units[i]}`;
}

const spaceLabel = computed(() => {
  if (usage.value == null || quota.value == null || quota.value <= 0) return '';
  const pct = Math.round((usage.value / quota.value) * 100);
  return `${formatBytes(usage.value)} of ${formatBytes(quota.value)} used (${pct}%)`;
});
</script>

<template>
  <div
    v-if="lowSpace || showBackupBanner"
    class="pointer-events-none fixed inset-x-0 top-0 z-50 flex flex-col items-center gap-2 px-3 pt-2"
  >
    <!-- FR-DUR-3: proactive low-space warning -->
    <div
      v-if="lowSpace"
      class="pointer-events-auto flex w-full max-w-2xl items-start gap-3 rounded-md border border-default bg-elevated px-4 py-2.5 text-sm shadow-lg"
      role="alert"
    >
      <UIcon
        name="i-lucide-triangle-alert"
        class="mt-0.5 size-4 shrink-0 text-amber-400"
      />
      <div class="flex-1">
        <p class="text-hi font-medium">Storage almost full</p>
        <p class="text-muted">
          {{ spaceLabel }}. Export and delete projects you no longer need to
          avoid losing work when a save fails.
        </p>
      </div>
    </div>

    <!-- FR-DUR-2: persistence-denied backup nudge (dismissible) -->
    <div
      v-if="showBackupBanner"
      class="pointer-events-auto flex w-full max-w-2xl items-start gap-3 rounded-md border border-default bg-elevated px-4 py-2.5 text-sm shadow-lg"
      role="status"
    >
      <UIcon
        name="i-lucide-database"
        class="mt-0.5 size-4 shrink-0 text-muted"
      />
      <div class="flex-1">
        <p class="text-hi font-medium">
          Your work is stored only in this browser
        </p>
        <p class="text-muted">
          The browser may clear it when space is low or after long inactivity.
          Use Export to keep a backup of important projects.
        </p>
      </div>
      <UButton
        size="xs"
        variant="ghost"
        color="neutral"
        icon="i-lucide-x"
        aria-label="Dismiss"
        @click="dismissBanner"
      />
    </div>
  </div>
</template>
