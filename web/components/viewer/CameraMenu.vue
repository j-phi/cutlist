<script lang="ts" setup>
/**
 * Camera-icon dropdown — projection (Perspective / Orthographic) plus the
 * floor-grid toggle. Sits next to the ViewCube; keeping orientation snaps
 * (cube) separate from camera-mode (this menu) avoids cramming the same
 * widget with two different concerns.
 */
import type { CameraMode } from '~/utils/types';

const props = defineProps<{
  cameraMode: CameraMode;
  floorVisible: boolean;
}>();

const emit = defineEmits<{
  'update:cameraMode': [mode: CameraMode];
  'update:floorVisible': [visible: boolean];
}>();

const open = ref(false);
</script>

<template>
  <UPopover
    v-model:open="open"
    :content="{ side: 'bottom', align: 'end', sideOffset: 4 }"
  >
    <UButton
      size="sm"
      variant="soft"
      color="neutral"
      icon="i-lucide-camera"
      :ui="{ base: 'rounded-lg' }"
      title="Camera options"
    />

    <template #content>
      <div class="p-2 min-w-[180px] flex flex-col gap-1 text-sm">
        <span class="px-2 pt-1 pb-1 text-xs font-medium text-muted">
          Projection
        </span>
        <button
          type="button"
          class="menu-row"
          :class="{ active: props.cameraMode === 'perspective' }"
          @click="
            emit('update:cameraMode', 'perspective');
            open = false;
          "
        >
          <UIcon
            :name="
              props.cameraMode === 'perspective'
                ? 'i-lucide-circle-dot'
                : 'i-lucide-circle'
            "
            class="text-base"
          />
          Perspective
        </button>
        <button
          type="button"
          class="menu-row"
          :class="{ active: props.cameraMode === 'orthographic' }"
          @click="
            emit('update:cameraMode', 'orthographic');
            open = false;
          "
        >
          <UIcon
            :name="
              props.cameraMode === 'orthographic'
                ? 'i-lucide-circle-dot'
                : 'i-lucide-circle'
            "
            class="text-base"
          />
          Orthographic
        </button>

        <div class="border-t border-subtle my-1" />

        <button
          type="button"
          class="menu-row"
          @click="emit('update:floorVisible', !props.floorVisible)"
        >
          <UIcon
            :name="
              props.floorVisible ? 'i-lucide-square-check' : 'i-lucide-square'
            "
            class="text-base"
            :class="props.floorVisible ? 'text-teal-400' : 'text-muted'"
          />
          Show floor
        </button>
      </div>
    </template>
  </UPopover>
</template>

<style scoped>
.menu-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0.5rem;
  border-radius: 0.375rem;
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: none;
  color: var(--ui-text-muted, #9ca8ab);
  font-size: 12px;
  text-align: left;
  transition:
    background 0.12s,
    color 0.12s;
}

.menu-row:hover {
  background: rgba(255, 255, 255, 0.04);
  color: #e3e7e8;
}

.menu-row.active {
  color: #6ee7b7;
}
</style>
