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
import chinaMapImg from '../assets/mapimg/chinawx1.png'

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
let chinaMapTexture = null

const SIDE_COLOR = '#93cfe9'
/** 顶面贴图亮度系数（BasicMaterial color 与贴图相乘） */
const MAP_TOP_TINT = 0xb5b5b5

const PROVINCE_STYLES = {
  normal: {
    colors: ['#ffffff', SIDE_COLOR],
    emissive: ['#000000', '#4a8aaa'],
    emissiveIntensity: [0, 0.08],
    opacity: [1, 0.98],
    metalness: [0.05, 0.15],
    roughness: [0.92, 0.55],
  },
  hover: {
    colors: ['#ffffff', '#a8daf0'],
    emissive: ['#000000', '#5a9aba'],
    emissiveIntensity: [0, 0.15],
    opacity: [1, 0.99],
    metalness: [0.05, 0.18],
    roughness: [0.88, 0.48],
  },
  selected: {
    colors: ['#ffffff', '#b8e8f8'],
    emissive: ['#000000', '#6aaacc'],
    emissiveIntensity: [0, 0.22],
    opacity: [1, 1],
    metalness: [0.05, 0.2],
    roughness: [0.85, 0.42],
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
  gradient.addColorStop(0, 'rgba(20, 100, 220, 0.28)')
  gradient.addColorStop(0.45, 'rgba(8, 40, 100, 0.08)')
  gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
  ctx.fillStyle = gradient
  ctx.fillRect(0, 0, size, size)
  return new THREE.CanvasTexture(canvas)
}

function getChinaMapTexture() {
  if (!chinaMapTexture) {
    chinaMapTexture = new THREE.TextureLoader().load(chinaMapImg)
    chinaMapTexture.colorSpace = THREE.SRGBColorSpace
    chinaMapTexture.minFilter = THREE.LinearFilter
    chinaMapTexture.magFilter = THREE.LinearFilter
  }
  return chinaMapTexture
}

/** chinawx1.png 对应的地理范围（与腾讯地图导出对齐，可按需微调） */
const TEXTURE_GEO_BOUNDS = {
  minLng: 69,
  maxLng: 140,
  minLat: 3,
  maxLat: 54.5,
}

/** 采样内缩，避开 PNG 四周暗边/黑边 */
const UV_SAMPLE_INSET = {
  left: 0.06,
  right: 0.04,
  top: 0.05,
  bottom: 0.1,
}

function createUvProjection() {
  const b = TEXTURE_GEO_BOUNDS
  const feature = {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [
        [
          [b.minLng, b.minLat],
          [b.maxLng, b.minLat],
          [b.maxLng, b.maxLat],
          [b.minLng, b.maxLat],
          [b.minLng, b.minLat],
        ],
      ],
    },
  }
  return d3.geoMercator().fitExtent([[0, 0], [1, 1]], feature)
}

/** 按经纬度映射贴图 UV（与显示投影解耦） */
function applyMapUvs(geometry, uvProjection) {
  const uMin = UV_SAMPLE_INSET.left
  const uMax = 1 - UV_SAMPLE_INSET.right
  const vMin = UV_SAMPLE_INSET.bottom
  const vMax = 1 - UV_SAMPLE_INSET.top
  const pos = geometry.attributes.position
  const uv = new Float32Array(pos.count * 2)

  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i)
    const y = pos.getY(i)
    const lngLat = projection.invert([x, -y])
    if (
      !lngLat ||
      !Number.isFinite(lngLat[0]) ||
      !Number.isFinite(lngLat[1])
    ) {
      uv[i * 2] = 0.5
      uv[i * 2 + 1] = 0.5
      continue
    }

    const mapped = uvProjection(lngLat)
    if (!mapped) {
      uv[i * 2] = 0.5
      uv[i * 2 + 1] = 0.5
      continue
    }

    uv[i * 2] = uMin + mapped[0] * (uMax - uMin)
    uv[i * 2 + 1] = vMin + (1 - mapped[1]) * (vMax - vMin)
  }

  geometry.setAttribute('uv', new THREE.BufferAttribute(uv, 2))
}

function createProvinceMaterials() {
  // 顶面用 BasicMaterial，不受暗场景灯光影响，贴图亮度正常
  const top = new THREE.MeshBasicMaterial({
    map: getChinaMapTexture(),
    color: MAP_TOP_TINT,
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

function initStarfield() {
  const count = 500
  const positions = new Float32Array(count * 3)
  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 360
    positions[i * 3 + 1] = (Math.random() - 0.5) * 360
    positions[i * 3 + 2] = (Math.random() - 0.5) * 180 - 40
  }
  const geometry = new THREE.BufferGeometry()
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
  scene.add(
    new THREE.Points(
      geometry,
      new THREE.PointsMaterial({
        color: 0x5599cc,
        size: 0.55,
        transparent: true,
        opacity: 0.5,
        sizeAttenuation: true,
        depthWrite: false,
      }),
    ),
  )
}

function lngLatToVec3(lngLat, z = MAP_DEPTH + 1) {
  const p = projectLngLat(lngLat)
  if (!p) return null
  return new THREE.Vector3(p[0], -p[1], z)
}

function createFlyLine(from, to, arcHeight = 20) {
  const start = lngLatToVec3(from)
  const end = lngLatToVec3(to)
  if (!start || !end) return null

  const mid = new THREE.Vector3(
    (start.x + end.x) / 2,
    (start.y + end.y) / 2,
    MAP_DEPTH + arcHeight,
  )
  const curve = new THREE.QuadraticBezierCurve3(start, mid, end)
  const geometry = new THREE.BufferGeometry().setFromPoints(curve.getPoints(48))
  return new THREE.Line(
    geometry,
    new THREE.LineBasicMaterial({
      color: 0xff7722,
      transparent: true,
      opacity: 0.42,
    }),
  )
}

function initFlyLines(provinceCoords) {
  const flyGroup = new THREE.Group()
  const hub =
    provinceCoords.find((p) => p.name === '北京市')?.coord ??
    [116.405285, 39.904989]
  const targets = provinceCoords
    .filter((p) => p.name !== '北京市')
    .sort((a, b) => b.population - a.population)
    .slice(0, 12)

  targets.forEach((target, i) => {
    const line = createFlyLine(hub, target.coord, 16 + i * 1.2)
    if (line) {
      line.renderOrder = 5
      flyGroup.add(line)
    }
  })

  for (let i = 0; i < 4; i++) {
    const a = targets[i * 2]?.coord
    const b = targets[i * 2 + 1]?.coord
    if (a && b) {
      const line = createFlyLine(a, b, 12)
      if (line) {
        line.renderOrder = 5
        flyGroup.add(line)
      }
    }
  }

  map.add(flyGroup)
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
  scene.background = new THREE.Color(0x000208)
  scene.fog = new THREE.FogExp2(0x000208, 0.0048)

  // 相机
  camera = new THREE.PerspectiveCamera(75, width / height, 0.1, 1000)
  camera.position.set(0, -6, 82)

  // 渲染器
  renderer = new THREE.WebGLRenderer({ antialias: true })
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
  renderer.setSize(width, height)
  renderer.toneMapping = THREE.ACESFilmicToneMapping
  renderer.toneMappingExposure = 1.18
  renderer.outputColorSpace = THREE.SRGBColorSpace
  screen.value.appendChild(renderer.domElement)

  composer = new EffectComposer(renderer)
  composer.addPass(new RenderPass(scene, camera))
  const bloomPass = new UnrealBloomPass(
    new THREE.Vector2(width, height),
    0.58,
    0.48,
    0.62,
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

  // 灯光 — 暗色底图 + 霓虹高光
  scene.add(new THREE.AmbientLight(0x061020, 0.45))
  const hemi = new THREE.HemisphereLight(0x2266aa, 0x020408, 0.55)
  scene.add(hemi)

  const keyLight = new THREE.DirectionalLight(0x88bbee, 0.85)
  keyLight.position.set(28, -18, 48)
  scene.add(keyLight)

  const rimLight = new THREE.DirectionalLight(0x22aaff, 0.35)
  rimLight.position.set(-10, -40, 35)
  scene.add(rimLight)

  initStarfield()

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
const BAR_RADIUS = 0.14
/** 柱体底面略高于省顶面，避免 Z-fighting */
const BAR_BASE_OFFSET = 0.35
const POP_MIN = 300 // 万人
const POP_MAX = 12500
const BAR_HEIGHT_MIN = 5
const BAR_HEIGHT_MAX = 16
const BAR_STYLES = {
  normal: { opacity: 0.82, capColor: 0xffcc55, capOpacity: 0.95 },
  hover: { opacity: 0.95, capColor: 0xffee88, capOpacity: 1 },
  selected: { opacity: 1, capColor: 0xffffff, capOpacity: 1 },
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
  const baseZ = MAP_DEPTH + BAR_BASE_OFFSET
  const group = new THREE.Group()
  group.userData.isPopulationBar = true
  group.renderOrder = 10

  // 细光柱：参考图金色发光针状柱
  const geometry = new THREE.CylinderGeometry(
    BAR_RADIUS * 0.25,
    BAR_RADIUS,
    height,
    8,
    1,
    false,
  )
  const colorBottom = new THREE.Color(0xff5500)
  const colorTop = new THREE.Color(0xffeeaa)
  const positions = geometry.attributes.position
  const colors = []
  for (let i = 0; i < positions.count; i++) {
    const y = positions.getY(i)
    const t = (y + height / 2) / height
    const c = colorBottom.clone().lerp(colorTop, t)
    colors.push(c.r, c.g, c.b)
  }
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3))
  geometry.rotateX(Math.PI / 2)

  const material = new THREE.MeshBasicMaterial({
    vertexColors: true,
    transparent: true,
    opacity: BAR_STYLES.normal.opacity,
    depthWrite: true,
  })
  const bar = new THREE.Mesh(geometry, material)
  bar.position.set(projected[0], -projected[1], baseZ + height / 2)
  bar.renderOrder = 10
  bar.userData.isPopulationBar = true
  bar.userData.isBarBody = true
  group.add(bar)

  // 顶部光点
  const cap = new THREE.Mesh(
    new THREE.SphereGeometry(BAR_RADIUS * 1.6, 8, 8),
    new THREE.MeshBasicMaterial({
      color: BAR_STYLES.normal.capColor,
      transparent: true,
      opacity: BAR_STYLES.normal.capOpacity,
      depthWrite: false,
    }),
  )
  cap.position.set(projected[0], -projected[1], baseZ + height + 0.15)
  cap.renderOrder = 11
  cap.userData.isPopulationBar = true
  cap.userData.isBarCap = true
  group.add(cap)

  // 底部光晕环
  const ring = new THREE.Mesh(
    new THREE.RingGeometry(BAR_RADIUS * 0.8, BAR_RADIUS * 2.2, 16),
    new THREE.MeshBasicMaterial({
      color: 0xff8833,
      transparent: true,
      opacity: 0.35,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  )
  ring.position.set(projected[0], -projected[1], baseZ + 0.02)
  ring.renderOrder = 9
  ring.userData.isPopulationBar = true
  ring.userData.isBarRing = true
  group.add(ring)

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

/** 顶面省界 — 三层霓虹描边 */
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
  group.add(makeLine(MAP_DEPTH + 0.02, 0x0055cc, 0.18))
  group.add(makeLine(MAP_DEPTH + 0.05, 0x00aaff, 0.55))
  group.add(makeLine(MAP_DEPTH + 0.08, 0xccffff, 1))
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
  el.innerHTML = `<span class="label-dot"></span>${name}`

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
      if (index === 0) {
        mat.color.set(MAP_TOP_TINT)
        return
      }
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
    if (child.userData.isBarCap) {
      mat.color.set(style.capColor)
      mat.opacity = style.capOpacity
    } else if (child.userData.isBarBody) {
      mat.opacity = style.opacity
    } else if (child.userData.isBarRing) {
      mat.opacity = style.opacity * 0.45
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
  const provinceCoords = []
  const uvProjection = createUvProjection()

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
          applyMapUvs(geometry, uvProjection)
          const mesh = new THREE.Mesh(geometry, createProvinceMaterials())
          mesh.userData.isPickable = true
          province.add(mesh)

          const border = createBorderLine(ring)
          if (border) province.add(border)
        })
      })

      const labelCoord = getLabelCoord(feature)
      const { name } = feature.properties
      if (labelCoord) {
        provinceCoords.push({ name, coord: labelCoord, population })
      }
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

  initFlyLines(provinceCoords)

  const glowPlane = new THREE.Mesh(
    new THREE.CircleGeometry(95, 64),
    new THREE.MeshBasicMaterial({
      map: createRadialGlowTexture(),
      transparent: true,
      opacity: 0.55,
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
  background: radial-gradient(ellipse at 50% 50%, #061428 0%, #000208 60%, #000000 100%);
}

.screen :deep(.map-label-layer) {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.screen :deep(.province-label) {
  display: flex;
  align-items: center;
  gap: 5px;
  padding: 2px 8px;
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  color: #e8f4ff;
  white-space: nowrap;
  text-shadow:
    0 0 8px rgba(80, 200, 255, 0.55),
    0 0 2px rgba(0, 0, 0, 0.9);
  transform: translate(-50%, -50%);
  user-select: none;
}

.screen :deep(.label-dot) {
  flex-shrink: 0;
  width: 6px;
  height: 6px;
  background: #ffaa44;
  border-radius: 50%;
  box-shadow: 0 0 8px rgba(255, 170, 60, 0.9);
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
