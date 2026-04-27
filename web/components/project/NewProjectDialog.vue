<script lang="ts" setup>
const open = defineModel<boolean>('open', { default: false });

const { addProject } = useProjects();
const toast = useToast();
const projectName = ref('');
const unit = ref<'mm' | 'in'>('mm');

watch(open, (v) => {
  if (v) {
    projectName.value = '';
    unit.value = 'mm';
  }
});

async function createProject() {
  const name = projectName.value.trim();
  if (!name) return;
  try {
    await addProject(name, unit.value);
    open.value = false;
  } catch (err) {
    toast.add({
      title: 'Failed to create project',
      description: err instanceof Error ? err.message : String(err),
      color: 'error',
    });
  }
}
</script>

<template>
  <UModal
    v-model:open="open"
    title="New Project"
    description="Create a new project"
  >
    <template #content>
      <div class="p-6 space-y-4 bg-elevated border border-default rounded-lg">
        <div class="flex items-center justify-between">
          <h3 class="text-lg font-medium text-white">New Project</h3>
          <UButton
            size="xs"
            color="neutral"
            variant="ghost"
            icon="i-lucide-x"
            class="rounded-full"
            @click="open = false"
          />
        </div>
        <UInput
          v-model="projectName"
          placeholder="Project name"
          class="w-full"
          autofocus
          @keydown.enter="createProject"
        />
        <div>
          <label class="block text-xs text-muted mb-1.5">Units</label>
          <div
            class="flex gap-1 p-0.5 rounded-lg bg-surface border border-subtle"
          >
            <button
              class="flex-1 py-1.5 text-sm font-medium rounded-md transition-colors"
              :class="
                unit === 'mm'
                  ? 'bg-teal-500 text-black'
                  : 'text-muted hover:text-body'
              "
              @click="unit = 'mm'"
            >
              mm
            </button>
            <button
              class="flex-1 py-1.5 text-sm font-medium rounded-md transition-colors"
              :class="
                unit === 'in'
                  ? 'bg-teal-500 text-black'
                  : 'text-muted hover:text-body'
              "
              @click="unit = 'in'"
            >
              inch
            </button>
          </div>
        </div>
        <div class="flex justify-end gap-2">
          <UButton color="neutral" variant="ghost" @click="open = false">
            Cancel
          </UButton>
          <UButton
            color="primary"
            :disabled="!projectName.trim()"
            @click="createProject"
          >
            Create
          </UButton>
        </div>
      </div>
    </template>
  </UModal>
</template>
