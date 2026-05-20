<script setup>
import { computed, watch, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'

const route = useRoute()
const isFullscreen = computed(() => route.meta?.fullscreen)
const isLanding = computed(() => route.meta?.landing)
const showBackHome = computed(
  () => route.name !== 'Home' && !isFullscreen.value,
)

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
  <div
    class="app-root"
    :class="{
      'app-root--fullscreen': isFullscreen || isLanding,
      'app-root--landing': isLanding,
    }"
  >
    <nav v-if="showBackHome" class="app-nav">
      <router-link to="/" class="app-nav-link">← 返回首页</router-link>
    </nav>
    <main
      class="app-main"
      :class="{
        'app-main--fullscreen': isFullscreen || isLanding,
        'app-main--landing': isLanding,
      }"
    >
      <router-view />
    </main>
  </div>
</template>

<style scoped>
.app-nav {
  padding: 0.75rem 1.5rem;
  border-bottom: 1px solid var(--border);
}

.app-nav-link {
  font-size: 0.92rem;
  font-weight: 600;
  text-decoration: none;
  color: var(--accent);
}

.app-nav-link:hover {
  text-decoration: underline;
}

.app-main--landing {
  padding: 0;
}

.app-root--landing {
  text-align: left;
}

.app-root--fullscreen {
  display: flex;
  flex-direction: column;
  flex: 1;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  text-align: left;
}

.app-main--fullscreen {
  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.app-main--fullscreen > * {
  flex: 1;
  min-height: 0;
  width: 100%;
}
</style>
