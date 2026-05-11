<script lang="ts" setup>
/**
 * Teal radial spotlight + faded grid backdrop used behind hero sections on
 * the landing page and the plans directory. Renders absolutely-positioned
 * decorative layers — the parent must be `position: relative` and provide
 * its own height. Pointer-events disabled so it never blocks interaction.
 */

type Position = 'center' | 'top';

const props = withDefaults(defineProps<{ position?: Position }>(), {
  position: 'center',
});

const style = computed(() => {
  const y = props.position === 'top' ? '0%' : '45%';
  const maskY = props.position === 'top' ? '0%' : '50%';
  return {
    '--hero-spotlight-y': y,
    '--hero-grid-mask-y': maskY,
  };
});
</script>

<template>
  <div
    class="absolute inset-0 pointer-events-none select-none"
    :style="style"
    aria-hidden="true"
  >
    <div class="absolute inset-0 hero-spotlight" />
    <div class="absolute inset-0 hero-grid" />
  </div>
</template>

<style scoped>
.hero-spotlight {
  background-image: radial-gradient(
    ellipse 120% 70% at 50% var(--hero-spotlight-y),
    rgba(20, 184, 166, 0.2) 0%,
    rgba(20, 184, 166, 0.09) 35%,
    transparent 75%
  );
}

@media (min-width: 640px) {
  .hero-spotlight {
    background-image: radial-gradient(
      ellipse 60% 50% at 50% var(--hero-spotlight-y),
      rgba(20, 184, 166, 0.18) 0%,
      rgba(20, 184, 166, 0.08) 35%,
      transparent 75%
    );
  }
}

.hero-grid {
  background-image:
    linear-gradient(rgba(20, 184, 166, 0.18) 1px, transparent 1px),
    linear-gradient(90deg, rgba(20, 184, 166, 0.18) 1px, transparent 1px);
  background-size: 24px 24px;
  background-position: center center;
  mask-image: radial-gradient(
    ellipse 70% 60% at 50% var(--hero-grid-mask-y),
    black 0%,
    transparent 100%
  );
  -webkit-mask-image: radial-gradient(
    ellipse 70% 60% at 50% var(--hero-grid-mask-y),
    black 0%,
    transparent 100%
  );
}
</style>
