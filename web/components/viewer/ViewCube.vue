<script lang="ts" setup>
/**
 * Orientation widget — CSS-3D cube with face buttons (top/bottom/front/back/
 * left/right) plus an Iso button. Each click emits `snap` with the preset.
 *
 * The cube tracks the camera so a glance reveals which face the camera is
 * looking at. Yaw/pitch are derived from the camera's target → position
 * vector.
 */
import type { ViewPreset } from '~/lib/viewer/types';

const props = defineProps<{
  cameraDirection: { x: number; y: number; z: number };
}>();

const emit = defineEmits<{
  snap: [preset: ViewPreset];
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
</script>

<template>
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
</style>
