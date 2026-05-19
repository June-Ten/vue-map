<template>
  <div class="screen" ref="screen">
    <div
      v-show="tooltip.show"
      class="map-tooltip"
      :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }"
    >
      {{ tooltip.name }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import * as d3 from 'd3'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls'
import { CSS2DRenderer, CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js'
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js'
import mapData from '../../public/100000_full.json'

const screen = ref(null)
const tooltip = ref({ show: false, name: '', x: 0, y: 0 })

let scene
let camera
let renderer
let labelRenderer
let composer
let controls
let animationId
let map
let raycaster
let mouse
let pickableMeshes = []
let hoveredProvince = null
let selectedProvince = null

const PROVINCE_STYLES = {
  normal: {
    colors: ['#18d4ff', '#064878'],
    emissive: ['#0aa8e8', '#021830'],
    emissiveIntensity: [0.38, 0.16],
    opacity: [0.92, 0.94],
    metalness: [0.55, 0.78],
    roughness: [0.18, 0.32],
  },
  hover: {
    colors: ['#66eeff', '#0a68b8'],
    emissive: ['#44eeff', '#0848a0'],
    emissiveIntensity: [0.68, 0.34],
    opacity: [0.96, 0.97],
    metalness: [0.58, 0.82],
    roughness: [0.12, 0.26],
  },
  selected: {
    colors: ['#aaf6ff', '#1890d8'],
    emissive: ['#66eeff', '#1068c0'],
    emissiveIntensity: [0.88, 0.48],
    opacity: [0.98, 0.98],
    metalness: [0.62, 0.85],
    roughness: [0.08, 0.2],
  },
}
const HOVER_LIFT = 3
const SELECTED_LIFT = 4
const LIFT_LERP = 0.18

/** 不渲染的附图要素（如南海诸岛示意） */
const EXCLUDED_ADCODES = new Set(['100000_JD'])

function getLabelCoord(feature) {
  const { centroid, center } = feature.properties
  if (centroid || center) return centroid || center
  return d3.geoCentroid(feature)
}

function getSize() {
  const el = screen.value
  return {
    width: el?.clientWidth ?? window.innerWidth,
    height: el?.clientHeight ?? window.innerHeight,
  }
}

function handleResize() {
  if (!camera || !renderer) return
  const { width, height } = getSize()
  camera.aspect = width / height
  camera.updateProjectionMatrix()
  renderer.setSize(width, height)
  composer?.setSize(width, height)
  labelRenderer?.setSize(width, height)
}

function createRadialGlowTexture() {
  const size = 512
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const ctx = canvas.getContext('2d')
  const gradient = ctx.createRadialGradient(
    size / 2,
    size / 2,
    0,
    size / 2,
    size / 2,
    size / 2,
  )
  gradient.addColorStop(0, 'rgba(50, 190, 255, 0.38)')
  gradient.addColorStop(0.4, 'rgba(20, 90, 200, 0.12)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

function createProvinceMaterials() {
  const top = new THREE.MeshStandardMaterial({
    color: PROVINCE_STYLES.normal.colors[0],
    emissive: PROVINCE_STYLES.normal.emissive[0],
    emissiveIntensity: PROVINCE_STYLES.normal.emissiveIntensity[0],
    transparent: true,
    opacity: PROVINCE_STYLES.normal.opacity[0],
    metalness: PROVINCE_STYLES.normal.metalness[0],
    roughness: PROVINCE_STYLES.normal.roughness[0],
  })
  const side = new THREE.MeshStandardMaterial({
    color: PROVINCE_STYLES.normal.colors[1],
    emissive: PROVINCE_STYLES.normal.emissive[1],
    emissiveIntensity: PROVINCE_STYLES.normal.emissiveIntensity[1],
    transparent: true,
    opacity: PROVINCE_STYLES.normal.opacity[1],
    metalness: PROVINCE_STYLES.normal.metalness[1],
    roughness: PROVINCE_STYLES.normal.roughness[1],
  })
  return [top, side]
}

onMounted(() => {
  init()
  window.addEventListener('resize', handleResize)
})

onUnmounted(() => {
  window.removeEventListener('resize', handleResize)
  disposePickEvents()
  if (animationId) cancelAnimationFrame(animationId)
  controls?.dispose()
  renderer?.dispose()
})

const init = () => {
  initScene()
}

// 创建场景
const initScene = () => {
  const { width, height } = getSize()
  // 场景
  scene = new THREE.Scene()
  scene.background = new THREE.Color(0x010818)
  scene.fog = new THREE.FogExp2(0x010818, 0.0055)

  // 相机
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  camera.position.set(0, -6, 82)

  // 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.12
  renderer.outputColorSpace = THREE.SRGBColorSpace
  screen.value.appendChild(renderer.domElement)

  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.42,
    0.4,
    0.78,
  )
  composer.addPass(bloomPass)

  // 省份名称 一直面对相机
  labelRenderer = new CSS2DRenderer()
  labelRenderer.setSize(width, height)
  labelRenderer.domElement.className = 'map-label-layer'
  screen.value.appendChild(labelRenderer.domElement)

  controls = new OrbitControls(camera, renderer.domElement)
  controls.enableDamping = true
  controls.dampingFactor = 0.05
  controls.target.set(0, 0, 0)
  controls.update()

  // 灯光
  scene.add(new THREE.AmbientLight(0x0a2048, 0.6))
  const hemi = new THREE.HemisphereLight(0x88ddff, 0x040818, 0.75)
  scene.add(hemi)

  const keyLight = new THREE.DirectionalLight(0xc8f0ff, 1.5)
  keyLight.position.set(28, -18, 48)
  scene.add(keyLight)

  const fillLight = new THREE.DirectionalLight(0x2288ff, 0.55)
  fillLight.position.set(-35, 25, 20)
  scene.add(fillLight)

  const rimLight = new THREE.DirectionalLight(0x66eeff, 0.75)
  rimLight.position.set(-10, -40, 35)
  scene.add(rimLight)

  const topGlow = new THREE.PointLight(0x44eeff, 1.2, 200)
  topGlow.position.set(0, 0, 55)
  scene.add(topGlow)

  // 动画
  const animate = () => {
    animationId = requestAnimationFrame(animate)
    controls.update()
    updateProvinceLifts()
    composer.render()
    labelRenderer?.render(scene, camera)
  }
  animate()
  // 添加地图
  initMap()
  initPickEvents()
}

/** Polygon → [rings]; MultiPolygon → [[rings], ...] */
function getPolygonGroups(geometry) {
  const { type, coordinates } = geometry
  if (type === 'Polygon') return [coordinates]
  if (type === 'MultiPolygon') return coordinates
  return []
}

const MAP_DEPTH = 10
/** 绕 X 轴倾斜地图（负值：南侧略抬起，更易看到立体） */
const MAP_TILT_X = THREE.MathUtils.degToRad(-22)
const BAR_SIZE = 0.9
const POP_MIN = 300 // 万人
const POP_MAX = 12500
const BAR_HEIGHT_MIN = 4
const BAR_HEIGHT_MAX = 13
const BAR_STYLES = {
  normal: {
    color: 0x3399ff,
    emissive: 0x1188ff,
    emissiveIntensity: 0.28,
    opacity: 0.38,
    transmission: 0.92,
  },
  hover: {
    color: 0x66ccff,
    emissive: 0x33bbff,
    emissiveIntensity: 0.48,
    opacity: 0.48,
    transmission: 0.86,
  },
  selected: {
    color: 0x99eeff,
    emissive: 0x55ddff,
    emissiveIntensity: 0.68,
    opacity: 0.55,
    transmission: 0.78,
  },
}

/** 按 adcode 生成稳定的随机人口（万人） */
function getRandomPopulation(adcode) {
  const seed = String(adcode)
    .split('')
    .reduce((sum, ch) => sum + ch.charCodeAt(0), 0)
  const t = (Math.sin(seed * 12.9898) * 43758.5453) % 1
  const r = t < 0 ? t + 1 : t
  return Math.round(POP_MIN + r * (POP_MAX - POP_MIN))
}

function populationToBarHeight(population) {
  const linear = (population - POP_MIN) / (POP_MAX - POP_MIN)
  const t = Math.sqrt(Math.max(0, Math.min(1, linear)))
  return BAR_HEIGHT_MIN + t * (BAR_HEIGHT_MAX - BAR_HEIGHT_MIN)
}

function createPopulationBar(population, lngLat) {
  const projected = projectLngLat(lngLat)
  if (!projected) return null

  const height = populationToBarHeight(population)
  const group = new THREE.Group()
  group.userData.isPopulationBar = true

  const geometry = new THREE.BoxGeometry(BAR_SIZE, BAR_SIZE, height)
  const colorBottom = new THREE.Color(0x0066cc)
  const colorTop = new THREE.Color(0x88eeff)
  const positions = geometry.attributes.position
  const colors = []
  for (let i = 0; i < positions.count; i++) {
    const z = positions.getZ(i)
    const t = (z + height / 2) / height
    const c = colorBottom.clone().lerp(colorTop, t)
    colors.push(c.r, c.g, c.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))

  const material = new THREE.MeshPhysicalMaterial({
    vertexColors: true,
    transparent: true,
    opacity: BAR_STYLES.normal.opacity,
    transmission: BAR_STYLES.normal.transmission,
    thickness: height * 0.6,
    ior: 1.45,
    metalness: 0,
    roughness: 0.06,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    emissive: BAR_STYLES.normal.emissive,
    emissiveIntensity: BAR_STYLES.normal.emissiveIntensity,
    side: THREE.DoubleSide,
    depthWrite: false,
  })
  const bar = new THREE.Mesh(geometry, material)
  bar.position.set(projected[0], -projected[1], MAP_DEPTH + height / 2)
  bar.userData.isPopulationBar = true
  bar.userData.isBarBody = true
  group.add(bar)

  const cap = new THREE.Mesh(
    new THREE.BoxGeometry(BAR_SIZE * 1.12, BAR_SIZE * 1.12, 0.2),
    new THREE.MeshPhysicalMaterial({
      color: 0xbbeeff,
      emissive: 0x44ccff,
      emissiveIntensity: 0.55,
      transparent: true,
      opacity: 0.55,
      transmission: 0.85,
      thickness: 0.3,
      ior: 1.5,
      metalness: 0,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
      depthWrite: false,
    }),
  )
  cap.position.set(projected[0], -projected[1], MAP_DEPTH + height + 0.1)
  cap.userData.isPopulationBar = true
  cap.userData.isBarCap = true
  group.add(cap)

  return group
}

/** 将环投影为 2D 点列 [x, y]（已做 -y 翻转） */
function projectRing(ring) {
  if (!ring || ring.length < 3) return null

  const points = []
  for (let i = 0; i < ring.length; i++) {
    const projected = projection(ring[i])
    if (
      !projected ||
      !Number.isFinite(projected[0]) ||
      !Number.isFinite(projected[1])
    ) {
      return null
    }
    points.push([projected[0], -projected[1]])
  }
  return points
}

function ringToShape(ring) {
  const points = projectRing(ring)
  if (!points) return null

  const shape = new THREE.Shape()
  shape.moveTo(points[0][0], points[0][1])
  for (let i = 1; i < points.length; i++) {
    shape.lineTo(points[i][0], points[i][1])
  }
  return shape
}

/** 顶面省界描边（双层：外晕 + 亮线） */
function createBorderLine(ring) {
  const points = projectRing(ring)
  if (!points) return null

  const group = new THREE.Group()
  const makeLine = (z, color, opacity) => {
    const vertices = points.map(([x, y]) => new THREE.Vector3(x, y, z))
    const geometry = new THREE.BufferGeometry().setFromPoints(vertices)
    const material = new THREE.LineBasicMaterial({
      color,
      transparent: true,
      opacity,
    })
    return new THREE.LineLoop(geometry, material)
  }
  group.add(makeLine(MAP_DEPTH + 0.03, 0x2288ff, 0.22))
  group.add(makeLine(MAP_DEPTH + 0.07, 0xb8f4ff, 0.82))
  return group
}

function projectLngLat([lng, lat]) {
  const projected = projection([lng, lat])
  if (
    !projected ||
    !Number.isFinite(projected[0]) ||
    !Number.isFinite(projected[1])
  ) {
    return null
  }
  return projected
}

/** 省份名称标签（HTML，始终面向相机） */
function createProvinceLabel(name, lngLat) {
  const projected = projectLngLat(lngLat)
  if (!projected) return null

  const el = document.createElement('div')
  el.className = 'province-label'
  el.textContent = name

  const label = new CSS2DObject(el)
  label.position.set(projected[0], -projected[1], MAP_DEPTH + 1)
  return label
}

function getProvinceFromObject(object) {
  let current = object
  while (current) {
    if (current.userData?.isProvince) return current
    current = current.parent
  }
  return null
}

function setProvinceVisual(province, state) {
  const style = PROVINCE_STYLES[state]
  if (!style) return

  province.traverse((child) => {
    if (!child.isMesh || !child.userData.isPickable) return
    const materials = Array.isArray(child.material)
      ? child.material
      : [child.material]
    materials.forEach((mat, index) => {
      mat.color.set(style.colors[index] ?? style.colors[0])
      mat.emissive?.set(style.emissive[index] ?? style.emissive[0])
      if (mat.emissiveIntensity !== undefined) {
        mat.emissiveIntensity =
          style.emissiveIntensity[index] ?? style.emissiveIntensity[0]
      }
      mat.opacity = style.opacity[index] ?? style.opacity[0]
      if (style.metalness) {
        mat.metalness = style.metalness[index] ?? style.metalness[0]
      }
      if (style.roughness) {
        mat.roughness = style.roughness[index] ?? style.roughness[0]
      }
    })
  })
}

function setProvinceBarVisual(province, state) {
  const style = BAR_STYLES[state]
  if (!style) return

  province.traverse((child) => {
    if (!child.isMesh || !child.userData.isPopulationBar) return
    const mat = child.material
    if (mat.emissive) {
      mat.emissive.set(style.emissive)
      mat.emissiveIntensity = style.emissiveIntensity
    }
    if (style.color && !child.userData.isBarBody) {
      mat.color.set(style.color)
    }
    mat.opacity = child.userData.isBarCap
      ? style.opacity * 1.15
      : style.opacity
    if (mat.transmission !== undefined) {
      mat.transmission = style.transmission
    }
  })
}

function refreshProvinceVisuals() {
  map?.children.forEach((province) => {
    if (!province.userData?.isProvince) return

    let state = 'normal'
    let targetZ = 0
    if (province === selectedProvince) {
      state = 'selected'
      targetZ = SELECTED_LIFT
    } else if (province === hoveredProvince) {
      state = 'hover'
      targetZ = HOVER_LIFT
    }

    province.userData.targetZ = targetZ
    setProvinceVisual(province, state)
    setProvinceBarVisual(province, state)
  })
}

/** 平滑抬高/落下省份（沿 Z 轴） */
function updateProvinceLifts() {
  map?.children.forEach((province) => {
    if (!province.userData?.isProvince) return
    const targetZ = province.userData.targetZ ?? 0
    const nextZ = province.position.z + (targetZ - province.position.z) * LIFT_LERP
    province.position.z =
      Math.abs(targetZ - nextZ) < 0.02 ? targetZ : nextZ
  })
}

function updateMouseFromEvent(event) {
  const rect = renderer.domElement.getBoundingClientRect()
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1
}

function pickProvinceAtEvent(event) {
  updateMouseFromEvent(event)
  raycaster.setFromCamera(mouse, camera)
  const hits = raycaster.intersectObjects(pickableMeshes, false)
  if (!hits.length) return null
  return getProvinceFromObject(hits[0].object)
}

function onPointerMove(event) {
  const province = pickProvinceAtEvent(event)
  const canvas = renderer.domElement

  if (province) {
    canvas.style.cursor = 'pointer'
    const pop = province.userData.population
    tooltip.value = {
      show: true,
      name: pop
        ? `${province.userData.name} · ${pop} 万人`
        : province.userData.name,
      x: event.clientX + 12,
      y: event.clientY + 12,
    }
  } else {
    canvas.style.cursor = 'default'
    tooltip.value.show = false
  }

  if (province !== hoveredProvince) {
    hoveredProvince = province
    refreshProvinceVisuals()
  }
}

function onPointerLeave() {
  renderer.domElement.style.cursor = 'default'
  tooltip.value.show = false
  hoveredProvince = null
  refreshProvinceVisuals()
}

function onClick(event) {
  const province = pickProvinceAtEvent(event)
  selectedProvince = province
  refreshProvinceVisuals()
  if (province) {
    console.log('选中省份:', {
      name: province.userData.name,
      population: province.userData.population,
      unit: '万人',
      properties: province.userData.properties,
    })
  }
}

function initPickEvents() {
  raycaster = new THREE.Raycaster()
  mouse = new THREE.Vector2()

  pickableMeshes = []
  map.traverse((child) => {
    if (child.isMesh && child.userData.isPickable) {
      pickableMeshes.push(child)
    }
  })

  const canvas = renderer.domElement
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerleave', onPointerLeave)
  canvas.addEventListener('click', onClick)
}

function disposePickEvents() {
  const canvas = renderer?.domElement
  if (!canvas) return
  canvas.removeEventListener('pointermove', onPointerMove)
  canvas.removeEventListener('pointerleave', onPointerLeave)
  canvas.removeEventListener('click', onClick)
}

const initMap = () => {
  map = new THREE.Object3D()
  mapData.features
    .filter((feature) => !EXCLUDED_ADCODES.has(feature.properties?.adcode))
    .forEach((feature) => {
      const province = new THREE.Object3D()
      const population = getRandomPopulation(feature.properties.adcode)
      province.userData = {
        isProvince: true,
        name: feature.properties.name,
        population,
        properties: feature.properties,
        targetZ: 0,
      }

      getPolygonGroups(feature.geometry).forEach((polygon) => {
        polygon.forEach((ring) => {
          const shape = ringToShape(ring)
          if (!shape) return

          const geometry = new THREE.ExtrudeGeometry(shape, {
            depth: MAP_DEPTH,
            bevelEnabled: false,
          })
          const mesh = new THREE.Mesh(geometry, createProvinceMaterials())
          mesh.userData.isPickable = true
          province.add(mesh)

          const border = createBorderLine(ring)
          if (border) province.add(border)
        })
      })

      const labelCoord = getLabelCoord(feature)
      const { name } = feature.properties
      if (name && labelCoord) {
        const label = createProvinceLabel(name, labelCoord)
        if (label) province.add(label)
      }

      if (labelCoord) {
        const bar = createPopulationBar(population, labelCoord)
        if (bar) province.add(bar)
      }

      map.add(province)
    })
  map.rotation.x = MAP_TILT_X

  const glowPlane = new THREE.Mesh(
    new THREE.CircleGeometry(95, 64),
    new THREE.MeshBasicMaterial({
      map: createRadialGlowTexture(),
      transparent: true,
      opacity: 0.75,
      depthWrite: false,
    }),
  )
  glowPlane.position.z = -1.5
  map.add(glowPlane)

  scene.add(map)
}

const projection = d3.geoMercator()
            // .center([104.0, 37.5])
            .center([105, 35])
            .scale(80)
            .translate([0, 0]);
  // .center([105, 35])           // 可选：全国图常用
  // .fitSize([getSize().width, getSize().height], mapData);


</script>

<style scoped>
.screen {
  position: relative;
  width: 100vw;
  height: 100vh;
  background: radial-gradient(ellipse at 50% 55%, #0a3068 0%, #010818 52%, #000408 100%);
}

.screen :deep(.map-label-layer) {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.screen :deep(.province-label) {
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #c8f0ff;
  white-space: nowrap;
  text-shadow:
    0 0 6px rgba(80, 220, 255, 0.45),
    0 0 2px rgba(0, 0, 0, 0.9);
  transform: translate(-50%, -50%);
  user-select: none;
}

.map-tooltip {
  position: fixed;
  z-index: 10;
  padding: 8px 12px;
  font-size: 13px;
  color: #e8f8ff;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(6, 28, 68, 0.94), rgba(2, 12, 36, 0.9));
  border: 1px solid rgba(100, 220, 255, 0.65);
  border-radius: 6px;
  box-shadow:
    0 0 10px rgba(50, 180, 255, 0.2),
    0 4px 16px rgba(0, 0, 0, 0.45);
  backdrop-filter: blur(6px);
}
</style>
