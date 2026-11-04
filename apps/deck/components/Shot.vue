<script setup lang="ts">
import { computed } from 'vue'

// A product screenshot in a window frame. Images live in public/shots, so the path works
// under any base URL (GitHub Pages serves the deck from /<repository>/).
const props = withDefaults(defineProps<{ name: string; label?: string; tilt?: 'left' | 'right' | 'none' }>(), {
  label: '',
  tilt: 'none',
})
const src = computed(() => `${import.meta.env.BASE_URL}shots/${props.name}.jpg`)
</script>

<template>
  <figure class="shot-frame" :class="`tilt-${props.tilt}`">
    <div class="shot-bar">
      <i /><i /><i />
      <span>{{ props.label }}</span>
    </div>
    <img :src="src" :alt="props.label" />
  </figure>
</template>
