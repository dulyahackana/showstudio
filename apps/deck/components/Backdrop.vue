<script setup lang="ts">
import { computed } from 'vue'

// Full-bleed image behind a slide, faded into the background.
const props = withDefaults(defineProps<{ name: string; opacity?: number }>(), { opacity: 0.45 })
const src = computed(() => `${import.meta.env.BASE_URL}shots/${props.name}.jpg`)
</script>

<template>
  <div class="backdrop" aria-hidden="true">
    <img :src="src" :style="{ opacity: props.opacity }" alt="" />
  </div>
</template>
