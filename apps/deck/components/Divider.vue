<script setup lang="ts">
// Section opener: a giant outlined numeral, the part title and its one-line thesis.
const props = defineProps<{ n: string; title: string; thesis: string }>()
</script>

<template>
  <div class="divider">
    <div
      v-motion
      class="divider-n"
      :initial="{ opacity: 0, scale: 0.9, x: -30 }"
      :enter="{ opacity: 1, scale: 1, x: 0, transition: { duration: 1000, ease: [0.22, 1, 0.36, 1] } }"
    >
      {{ props.n }}
    </div>
    <div
      v-motion
      :initial="{ opacity: 0, y: 24 }"
      :enter="{ opacity: 1, y: 0, transition: { delay: 250, duration: 800, ease: [0.22, 1, 0.36, 1] } }"
    >
      <div class="kicker">Part {{ props.n }}</div>
      <h1 class="divider-title">{{ props.title }}</h1>
      <p class="lede text-lg">{{ props.thesis }}</p>
    </div>
  </div>
</template>
