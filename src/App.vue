<script setup>
import { computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isFullscreen = computed(() => route.meta?.fullscreen)

watch(
  isFullscreen,
  (fullscreen) => {
    document.documentElement.classList.toggle('page-no-scroll', fullscreen)
    document.getElementById('app')?.classList.toggle('app-mount--fullscreen', fullscreen)
  },
  { immediate: true },
)

onUnmounted(() => {
  document.documentElement.classList.remove('page-no-scroll')
  document.getElementById('app')?.classList.remove('app-mount--fullscreen')
})
</script>

<template>
  <div class="app-root" :class="{ 'app-root--fullscreen': isFullscreen }">
    <nav v-if="!isFullscreen">
      <router-link to="/">Home</router-link>
      |
      <router-link to="/about">About</router-link>
      |
      <router-link to="/article">Article</router-link>
      |
      <router-link to="/dashboard">数据大屏</router-link>
    </nav>
    <main class="app-main" :class="{ 'app-main--fullscreen': isFullscreen }">
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-root--fullscreen {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  text-align: left;
}

.app-main--fullscreen {
  flex: 1;
  min-height: 0;
  overflow: hidden;
  display: flex;
}
</style>
