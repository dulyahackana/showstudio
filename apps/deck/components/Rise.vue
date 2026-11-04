<script setup lang="ts">
// Fades and lifts its content in when the slide is entered; `delay` staggers siblings.
const props = withDefaults(defineProps<{ delay?: number; y?: number; x?: number; scale?: number }>(), {
  delay: 0,
  y: 22,
  x: 0,
  scale: 1,
})
</script>

<template>
  <div
    v-motion
    :initial="{ opacity: 0, y: props.y, x: props.x, scale: props.scale }"
    :enter="{
      opacity: 1,
      y: 0,
      x: 0,
      scale: 1,
      transition: { delay: props.delay, duration: 750, ease: [0.22, 1, 0.36, 1] },
    }"
  >
    <slot />
  </div>
</template>
