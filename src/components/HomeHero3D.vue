<template>
  <div ref="canvasHost" class="hero-canvas" aria-label="鲸鱼 3D 模型，可拖拽旋转、滚轮缩放">
    <p v-if="loadError" class="hero-error">未找到 whale.glb，请将模型放入 public/ 目录</p>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { gsap } from 'gsap'

const MODEL_URL = `${import.meta.env.BASE_URL}whale.glb`
const TARGET_SIZE = 4.2

const canvasHost = ref(null)
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

/** 居中并缩放到合适尺寸 */
function fitModel(model) {
  const box = new THREE.Box3().setFromObject(model)
  const center = box.getCenter(new THREE.Vector3())
  const size = box.getSize(new THREE.Vector3())
  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const scale = TARGET_SIZE / maxDim

  model.scale.setScalar(scale)
  model.position.sub(center.multiplyScalar(scale))

  const fittedBox = new THREE.Box3().setFromObject(model)
  const fittedCenter = fittedBox.getCenter(new THREE.Vector3())
  return fittedCenter
}

function loadWhaleModel() {
  return new Promise((resolve, reject) => {
    const loader = new GLTFLoader()
    loader.load(
      MODEL_URL,
      (gltf) => resolve(gltf),
      undefined,
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

.hero-error {
  position: absolute;
  inset: auto 1rem 1rem;
  margin: 0;
  padding: 0.65rem 0.85rem;
  font-size: 0.82rem;
  color: rgba(17, 17, 17, 0.72);
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(17, 17, 17, 0.1);
  border-radius: 8px;
  pointer-events: none;
}
</style>
