<script lang="ts" setup>
import {
  getAllProjectsByRecency,
  getProjectThumbnails,
} from '~/composables/useIdb/projects';
import { formatRelativeDate } from '~/utils/formatRelativeDate';

type ProjectRow = Awaited<ReturnType<typeof getAllProjectsByRecency>>[number];

const {
  openProject,
  duplicateProject,
  permanentlyDeleteProject,
  resetDatabase,
} = useProjects();

const rows = ref<ProjectRow[]>([]);
const thumbs = ref<Map<string, string>>(new Map());
const loading = ref(true);
const error = ref<string | null>(null);
const pendingDeleteId = ref<string | null>(null);
const duplicatingId = ref<string | null>(null);
const showResetConfirm = ref(false);
const showNewProject = ref(false);

onMounted(async () => {
  try {
    rows.value = await getAllProjectsByRecency();
  } catch (err) {
    error.value = err instanceof Error ? err.message : String(err);
  } finally {
    loading.value = false;
  }
  // Thumbnails are decoration — a failure here shouldn't poison the page.
  try {
    thumbs.value = await getProjectThumbnails();
  } catch (err) {
    console.warn('[projects] thumbnail fetch failed', err);
  }
});

async function handleOpen(id: string) {
  if (pendingDeleteId.value === id) return;
  await openProject(id);
}

async function handleDuplicate(id: string) {
  if (duplicatingId.value) return;
  duplicatingId.value = id;
  try {
    await duplicateProject(id);
    rows.value = await getAllProjectsByRecency();
  } finally {
    duplicatingId.value = null;
  }
}

async function confirmDelete(id: string) {
  pendingDeleteId.value = null;
  rows.value = rows.value.filter((r) => r.id !== id);
  thumbs.value.delete(id);
  await permanentlyDeleteProject(id);
}

function onResetClick() {
  if (showResetConfirm.value) {
    showResetConfirm.value = false;
    void resetDatabase();
  } else {
    showResetConfirm.value = true;
  }
}
</script>

<template>
  <AppShell>
    <ClientOnly>
      <div class="flex-1 overflow-y-auto">
        <section class="relative overflow-hidden">
          <HeroBackdrop position="top" />
          <div class="relative z-10 max-w-5xl mx-auto px-4 pt-12 pb-6">
            <div class="flex items-baseline justify-between gap-4">
              <h1 class="text-2xl font-bold text-hi">My projects</h1>
              <span
                v-if="!loading && rows.length > 0"
                class="text-sm tabular-nums text-muted"
              >
                {{ rows.length }}
                {{ rows.length === 1 ? 'project' : 'projects' }}
              </span>
            </div>
            <p class="mt-2 text-sm text-muted">
              These live only in this browser — nothing is sent to a server.
            </p>
          </div>
        </section>

        <div class="max-w-5xl mx-auto px-4 pb-12">
          <p v-if="loading" class="text-muted">Loading…</p>

          <p v-else-if="error" class="text-red-400">
            Couldn't load projects: {{ error }}
          </p>

          <div
            v-else-if="rows.length === 0"
            class="rounded-xl border border-subtle bg-surface p-10 text-center"
          >
            <UIcon
              name="i-lucide-folder-open"
              class="w-8 h-8 text-dim mx-auto mb-3"
            />
            <p class="text-body font-medium">No projects yet.</p>
            <p class="text-sm text-muted mt-1">
              Create your first one to start cutting.
            </p>
            <UButton
              color="primary"
              class="mt-5"
              icon="i-lucide-plus"
              @click="showNewProject = true"
            >
              New project
            </UButton>
          </div>

          <div v-else>
            <div
              class="hidden sm:grid grid-cols-[7rem_1fr_10rem_3rem] items-center gap-4 px-4 py-2 border-b border-subtle text-xs font-semibold text-muted uppercase tracking-wider"
            >
              <span class="col-span-2">Project</span>
              <span>Last opened</span>
              <span />
            </div>

            <ul>
              <li
                v-for="row in rows"
                :key="row.id"
                class="relative group border-b border-subtle last:border-0"
              >
                <button
                  type="button"
                  class="block w-full text-left hover:bg-surface focus:outline-none focus:bg-surface transition-colors"
                  @click="handleOpen(row.id)"
                >
                  <div
                    class="grid grid-cols-[7rem_1fr_3rem] sm:grid-cols-[7rem_1fr_10rem_3rem] items-center gap-4 px-4 py-3"
                  >
                    <div
                      class="w-28 aspect-[4/3] rounded-md overflow-hidden border border-subtle bg-base shrink-0"
                    >
                      <img
                        v-if="thumbs.get(row.id)"
                        :src="thumbs.get(row.id)"
                        :alt="`${row.name} preview`"
                        class="w-full h-full object-cover"
                        loading="lazy"
                      />
                      <div
                        v-else
                        class="w-full h-full flex items-center justify-center text-dim"
                      >
                        <UIcon name="i-lucide-image" class="w-5 h-5" />
                      </div>
                    </div>

                    <div class="min-w-0">
                      <h3 class="text-hi font-medium truncate">
                        {{ row.name }}
                      </h3>
                      <p class="mt-0.5 sm:hidden text-xs text-muted">
                        {{ formatRelativeDate(row.updatedAt) }}
                      </p>
                    </div>

                    <p class="hidden sm:block text-sm text-muted tabular-nums">
                      {{ formatRelativeDate(row.updatedAt) }}
                    </p>

                    <!-- Reserved column so row content doesn't slide under
                         the absolutely-positioned trash overlay below. -->
                    <span />
                  </div>
                </button>

                <!-- Sibling of the row button so we don't nest <button>s. -->
                <div
                  class="absolute top-1/2 -translate-y-1/2 right-3 flex items-center gap-1"
                >
                  <template v-if="pendingDeleteId === row.id">
                    <button
                      type="button"
                      class="px-2 py-1 text-xs text-muted hover:text-body transition-colors rounded bg-elevated border border-subtle"
                      @click="pendingDeleteId = null"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      class="px-2 py-1 text-xs font-medium text-white bg-red-500/90 hover:bg-red-500 transition-colors rounded"
                      @click="confirmDelete(row.id)"
                    >
                      Delete
                    </button>
                  </template>
                  <template v-else>
                    <button
                      type="button"
                      class="p-1.5 rounded text-muted hover:text-body opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                      :aria-label="`Duplicate ${row.name}`"
                      title="Duplicate project"
                      :disabled="duplicatingId === row.id"
                      @click.stop="handleDuplicate(row.id)"
                    >
                      <UIcon
                        :name="
                          duplicatingId === row.id
                            ? 'i-lucide-loader-circle'
                            : 'i-lucide-copy'
                        "
                        class="w-4 h-4"
                        :class="{ 'animate-spin': duplicatingId === row.id }"
                      />
                    </button>
                    <button
                      type="button"
                      class="p-1.5 rounded text-red-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity hover:text-red-400"
                      :aria-label="`Delete ${row.name}`"
                      title="Delete project"
                      @click.stop="pendingDeleteId = row.id"
                    >
                      <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
                    </button>
                  </template>
                </div>
              </li>
            </ul>
          </div>

          <div
            v-if="!loading"
            class="mt-16 flex justify-center items-center gap-2 text-xs"
          >
            <template v-if="showResetConfirm">
              <span class="text-muted">Delete every project and reset?</span>
              <button
                type="button"
                class="text-muted hover:text-body transition-colors"
                @click="showResetConfirm = false"
              >
                Cancel
              </button>
              <button
                type="button"
                class="text-red-400 hover:text-red-300 font-medium transition-colors"
                @click="onResetClick"
              >
                Confirm
              </button>
            </template>
            <button
              v-else
              type="button"
              class="text-dim hover:text-muted transition-colors"
              @click="onResetClick"
            >
              Reset database
            </button>
          </div>
        </div>
      </div>

      <NewProjectDialog v-model:open="showNewProject" />
    </ClientOnly>
  </AppShell>
</template>
