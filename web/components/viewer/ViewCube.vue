<script lang="ts" setup>
/**
 * View cube + projection toggle.
 *
 * Floats top-right of the canvas. The cube is a CSS-3D widget with six face
 * buttons (top/bottom/front/back/left/right) plus an iso button — each click
 * emits `snap` with the preset name so the viewer can realign its camera.
 *
 * Unlike a static decorative cube, this widget tracks the camera's
 * orientation: as the user orbits, the cube rotates in lockstep so a glance
 * at the widget always reveals which face the camera is looking at. The
 * rotation comes from `cameraDirection` — the normalized target → position
 * vector — converted to yaw / pitch and applied via CSS transform.
 *
 * The projection toggle below switches between perspective and orthographic
 * (active mode highlighted), and a floor toggle controls the grid plane.
 */
import type { CameraMode } from '~/composables/useIdb';
import type { ViewPreset } from '~/lib/viewer/types';

const props = defineProps<{
  cameraDirection: { x: number; y: number; z: number };
  cameraMode: CameraMode;
  floorVisible: boolean;
}>();

const emit = defineEmits<{
  snap: [preset: ViewPreset];
  'update:cameraMode': [mode: CameraMode];
  'update:floorVisible': [visible: boolean];
}>();

const cubeTransform = computed(() => {
  const d = props.cameraDirection;
  const len = Math.hypot(d.x, d.y, d.z) || 1;
  const x = d.x / len;
  const y = d.y / len;
  const z = d.z / len;
  // CSS rotateY(+) goes +Z → -X (left-hand from screen's PoV); world dir
  // uses the right-hand convention. Negate yaw so the +X preset brings the
  // face-right element to the front of the cube.
  const yaw = -Math.atan2(x, z);
  const pitch = Math.asin(Math.max(-1, Math.min(1, y)));
  return `rotateX(${-pitch}rad) rotateY(${yaw}rad)`;
});

function snap(preset: ViewPreset) {
  emit('snap', preset);
}

function setMode(mode: CameraMode) {
  emit('update:cameraMode', mode);
}

function toggleFloor(visible: boolean) {
  emit('update:floorVisible', visible);
}
</script>

<template>
  <div class="flex flex-col items-end gap-2">
    <div class="cube-wrap">
      <div class="cube" :style="{ transform: cubeTransform }">
        <button
          type="button"
          class="face face-front"
          aria-label="Front view"
          @click="snap('front')"
        >
          Front
        </button>
        <button
          type="button"
          class="face face-back"
          aria-label="Back view"
          @click="snap('back')"
        >
          Back
        </button>
        <button
          type="button"
          class="face face-right"
          aria-label="Right view"
          @click="snap('right')"
        >
          Right
        </button>
        <button
          type="button"
          class="face face-left"
          aria-label="Left view"
          @click="snap('left')"
        >
          Left
        </button>
        <button
          type="button"
          class="face face-top"
          aria-label="Top view"
          @click="snap('top')"
        >
          Top
        </button>
        <button
          type="button"
          class="face face-bottom"
          aria-label="Bottom view"
          @click="snap('bottom')"
        >
          Bot
        </button>
      </div>
      <button
        type="button"
        class="iso-btn"
        aria-label="Isometric view"
        title="Isometric"
        @click="snap('iso')"
      >
        Iso
      </button>
    </div>

    <div
      class="bg-overlay backdrop-blur border border-subtle rounded-lg p-1 flex gap-1"
    >
      <button
        type="button"
        class="mode-btn"
        :class="{ active: cameraMode === 'perspective' }"
        title="Perspective projection"
        @click="setMode('perspective')"
      >
        Persp
      </button>
      <button
        type="button"
        class="mode-btn"
        :class="{ active: cameraMode === 'orthographic' }"
        title="Orthographic projection"
        @click="setMode('orthographic')"
      >
        Ortho
      </button>
    </div>

    <button
      type="button"
      class="floor-btn bg-overlay backdrop-blur border border-subtle rounded-lg flex items-center gap-1.5"
      :class="{ active: floorVisible }"
      :aria-pressed="floorVisible"
      :title="floorVisible ? 'Hide floor' : 'Show floor'"
      @click="toggleFloor(!floorVisible)"
    >
      <span class="floor-icon" aria-hidden="true">
        <svg width="12" height="12" viewBox="0 0 14 14" fill="none">
          <path
            d="M1 11h12M3 11l3-7M11 11l-3-7M5 11l1-3M9 11l-1-3"
            stroke="currentColor"
            stroke-width="1.2"
            stroke-linecap="round"
          />
        </svg>
      </span>
      Floor
    </button>
  </div>
</template>

<style scoped>
.cube-wrap {
  position: relative;
  width: 78px;
  height: 78px;
  perspective: 400px;
}

.cube {
  position: absolute;
  inset: 14px;
  transform-style: preserve-3d;
  will-change: transform;
}

.face {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: var(--ui-text-muted, #9ca8ab);
  background: rgba(22, 27, 29, 0.85);
  border: 1px solid rgba(255, 255, 255, 0.08);
  cursor: pointer;
  user-select: none;
  backface-visibility: hidden;
  transition:
    background 0.12s,
    color 0.12s,
    border-color 0.12s;
}

.face:hover {
  background: rgba(45, 212, 191, 0.18);
  color: #6ee7b7;
  border-color: rgba(45, 212, 191, 0.5);
}

.face-front {
  transform: translateZ(25px);
}
.face-back {
  transform: rotateY(180deg) translateZ(25px);
}
.face-right {
  transform: rotateY(90deg) translateZ(25px);
}
.face-left {
  transform: rotateY(-90deg) translateZ(25px);
}
.face-top {
  transform: rotateX(90deg) translateZ(25px);
}
.face-bottom {
  transform: rotateX(-90deg) translateZ(25px);
}

.iso-btn {
  position: absolute;
  bottom: -2px;
  right: -2px;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  background: rgba(22, 27, 29, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: var(--ui-text-muted, #9ca8ab);
  font-size: 10px;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
  display: flex;
  align-items: center;
  justify-content: center;
  transition:
    background 0.12s,
    color 0.12s,
    border-color 0.12s;
}

.iso-btn:hover {
  background: rgba(45, 212, 191, 0.22);
  color: #6ee7b7;
  border-color: rgba(45, 212, 191, 0.55);
}

.mode-btn {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ui-text-muted, #9ca8ab);
  padding: 4px 10px;
  border-radius: 6px;
  cursor: pointer;
  user-select: none;
  background: transparent;
  border: none;
  transition:
    background 0.12s,
    color 0.12s;
}

.mode-btn:hover {
  color: #e3e7e8;
}

.mode-btn.active {
  background: rgba(45, 212, 191, 0.22);
  color: #6ee7b7;
}

.floor-btn {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.03em;
  color: var(--ui-text-muted, #9ca8ab);
  padding: 5px 10px;
  cursor: pointer;
  user-select: none;
  transition:
    background 0.12s,
    color 0.12s,
    border-color 0.12s;
}

.floor-btn:hover {
  color: #e3e7e8;
}

.floor-btn.active {
  color: #6ee7b7;
  border-color: rgba(45, 212, 191, 0.55);
  background: rgba(45, 212, 191, 0.18);
}

.floor-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
</style>
