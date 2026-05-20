<template>
  <div ref="homeRef" class="home">
    <div class="home-atmosphere" aria-hidden="true">
      <span class="home-blob home-blob--1"></span>
      <span class="home-blob home-blob--2"></span>
      <span class="home-blob home-blob--3"></span>
    </div>

    <div class="home-shell">
      <header class="home-top">
        <span class="home-brand">Vue Demo</span>
        <span class="home-time">{{ currentTime }}</span>
      </header>

      <div class="home-stage">
        <div class="home-visual-wrap">
          <div class="home-visual-glow" aria-hidden="true"></div>
          <HomeHero3D />
          <p class="home-visual-hint">拖拽旋转 · 滚轮缩放</p>
        </div>

        <div class="home-copy">
          <p class="home-eyebrow">Vue 实验集</p>
          <h1 class="home-title" aria-label="用实验页面探索前端可能">
            <span class="title-line">用实验页面</span>
            <span class="title-line title-line--accent">探索前端可能</span>
          </h1>
          <p class="home-desc">
            集中展示 Three.js、路由与交互实验。新增页面只需在
            <code>src/config/pages.js</code>
            注册即可出现在底部导航。
          </p>

          <div class="home-actions">
            <router-link
              v-if="featuredPage"
              :to="featuredPage.path"
              class="home-primary"
            >
              <span>进入 {{ featuredPage.title }}</span>
              <span class="home-primary-arrow">→</span>
            </router-link>
            <span class="home-meta">{{ appPages.length }} 个实验页面</span>
          </div>
        </div>
      </div>

      <footer class="home-footer">
        <nav class="home-dock" aria-label="页面导航">
          <router-link
            v-for="page in appPages"
            :key="page.path"
            :to="page.path"
            class="home-dock-item"
            active-class="home-dock-item--active"
          >
            {{ page.navLabel || page.title }}
          </router-link>
        </nav>
      </footer>
    </div>
  </div>
</template>

<script setup>
/**
 * GSAP：入场 timeline + dock 悬停微动效
 */
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { gsap } from 'gsap'
import { appPages } from '../config/pages'
import HomeHero3D from '../components/HomeHero3D.vue'

const homeRef = ref(null)
const currentTime = ref('')

const featuredPage = computed(
  () => appPages.find((p) => p.path === '/dashboard') ?? appPages[0],
)

let ctx
let clockTimer

function updateClock() {
  const now = new Date()
  currentTime.value = now.toLocaleTimeString('zh-CN', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  })
}

onMounted(() => {
  updateClock()
  clockTimer = window.setInterval(updateClock, 30_000)

  if (!homeRef.value) return

  ctx = gsap.context(() => {
    const mm = gsap.matchMedia()

    mm.add('(prefers-reduced-motion: reduce)', () => {
      gsap.set(
        '.home-blob, .home-visual-wrap, .title-line, .home-eyebrow, .home-desc, .home-actions, .home-dock',
        { clearProps: 'all' },
      )
    })

    mm.add('(prefers-reduced-motion: no-preference)', () => {
      gsap.to('.home-blob--1', {
        x: 24,
        y: -16,
        duration: 8,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      })
      gsap.to('.home-blob--2', {
        x: -18,
        y: 20,
        duration: 10,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: 0.6,
      })

      const intro = gsap.timeline({ defaults: { ease: 'power3.out' } })

      intro
        .from('.home-brand, .home-time', {
          autoAlpha: 0,
          y: -8,
          duration: 0.45,
          stagger: 0.06,
        })
        .from(
          '.home-visual-wrap',
          { autoAlpha: 0, y: 24, scale: 0.97, duration: 0.9 },
          '-=0.15',
        )
        .from(
          '.title-line',
          { autoAlpha: 0, y: 36, duration: 0.75, stagger: 0.12 },
          '-=0.55',
        )
        .from(
          '.home-eyebrow, .home-desc',
          { autoAlpha: 0, y: 14, duration: 0.55, stagger: 0.08 },
          '-=0.45',
        )
        .from(
          '.home-actions',
          { autoAlpha: 0, y: 12, duration: 0.5 },
          '-=0.25',
        )
        .from(
          '.home-dock',
          { autoAlpha: 0, y: 16, duration: 0.55 },
          '-=0.2',
        )

      const dockCleanups = []

      gsap.utils.toArray('.home-dock-item').forEach((item) => {
        const enter = () => gsap.to(item, { y: -1, duration: 0.22, ease: 'power2.out' })
        const leave = () => gsap.to(item, { y: 0, duration: 0.28, ease: 'power2.out' })
        item.addEventListener('mouseenter', enter)
        item.addEventListener('mouseleave', leave)
        item.addEventListener('focusin', enter)
        item.addEventListener('focusout', leave)
        dockCleanups.push(() => {
          item.removeEventListener('mouseenter', enter)
          item.removeEventListener('mouseleave', leave)
          item.removeEventListener('focusin', enter)
          item.removeEventListener('focusout', leave)
        })
      })

      return () => dockCleanups.forEach((cleanup) => cleanup())
    })
  }, homeRef.value)
})

onUnmounted(() => {
  if (clockTimer) clearInterval(clockTimer)
  ctx?.revert()
})
</script>

<style scoped>
.home {
  --home-bg: #edf3f8;
  --home-surface: rgba(255, 255, 255, 0.82);
  --home-text: #152535;
  --home-muted: rgba(21, 37, 53, 0.58);
  --home-accent: #2f6f9f;
  --home-accent-soft: rgba(47, 111, 159, 0.12);
  --home-border: rgba(21, 37, 53, 0.08);
  --home-shadow: 0 24px 60px rgba(21, 37, 53, 0.08);

  position: relative;
  min-height: 100vh;
  overflow: hidden;
  color: var(--home-text);
  background:
    radial-gradient(ellipse 80% 60% at 15% 20%, rgba(168, 210, 240, 0.45), transparent 60%),
    radial-gradient(ellipse 70% 50% at 85% 75%, rgba(232, 210, 196, 0.35), transparent 55%),
    linear-gradient(165deg, #eef5fa 0%, #f6f3ef 48%, #edf2f7 100%);
}

.home-atmosphere {
  position: absolute;
  inset: 0;
  pointer-events: none;
  overflow: hidden;
}

.home-blob {
  position: absolute;
  border-radius: 50%;
  filter: blur(60px);
  opacity: 0.55;
  will-change: transform;
}

.home-blob--1 {
  top: 8%;
  left: -6%;
  width: 22rem;
  height: 22rem;
  background: rgba(130, 190, 230, 0.5);
}

.home-blob--2 {
  right: -4%;
  bottom: 12%;
  width: 18rem;
  height: 18rem;
  background: rgba(220, 180, 160, 0.38);
}

.home-blob--3 {
  top: 42%;
  left: 38%;
  width: 12rem;
  height: 12rem;
  background: rgba(180, 220, 245, 0.35);
}

.home-shell {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(1180px, 100%);
  min-height: 100vh;
  margin: 0 auto;
  padding: clamp(1.25rem, 2.5vw, 2rem) clamp(1.25rem, 4vw, 3rem)
    clamp(1.5rem, 3vw, 2.25rem);
}

.home-top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: clamp(1rem, 2vw, 1.75rem);
}

.home-brand,
.home-time {
  font-size: 0.88rem;
  font-weight: 500;
  letter-spacing: 0.02em;
  color: var(--home-muted);
}

.home-stage {
  display: grid;
  flex: 1;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 0.85fr);
  gap: clamp(1.5rem, 4vw, 3.5rem);
  align-items: center;
  min-height: 0;
}

.home-visual-wrap {
  position: relative;
  display: flex;
  flex-direction: column;
  height: min(68vh, 640px);
  min-height: 360px;
  overflow: hidden;
  background: var(--home-surface);
  border: 1px solid rgba(255, 255, 255, 0.95);
  border-radius: 28px;
  box-shadow: var(--home-shadow);
  backdrop-filter: blur(12px);
}

.home-visual-glow {
  position: absolute;
  inset: 10% 8% 18%;
  pointer-events: none;
  background: radial-gradient(
    ellipse at 50% 55%,
    rgba(120, 185, 230, 0.28) 0%,
    rgba(120, 185, 230, 0.06) 45%,
    transparent 72%
  );
}

.home-visual-wrap :deep(.hero-canvas) {
  flex: 1;
  min-height: 0;
}

.home-visual-hint {
  position: absolute;
  bottom: 1rem;
  left: 50%;
  margin: 0;
  padding: 0.35rem 0.85rem;
  font-size: 0.75rem;
  font-weight: 500;
  letter-spacing: 0.06em;
  color: var(--home-muted);
  background: rgba(255, 255, 255, 0.72);
  border: 1px solid var(--home-border);
  border-radius: 999px;
  transform: translateX(-50%);
  backdrop-filter: blur(8px);
}

.home-copy {
  display: flex;
  flex-direction: column;
  justify-content: center;
  max-width: 26rem;
  padding: 0.5rem 0;
}

.home-eyebrow {
  margin: 0 0 0.85rem;
  font-size: 0.78rem;
  font-weight: 600;
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: var(--home-accent);
}

.home-title {
  display: flex;
  flex-direction: column;
  gap: 0.12em;
  margin: 0 0 1.35rem;
  font-size: clamp(2.1rem, 4.2vw, 3.25rem);
  font-weight: 700;
  line-height: 1.12;
  letter-spacing: -0.035em;
  color: var(--home-text);
}

.title-line {
  display: block;
  will-change: transform, opacity;
}

.title-line--accent {
  background: linear-gradient(120deg, #2f6f9f 0%, #4a8eb8 55%, #6a9fc4 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}

.home-desc {
  margin: 0;
  font-size: clamp(0.94rem, 1.5vw, 1.02rem);
  line-height: 1.72;
  color: var(--home-muted);
}

.home-desc code {
  padding: 0.1em 0.38em;
  font-size: 0.86em;
  font-family: ui-monospace, Consolas, monospace;
  color: var(--home-text);
  background: rgba(21, 37, 53, 0.06);
  border-radius: 5px;
}

.home-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.85rem 1.25rem;
  align-items: center;
  margin-top: 2rem;
}

.home-primary {
  display: inline-flex;
  gap: 0.5rem;
  align-items: center;
  padding: 0.72rem 1.25rem;
  font-size: 0.92rem;
  font-weight: 600;
  text-decoration: none;
  color: #ffffff;
  background: linear-gradient(135deg, #2f6f9f, #3d84b8);
  border-radius: 999px;
  box-shadow: 0 10px 24px rgba(47, 111, 159, 0.28);
  transition: transform 0.25s ease, box-shadow 0.25s ease;
}

.home-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 14px 28px rgba(47, 111, 159, 0.34);
}

.home-primary-arrow {
  transition: transform 0.25s ease;
}

.home-primary:hover .home-primary-arrow {
  transform: translateX(3px);
}

.home-meta {
  font-size: 0.82rem;
  color: var(--home-muted);
}

.home-footer {
  display: flex;
  justify-content: center;
  margin-top: clamp(1.5rem, 3vw, 2.5rem);
}

.home-dock {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
  justify-content: center;
  padding: 0.3rem;
  background: rgba(255, 255, 255, 0.55);
  border: 1px solid var(--home-border);
  border-radius: 999px;
  backdrop-filter: blur(14px);
  box-shadow: 0 8px 28px rgba(21, 37, 53, 0.05);
}

.home-dock-item {
  padding: 0.5rem 0.95rem;
  font-size: 0.84rem;
  font-weight: 500;
  text-decoration: none;
  color: rgba(21, 37, 53, 0.45);
  border-radius: 999px;
  transition:
    color 0.2s ease,
    background 0.2s ease;
}

.home-dock-item:hover,
.home-dock-item:focus-visible {
  color: rgba(21, 37, 53, 0.78);
  background: rgba(21, 37, 53, 0.05);
  outline: none;
}

.home-dock-item--active {
  color: var(--home-text);
  background: var(--home-accent-soft);
}

@media (max-width: 960px) {
  .home-stage {
    grid-template-columns: 1fr;
    gap: 1.75rem;
  }

  .home-visual-wrap {
    height: min(46vh, 460px);
    min-height: 300px;
  }

  .home-copy {
    max-width: none;
    text-align: center;
    align-items: center;
  }

  .home-title {
    align-items: center;
  }

  .home-actions {
    justify-content: center;
  }
}

@media (max-width: 520px) {
  .home-dock {
    width: 100%;
    border-radius: 18px;
  }

  .home-dock-item {
    flex: 1 1 calc(50% - 0.25rem);
    text-align: center;
  }

  .home-actions {
    flex-direction: column;
  }
}
</style>
