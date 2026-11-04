<script setup lang="ts">
import { useNav } from '@slidev/client'
import { computed } from 'vue'

// A thin glowing progress line and a quiet page counter on every slide after the cover.
const { currentPage, total } = useNav()
const width = computed(() => `${((currentPage.value - 1) / Math.max(1, total.value - 1)) * 100}%`)
const counter = computed(
  () => `${String(currentPage.value).padStart(2, '0')} / ${String(total.value).padStart(2, '0')}`,
)
</script>

<template>
  <template v-if="currentPage > 1">
    <div class="deck-progress" :style="{ width }" />
    <div class="deck-counter">{{ counter }}</div>
  </template>
</template>
