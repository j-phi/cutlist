<script lang="ts" setup>
import * as Sentry from '@sentry/nuxt';

const { projects, activeId, closeProject, renameProject, reorderProjects } =
  useProjects();
const { setActiveProject } = useProjectNavigation();
const { exportProject, exportAllProjects } = useExportProject();
const { pickAndImport } = useImportProject();

const showModal = ref(false);
const showMobileMenu = ref(false);
const pendingCloseId = ref<string | null>(null);
const pendingCloseName = ref('');

const activeProjectName = computed(() => {
  if (!activeId.value) return '';
  return projects.value.get(activeId.value)?.name ?? '';
});

const allProjects = computed(() => [...projects.value.entries()]);

function closeMobileMenu() {
  showMobileMenu.value = false;
}

// Feedback depends on Sentry, which is hard-disabled. See sentry.client.config.ts.
const feedbackEnabled = false;

async function openFeedback() {
  const feedback = Sentry.getFeedback();
  if (!feedback) return;
  const form = await feedback.createForm();
  form.appendToDom();
  form.open();
}

function openFeedbackFromMenu() {
  closeMobileMenu();
  void openFeedback();
}

function selectProjectFromMenu(id: string) {
  closeMobileMenu();
  setActiveProject(id);
}

async function handleExportFromMenu() {
  closeMobileMenu();
  await exportProject();
}

async function handleImportFromMenu() {
  closeMobileMenu();
  await pickAndImport();
}

function openNewProjectFromMenu() {
  closeMobileMenu();
  openNewProject();
}

function requestClose(id: string) {
  const project = projects.value.get(id);
  pendingCloseName.value = project?.name ?? 'this project';
  pendingCloseId.value = id;
}

function confirmClose() {
  if (pendingCloseId.value) {
    closeProject(pendingCloseId.value);
    pendingCloseId.value = null;
  }
}

function cancelClose() {
  pendingCloseId.value = null;
}

// ─── Rename ───────────────────────────────────────────────────────────────────

const editingId = ref<string | null>(null);
const editingOrigName = ref('');

function startEdit(id: string, currentName: string) {
  editingId.value = id;
  editingOrigName.value = currentName;
}

async function finishEdit(id: string, newName: string) {
  editingId.value = null;
  const trimmed = newName.trim();
  if (trimmed && trimmed !== editingOrigName.value) {
    await renameProject(id, trimmed);
  }
}

// ─── Drag to reorder ──────────────────────────────────────────────────────────

const dragId = ref<string | null>(null);
const dragOverId = ref<string | null>(null);

function onDragStart(id: string, e: DragEvent) {
  dragId.value = id;
  e.dataTransfer!.effectAllowed = 'move';
}

function onDragOver(id: string, e: DragEvent) {
  if (dragId.value && dragId.value !== id) {
    e.preventDefault();
    dragOverId.value = id;
  }
}

function onDrop(id: string) {
  if (!dragId.value || dragId.value === id) return;
  const ids = [...projects.value.keys()];
  const fromIdx = ids.indexOf(dragId.value);
  const toIdx = ids.indexOf(id);
  ids.splice(fromIdx, 1);
  ids.splice(toIdx, 0, dragId.value);
  reorderProjects(ids);
  dragId.value = null;
  dragOverId.value = null;
}

function onDragEnd() {
  dragId.value = null;
  dragOverId.value = null;
}

// ─── New project ──────────────────────────────────────────────────────────────

function openNewProject() {
  showModal.value = true;
}
</script>

<template>
  <div
    class="relative flex items-stretch bg-base min-h-10"
    role="toolbar"
    aria-label="Project toolbar"
  >
    <!-- ─── Mobile toolbar ────────────────────────────────────────────────── -->
    <div class="flex sm:hidden items-stretch w-full">
      <button
        class="shrink-0 h-10 px-3 flex items-center justify-center border-r border-subtle transition-colors"
        :class="
          showMobileMenu
            ? 'text-teal-400 bg-surface'
            : 'text-muted hover:text-teal-400 hover:bg-surface'
        "
        :aria-label="showMobileMenu ? 'Close menu' : 'Open menu'"
        :aria-expanded="showMobileMenu"
        aria-haspopup="true"
        @click="showMobileMenu ? closeMobileMenu() : (showMobileMenu = true)"
      >
        <UIcon
          :name="showMobileMenu ? 'i-lucide-x' : 'i-lucide-menu'"
          class="block shrink-0 w-5 h-5"
        />
      </button>
      <div class="flex-1 min-w-0 flex items-center px-3">
        <span
          v-if="activeProjectName"
          class="truncate text-sm font-medium text-teal-400"
          >{{ activeProjectName }}</span
        >
        <span v-else class="truncate text-sm font-medium text-muted"
          >cutlist<span class="text-teal-400">studio</span></span
        >
      </div>
      <div class="shrink-0 flex items-center px-2 border-l border-subtle">
        <button
          class="flex items-center gap-1 px-2 py-1 rounded border border-teal-400/40 text-teal-400 hover:bg-teal-400/10 hover:border-teal-400/70 transition-colors text-xs font-medium"
          title="New project"
          aria-label="New project"
          @click="openNewProject"
        >
          <UIcon name="i-lucide-plus" class="block shrink-0 w-3.5 h-3.5" />
          New
        </button>
      </div>
    </div>

    <!-- ─── Desktop toolbar ───────────────────────────────────────────────── -->
    <div
      class="hidden sm:flex shrink-0 items-center px-3 border-r border-subtle select-none"
    >
      <span class="text-sm font-semibold tracking-tight text-white"
        >cutlist</span
      ><span class="text-sm font-semibold tracking-tight text-teal-400"
        >studio</span
      >
    </div>
    <NuxtLink
      to="/"
      active-class=""
      exact-active-class="text-teal-400 bg-gradient-to-b from-teal-400/30 to-transparent"
      class="hidden sm:flex shrink-0 h-10 px-3 items-center justify-center border-r border-subtle text-muted hover:text-teal-400 hover:bg-surface transition-colors"
      title="Home"
      aria-label="Home"
    >
      <UIcon name="i-lucide-house" class="block shrink-0 w-4 h-4" />
    </NuxtLink>
    <NuxtLink
      to="/plans"
      active-class="text-teal-400 bg-gradient-to-b from-teal-400/30 to-transparent"
      class="hidden sm:flex shrink-0 h-10 px-3 items-center justify-center border-r border-subtle text-muted hover:text-teal-400 hover:bg-surface transition-colors"
      title="Browse plans"
      aria-label="Browse plans"
    >
      <UIcon name="i-lucide-hammer" class="block shrink-0 w-4 h-4" />
    </NuxtLink>
    <NuxtLink
      to="/projects"
      active-class="text-teal-400 bg-gradient-to-b from-teal-400/30 to-transparent"
      class="hidden sm:flex shrink-0 h-10 px-3 items-center justify-center border-r border-subtle text-muted hover:text-teal-400 hover:bg-surface transition-colors"
      title="Browse projects"
      aria-label="Browse projects"
    >
      <UIcon name="i-lucide-layout-grid" class="block shrink-0 w-4 h-4" />
    </NuxtLink>
    <TabList class="hidden sm:flex flex-1 min-w-0">
      <TabListItem
        v-for="[id, project] in projects"
        :key="id"
        :name="project.name"
        :active="id === activeId"
        :editing="editingId === id"
        :draggable="editingId !== id"
        :class="dragOverId === id ? 'border-l-2 border-teal-400' : ''"
        @click="setActiveProject(id)"
        @close="requestClose(id)"
        @dblclick="startEdit(id, project.name)"
        @rename="(name) => finishEdit(id, name)"
        @dragstart="(e: DragEvent) => onDragStart(id, e)"
        @dragover="(e: DragEvent) => onDragOver(id, e)"
        @drop="onDrop(id)"
        @dragend="onDragEnd"
      />
    </TabList>

    <div
      class="hidden sm:flex shrink-0 items-center px-2 border-l border-subtle"
    >
      <button
        class="flex items-center gap-1 px-2 py-1 rounded border border-teal-400/40 text-teal-400 hover:bg-teal-400/10 hover:border-teal-400/70 transition-colors text-xs font-medium"
        title="New project"
        aria-label="New project"
        @click="openNewProject"
      >
        <UIcon name="i-lucide-plus" class="block shrink-0 w-3.5 h-3.5" />
        New
      </button>
    </div>

    <button
      v-if="activeId"
      class="hidden sm:flex shrink-0 px-3 items-center gap-1.5 border-l border-subtle text-muted hover:text-teal-400 transition-colors"
      title="Export project"
      aria-label="Export project"
      @click="exportProject"
    >
      <UIcon name="i-lucide-download" class="block shrink-0 w-4 h-4" />
      <span class="text-xs">Export</span>
    </button>

    <button
      class="hidden sm:flex shrink-0 px-3 items-center gap-1.5 border-l border-subtle text-muted hover:text-teal-400 transition-colors"
      title="Export all projects as a single backup archive"
      aria-label="Export all projects"
      @click="exportAllProjects"
    >
      <UIcon name="i-lucide-archive" class="block shrink-0 w-4 h-4" />
      <span class="text-xs">Export all</span>
    </button>

    <button
      class="hidden sm:flex shrink-0 px-3 items-center gap-1.5 border-l border-subtle text-muted hover:text-teal-400 transition-colors"
      title="Import project"
      aria-label="Import project"
      @click="pickAndImport"
    >
      <UIcon name="i-lucide-upload" class="block shrink-0 w-4 h-4" />
      <span class="text-xs">Import</span>
    </button>

    <button
      v-if="feedbackEnabled"
      class="hidden sm:flex shrink-0 px-3 items-center gap-1.5 border-l border-subtle text-muted hover:text-teal-400 transition-colors"
      title="Report an issue"
      aria-label="Report an issue"
      @click="openFeedback"
    >
      <UIcon name="i-lucide-life-buoy" class="block shrink-0 w-4 h-4" />
      <span class="text-xs">Help</span>
    </button>

    <!-- ─── Mobile menu panel ─────────────────────────────────────────────── -->
    <Transition
      enter-active-class="transition ease-out duration-150"
      enter-from-class="opacity-0 -translate-y-2"
      enter-to-class="opacity-100 translate-y-0"
      leave-active-class="transition ease-in duration-100"
      leave-from-class="opacity-100 translate-y-0"
      leave-to-class="opacity-0 -translate-y-2"
    >
      <div
        v-if="showMobileMenu"
        class="sm:hidden absolute top-10 inset-x-0 z-50 bg-elevated border-b border-default shadow-2xl max-h-[calc(100vh-2.5rem)] overflow-y-auto"
      >
        <!-- Home -->
        <NuxtLink
          to="/"
          active-class=""
          exact-active-class="text-teal-400 bg-surface"
          class="flex items-center gap-3 w-full px-4 py-3 text-left border-b border-subtle text-body hover:bg-surface transition-colors"
          @click="showMobileMenu = false"
        >
          <UIcon name="i-lucide-house" class="w-4 h-4 shrink-0" />
          <span class="text-sm">Home</span>
        </NuxtLink>

        <!-- Plans -->
        <NuxtLink
          to="/plans"
          active-class="text-teal-400 bg-surface"
          class="flex items-center gap-3 w-full px-4 py-3 text-left border-b border-subtle text-body hover:bg-surface transition-colors"
          @click="showMobileMenu = false"
        >
          <UIcon name="i-lucide-hammer" class="w-4 h-4 shrink-0" />
          <span class="text-sm">Plans</span>
        </NuxtLink>

        <!-- Projects -->
        <NuxtLink
          to="/projects"
          active-class="text-teal-400 bg-surface"
          class="flex items-center gap-3 w-full px-4 py-3 text-left border-b border-subtle text-body hover:bg-surface transition-colors"
          @click="showMobileMenu = false"
        >
          <UIcon name="i-lucide-layout-grid" class="w-4 h-4 shrink-0" />
          <span class="text-sm">Projects</span>
        </NuxtLink>

        <!-- Open projects -->
        <div
          v-if="allProjects.length > 0"
          class="px-4 pt-3 pb-1 text-xs font-semibold text-muted uppercase tracking-wider"
        >
          Open projects
        </div>
        <ul v-if="allProjects.length > 0">
          <li
            v-for="[id, project] in allProjects"
            :key="id"
            class="flex items-center border-b border-subtle"
            :class="
              id === activeId
                ? 'bg-gradient-to-r from-teal-400/15 to-transparent'
                : ''
            "
          >
            <button
              class="flex-1 min-w-0 flex items-center gap-2 px-4 py-3 text-left transition-colors"
              :class="id === activeId ? 'cursor-default' : 'hover:bg-surface'"
              :aria-current="id === activeId ? 'page' : undefined"
              @click="selectProjectFromMenu(id)"
            >
              <UIcon
                :name="
                  id === activeId ? 'i-lucide-circle-dot' : 'i-lucide-file'
                "
                class="w-4 h-4 shrink-0"
                :class="id === activeId ? 'text-teal-400' : 'text-muted'"
              />
              <span
                class="truncate text-sm"
                :class="
                  id === activeId ? 'text-teal-400 font-medium' : 'text-body'
                "
                >{{ project.name }}</span
              >
              <span
                v-if="id === activeId"
                class="ml-auto text-[10px] uppercase tracking-wider text-teal-400/70"
                >Active</span
              >
            </button>
            <button
              class="shrink-0 px-3 py-3 text-muted hover:text-white transition-colors"
              :aria-label="`Close ${project.name}`"
              @click.stop="requestClose(id)"
            >
              <UIcon name="i-lucide-x" class="w-4 h-4" />
            </button>
          </li>
        </ul>

        <!-- Actions -->
        <div
          class="px-4 pt-3 pb-1 text-xs font-semibold text-muted uppercase tracking-wider"
        >
          Actions
        </div>
        <button
          class="flex items-center gap-3 w-full px-4 py-3 text-left text-body hover:bg-surface border-b border-subtle transition-colors"
          @click="openNewProjectFromMenu"
        >
          <UIcon name="i-lucide-plus" class="w-4 h-4 shrink-0 text-teal-400" />
          <span class="text-sm">New project</span>
        </button>
        <button
          v-if="activeId"
          class="flex items-center gap-3 w-full px-4 py-3 text-left text-body hover:bg-surface border-b border-subtle transition-colors"
          @click="handleExportFromMenu"
        >
          <UIcon name="i-lucide-download" class="w-4 h-4 shrink-0" />
          <span class="text-sm">Export project</span>
        </button>
        <button
          class="flex items-center gap-3 w-full px-4 py-3 text-left text-body hover:bg-surface border-b border-subtle transition-colors"
          @click="handleImportFromMenu"
        >
          <UIcon name="i-lucide-upload" class="w-4 h-4 shrink-0" />
          <span class="text-sm">Import project</span>
        </button>
        <button
          v-if="feedbackEnabled"
          class="flex items-center gap-3 w-full px-4 py-3 text-left text-body hover:bg-surface border-b border-subtle transition-colors"
          @click="openFeedbackFromMenu"
        >
          <UIcon name="i-lucide-life-buoy" class="w-4 h-4 shrink-0" />
          <span class="text-sm">Report an issue</span>
        </button>

        <!-- About / Terms -->
        <div class="flex items-center gap-4 px-4 py-3 border-t border-subtle">
          <NuxtLink
            to="/about"
            class="text-sm text-muted hover:text-body transition-colors"
            @click="closeMobileMenu"
          >
            About
          </NuxtLink>
          <NuxtLink
            to="/terms"
            class="text-sm text-muted hover:text-body transition-colors"
            @click="closeMobileMenu"
          >
            Terms of Use
          </NuxtLink>
        </div>
      </div>
    </Transition>

    <div
      v-if="showMobileMenu"
      class="sm:hidden fixed inset-0 top-10 z-40 bg-black/50"
      aria-hidden="true"
      @click="closeMobileMenu"
    />

    <UModal
      :open="!!pendingCloseId"
      title="Close Project"
      description="Confirm closing project"
      @update:open="
        (v: boolean) => {
          if (!v) cancelClose();
        }
      "
    >
      <template #content>
        <div class="p-6 space-y-4 bg-elevated border border-default rounded-lg">
          <div class="flex items-center justify-between">
            <h3 class="text-lg font-medium text-white">Close project?</h3>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              icon="i-lucide-x"
              class="rounded-full"
              @click="cancelClose"
            />
          </div>
          <p class="text-sm text-muted">
            <span class="text-body font-medium">{{ pendingCloseName }}</span>
            will close, but stays in your Projects list — open it again anytime.
          </p>
          <div class="flex justify-end gap-2">
            <UButton color="neutral" variant="ghost" @click="cancelClose">
              Cancel
            </UButton>
            <UButton color="primary" @click="confirmClose">
              Close project
            </UButton>
          </div>
        </div>
      </template>
    </UModal>

    <NewProjectDialog v-model:open="showModal" />
  </div>
</template>
