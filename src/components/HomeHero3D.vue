<template>
  <div ref="canvasHost" class="hero-canvas" aria-label="鲸鱼 3D 模型，可拖拽旋转、滚轮缩放">
    <div v-if="isLoading" class="hero-loading" role="status" aria-live="polite">
      <div class="hero-loading-spinner" aria-hidden="true"></div>
      <p class="hero-loading-text">加载模型中…</p>
      <div class="hero-loading-bar" aria-hidden="true">
        <span class="hero-loading-bar-fill" :style="{ width: `${loadProgress}%` }"></span>
      </div>
      <p v-if="loadProgress > 0" class="hero-loading-percent">{{ loadProgress }}%</p>
    </div>
    <p v-if="loadError" class="hero-error">模型加载失败，请确认 public/whale-compressed.glb 存在</p>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { gsap } from 'gsap'

const MODEL_URL = `${import.meta.env.BASE_URL}whale-compressed.glb`
const TARGET_SIZE = 4.2
const DRACO_DECODER = 'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'

const canvasHost = ref(null)
const isLoading = ref(true)
const loadProgress = ref(0)
const loadError = ref(false)

let renderer
let scene
let camera
let controls
let heroGroup
let mixer
let clock
let animationId
let resizeObserver

function disposeMaterial(material) {
  if (!material) return
  const materials = Array.isArray(material) ? material : [material]
  materials.forEach((mat) => {
    Object.values(mat).forEach((value) => {
      if (value?.isTexture) value.dispose()
    })
    mat.dispose()
  })
}

function disposeObject(object) {
  object.traverse((child) => {
    if (child.isMesh) {
      child.geometry?.dispose()
      disposeMaterial(child.material)
    }
  })
}

function fitModel(model) {
  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const scale = TARGET_SIZE / maxDim

  model.scale.setScalar(scale)
  model.position.sub(center.multiplyScalar(scale))

  const fittedBox = new THREE.Box3().setFromObject(model)
  return fittedBox.getCenter(new THREE.Vector3())
}

function createModelLoader() {
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(DRACO_DECODER)

  const loader = new GLTFLoader()
  loader.setDRACOLoader(dracoLoader)
  return loader
}

function loadWhaleModel() {
  return new Promise((resolve, reject) => {
    isLoading.value = true
    loadProgress.value = 0
    loadError.value = false

    const loader = createModelLoader()
    loader.load(
      MODEL_URL,
      (gltf) => resolve(gltf),
      (xhr) => {
        if (xhr.total > 0) {
          loadProgress.value = Math.min(100, Math.round((xhr.loaded / xhr.total) * 100))
        }
      },
      (error) => reject(error),
    )
  })
}

function initScene() {
  const host = canvasHost.value
  if (!host) return

  const width = host.clientWidth
  const height = host.clientHeight

  scene = new THREE.Scene()
  clock = new THREE.Clock()

  camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100)
  camera.position.set(0, 1.1, 6.5)

  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.outputColorSpace = THREE.SRGBColorSpace
  host.appendChild(renderer.domElement)

  scene.add(new THREE.AmbientLight(0xe8f4ff, 0.75))
  const key = new THREE.DirectionalLight(0xffffff, 1.15)
  key.position.set(5, 8, 6)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xa8d4f5, 0.65)
  fill.position.set(-5, 2, -3)
  scene.add(fill)
  const rim = new THREE.DirectionalLight(0xd4e8ff, 0.4)
  rim.position.set(0, -3, -6)
  scene.add(rim)

  heroGroup = new THREE.Group()
  scene.add(heroGroup)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.06
  controls.enablePan = false
  controls.enabled = false
  controls.minDistance = 3.5
  controls.maxDistance = 14
  controls.minPolarAngle = THREE.MathUtils.degToRad(15)
  controls.maxPolarAngle = THREE.MathUtils.degToRad(85)
  controls.update()

  loadWhaleModel()
    .then((gltf) => {
      const model = gltf.scene
      model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = false
          child.receiveShadow = false
        }
      })

      const target = fitModel(model)
      heroGroup.add(model)
      controls.target.copy(target)
      controls.enabled = true
      controls.update()

      if (gltf.animations.length > 0) {
        mixer = new THREE.AnimationMixer(model)
        gltf.animations.forEach((clip) => {
          mixer.clipAction(clip).play()
        })
      }

      gsap.from(heroGroup.scale, {
        x: 0.85,
        y: 0.85,
        z: 0.85,
        duration: 1,
        ease: 'power2.out',
      })
      gsap.to(heroGroup.position, {
        y: '+=0.15',
        duration: 3.2,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
      })
    })
    .catch(() => {
      loadError.value = true
    })
    .finally(() => {
      isLoading.value = false
    })

  const renderLoop = () => {
    animationId = requestAnimationFrame(renderLoop)
    const delta = clock.getDelta()
    mixer?.update(delta)
    controls.update()
    renderer.render(scene, camera)
  }
  renderLoop()

  resizeObserver = new ResizeObserver(() => {
    const w = host.clientWidth
    const h = host.clientHeight
    camera.aspect = w / h
    camera.updateProjectionMatrix()
    renderer.setSize(w, h)
  })
  resizeObserver.observe(host)
}

onMounted(initScene)

onUnmounted(() => {
  if (animationId) cancelAnimationFrame(animationId)
  resizeObserver?.disconnect()
  controls?.dispose()
  gsap.killTweensOf(heroGroup?.position)
  gsap.killTweensOf(heroGroup?.scale)
  mixer?.stopAllAction()
  if (heroGroup) disposeObject(heroGroup)
  renderer?.dispose()
})
</script>

<style scoped>
.hero-canvas {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 0;
  cursor: grab;
  touch-action: none;
}

.hero-canvas :deep(canvas) {
  display: block;
  width: 100% !important;
  height: 100% !important;
  cursor: grab;
}

.hero-canvas :deep(canvas:active) {
  cursor: grabbing;
}

.hero-loading {
  position: absolute;
  inset: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  pointer-events: none;
  background: rgba(237, 243, 248, 0.72);
  backdrop-filter: blur(6px);
}

.hero-loading-spinner {
  width: 2.25rem;
  height: 2.25rem;
  border: 2px solid rgba(47, 111, 159, 0.18);
  border-top-color: #2f6f9f;
  border-radius: 50%;
  animation: hero-spin 0.85s linear infinite;
}

.hero-loading-text {
  margin: 0;
  font-size: 0.88rem;
  font-weight: 600;
  color: rgba(21, 37, 53, 0.72);
}

.hero-loading-bar {
  width: min(12rem, 70%);
  height: 4px;
  overflow: hidden;
  background: rgba(47, 111, 159, 0.12);
  border-radius: 999px;
}

.hero-loading-bar-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, #2f6f9f, #4a8eb8);
  border-radius: inherit;
  transition: width 0.2s ease;
}

.hero-loading-percent {
  margin: 0;
  font-size: 0.75rem;
  font-variant-numeric: tabular-nums;
  color: rgba(21, 37, 53, 0.5);
}

.hero-error {
  position: absolute;
  inset: auto 1rem 1rem;
  z-index: 3;
  margin: 0;
  padding: 0.65rem 0.85rem;
  font-size: 0.82rem;
  color: rgba(17, 17, 17, 0.72);
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(17, 17, 17, 0.1);
  border-radius: 8px;
  pointer-events: none;
}

@keyframes hero-spin {
  to {
    transform: rotate(360deg);
  }
}
</style>
