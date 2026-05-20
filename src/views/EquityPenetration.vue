<template>
  <div class="equity-page">
    <header class="equity-header">
      <div class="equity-header-main">
        <h1>股权穿透图</h1>
        <p>中心标的公司 · 上方股东向上穿透 · 下方对外投资向下穿透（AntV G6 5）</p>
      </div>
      <ul class="equity-legend" aria-label="图例">
        <li><span class="dot dot--target"></span>标的公司</li>
        <li><span class="dot dot--corp"></span>企业</li>
        <li><span class="dot dot--person"></span>个人</li>
      </ul>
    </header>

    <div class="equity-body">
      <div v-if="loading" class="equity-status" role="status">
        <span class="equity-status-spinner" aria-hidden="true"></span>
        <p>正在加载股权穿透数据…</p>
      </div>
      <div v-else-if="loadError" class="equity-status equity-status--error" role="alert">
        <p>{{ loadError }}</p>
        <button type="button" class="equity-status-retry" @click="loadAndRender">重试</button>
      </div>
      <div
        ref="graphRef"
        class="equity-graph"
        :class="{ 'equity-graph--ready': graphReady && !loading && !loadError }"
      ></div>
      <aside v-if="selectedNode" class="equity-panel">
        <h2>节点详情</h2>
        <dl>
          <dt>名称</dt>
          <dd>{{ selectedNode.name }}</dd>
          <dt>类型</dt>
          <dd>{{ typeLabel(selectedNode.type) }}</dd>
          <dt v-if="selectedNode.region">地区/标签</dt>
          <dd v-if="selectedNode.region">{{ selectedNode.region }}</dd>
        </dl>
        <button type="button" class="equity-panel-close" @click="selectedNode = null">关闭</button>
      </aside>
    </div>
  </div>
</template>

<script setup>
import { ref, shallowRef, onMounted, onUnmounted } from 'vue'
import { Graph } from '@antv/g6'
import {
  buildVisibleGraph,
  fetchEquityChildren,
  fetchEquityGraphData,
  hasEquityGraphSource,
  isEffectivelyCollapsed,
  getChildIds,
  getSourceNode,
  isNodeCollapsible,
  needsLazyLoad,
} from '../data/equityPenetration'
import { buildEquityEdgePath } from '../utils/equityEdgePath'

const graphRef = ref(null)
const selectedNode = shallowRef(null)
const graphReady = ref(false)
const loading = ref(false)
const loadError = ref(null)
const isFirstPaint = ref(true)
const collapsedSet = ref(new Set(['inv-1', 'inv-4']))
const expandingNodeId = ref(null)

let graph
let resizeObserver
/** 全图一次性布局坐标，展开/折叠只显隐节点，不重排、不移动视口 */
let positionCache = null

const TYPE_META = {
  target: { label: '标的公司', fill: '#4a9fd8', stroke: '#3a8fc8', labelFill: '#ffffff' },
  corp: { label: '企业', fill: '#ffffff', stroke: '#8ec5ef', labelFill: '#2d5f8a' },
  person: { label: '个人', fill: '#ffffff', stroke: '#f0a8be', labelFill: '#8e4a5a' },
}

/** 展开/折叠徽标相对节点底边的下移距离 */
const BADGE_OFFSET_Y = 10

/** 与 Graph layout 配置一致，用于懒加载子节点增量定位 */
const LAYOUT_RANKSEP = 88
const LAYOUT_NODESEP = 48

function typeLabel(type) {
  return TYPE_META[type]?.label ?? type
}

function getNodeSize(datum) {
  const type = datum.data?.type
  if (type === 'target') return [168, 44]
  return [152, 40]
}

function getNodeStyle(datum) {
  const data = datum.data || {}
  const type = data.type || 'corp'
  const meta = TYPE_META[type] || TYPE_META.corp
  const [width, height] = getNodeSize(datum)
  const badges = []

  if (data.loadingExpand) {
    badges.push({
      text: '…',
      placement: 'bottom',
      offsetY: BADGE_OFFSET_Y,
      backgroundFill: '#8ec5ef',
      fill: '#ffffff',
      fontSize: 12,
      padding: [2, 7],
    })
  } else if (data.collapsible) {
    badges.push({
      text: data.collapsed ? '+' : '−',
      placement: 'bottom',
      offsetY: BADGE_OFFSET_Y,
      backgroundFill: '#4a9fd8',
      fill: '#ffffff',
      fontSize: 12,
      padding: [2, 7],
      cursor: 'pointer',
    })
  }

  return {
    size: [width, height],
    fill: meta.fill,
    stroke: meta.stroke,
    lineWidth: type === 'target' ? 0 : 1.5,
    radius: 4,
    labelText: data.name || datum.id,
    labelFill: meta.labelFill,
    labelFontSize: type === 'target' ? 14 : 13,
    labelFontWeight: type === 'target' ? 600 : 500,
    labelPlacement: 'center',
    labelTextAlign: 'center',
    labelMaxWidth: width - 20,
    labelWordWrap: true,
    labelMaxLines: 1,
    labelTextOverflow: '...',
    cursor: 'pointer',
    badges: badges.length ? badges : undefined,
    ports: [{ placement: 'top' }, { placement: 'bottom' }],
  }
}

const EDGE_BASE_STYLE = {
  stroke: '#8ec5ef',
  lineWidth: 1,
  endArrow: true,
  endArrowSize: 6,
  radius: 0,
  router: false,
  labelFill: '#5a8fb8',
  labelFontSize: 11,
  labelFontWeight: 500,
  labelBackground: true,
  labelBackgroundFill: '#f7fbff',
  labelBackgroundRadius: 2,
  labelPadding: [2, 5],
  labelAutoRotate: false,
  labelTextBaseline: 'middle',
}

function getEdgeStyle(datum, pathMeta) {
  const ratio = pathMeta?.labelRatio ?? 0.5
  return {
    ...EDGE_BASE_STYLE,
    labelText: datum.data?.ratio || '',
    labelPlacement: ratio,
    labelOffsetX: pathMeta?.labelOffsetX ?? 10,
    labelOffsetY: pathMeta?.labelOffsetY ?? 0,
    labelTextAlign: pathMeta?.labelTextAlign ?? 'left',
    controlPoints: pathMeta?.controlPoints,
    sourcePort: pathMeta?.downward ? 'bottom' : 'top',
    targetPort: pathMeta?.downward ? 'top' : 'bottom',
  }
}

function buildEnrichedGraphData(posMap) {
  const { nodes, edges } = buildVisibleGraph(collapsedSet.value)

  const enrichedNodes = nodes.map((n) => {
    const datum = {
      ...n,
      data: {
        ...n.data,
        loadingExpand: expandingNodeId.value === n.id,
      },
    }
    return {
      ...datum,
      style: {
        ...getNodeStyle(datum),
        x: posMap[n.id]?.x ?? 0,
        y: posMap[n.id]?.y ?? 0,
      },
    }
  })

  const nodeMap = Object.fromEntries(enrichedNodes.map((n) => [n.id, n]))
  const enrichedEdges = edges.map((e) => {
    const pathMeta = buildEquityEdgePath(nodeMap[e.source], nodeMap[e.target], e.target)
    return { ...e, style: getEdgeStyle(e, pathMeta) }
  })

  return { nodes: enrichedNodes, edges: enrichedEdges }
}

function invalidatePositionCache() {
  positionCache = null
}

/** 懒加载子节点：在父节点下方增量落位，避免全图重排导致闪屏 */
function appendChildPositions(parentId, childIds, parentDatum) {
  if (!positionCache || !childIds.length) return
  const parent = positionCache[parentId]
  if (!parent) return

  const [, parentH] = getNodeSize(parentDatum || { data: { type: 'corp' } })
  const childSizes = childIds.map((id) => {
    const datum = getSourceNode(id) || { data: { type: 'corp' } }
    return getNodeSize(datum)
  })
  const maxChildH = Math.max(...childSizes.map(([, h]) => h), 40)
  const maxChildW = Math.max(...childSizes.map(([w]) => w), 152)
  const baseY = parent.y + parentH / 2 + LAYOUT_RANKSEP + maxChildH / 2
  const n = childIds.length
  // dagre nodesep 为间距；节点宽约 152，中心距需 ≥ 宽 + sep 才不重叠
  const siblingStep = maxChildW + LAYOUT_NODESEP

  childIds.forEach((id, i) => {
    if (positionCache[id]) return
    const dx = n === 1 ? 0 : (i - (n - 1) / 2) * siblingStep
    positionCache[id] = { x: parent.x + dx, y: baseY }
  })
}

async function ensurePositionCache() {
  if (positionCache) return positionCache
  // 对已载入的全量节点一次性布局并缓存；折叠/展开只显隐，不重排
  graph.setData(buildVisibleGraph(new Set()))
  await graph.prepare()
  const sim = await graph.context.layout.simulate()
  positionCache = Object.fromEntries(
    (sim?.nodes ?? []).map((n) => [
      n.id,
      { x: n.style?.x ?? n.x ?? 0, y: n.style?.y ?? n.y ?? 0 },
    ]),
  )
  return positionCache
}

async function drawGraphSilent() {
  await graph.prepare()
  const task = graph.context.element.draw({ animation: false, silence: true })
  if (task?.finished) await task.finished
}

async function renderGraph() {
  if (!graph || !hasEquityGraphSource()) return
  const firstPaint = isFirstPaint.value
  if (firstPaint) graphReady.value = false

  try {
    await ensurePositionCache()
    graph.setData(buildEnrichedGraphData(positionCache))
    await drawGraphSilent()
    if (firstPaint) {
      await graph.fitView(undefined, false)
      resizeGraph()
    }
  } finally {
    if (firstPaint) {
      graphReady.value = true
      isFirstPaint.value = false
    }
  }
}

function resizeGraph() {
  const el = graphRef.value
  if (!graph || !el) return
  const { clientWidth, clientHeight } = el
  if (clientWidth > 0 && clientHeight > 0) {
    graph.resize(clientWidth, clientHeight)
  }
}

async function toggleNodeExpand(nodeId) {
  const collapsed = isEffectivelyCollapsed(nodeId, collapsedSet.value)

  if (!collapsed) {
    const next = new Set(collapsedSet.value)
    next.add(nodeId)
    collapsedSet.value = next
    await renderGraph()
    return
  }

  if (needsLazyLoad(nodeId)) {
    expandingNodeId.value = nodeId
    try {
      await fetchEquityChildren(nodeId, 600)
      await ensurePositionCache()
      appendChildPositions(nodeId, getChildIds(nodeId), getSourceNode(nodeId))
    } catch (err) {
      console.error(err)
      return
    } finally {
      expandingNodeId.value = null
    }
  }

  const next = new Set(collapsedSet.value)
  next.delete(nodeId)
  collapsedSet.value = next
  await renderGraph()
}

async function loadAndRender() {
  if (!graph) return
  loading.value = true
  loadError.value = null
  graphReady.value = false
  selectedNode.value = null

  try {
    await fetchEquityGraphData(800)
    invalidatePositionCache()
    isFirstPaint.value = true
    await renderGraph()
  } catch (err) {
    loadError.value = err?.message || '数据加载失败'
  } finally {
    loading.value = false
  }
}

function initGraph() {
  const container = graphRef.value
  if (!container) return

  graph = new Graph({
    container,
    autoFit: false,
    padding: [48, 64, 48, 64],
    data: { nodes: [], edges: [] },
    behaviors: ['drag-canvas', 'zoom-canvas'],
    node: {
      type: 'rect',
    },
    edge: {
      type: 'polyline',
      style: EDGE_BASE_STYLE,
    },
    layout: {
      type: 'antv-dagre',
      rankdir: 'TB',
      align: 'UL',
      nodesep: 48,
      ranksep: 88,
      controlPoints: false,
      animation: false,
    },
    plugins: [
      {
        type: 'tooltip',
        trigger: 'pointerenter',
        enable: (event) => event.targetType === 'node',
        getContent: (_event, items) => {
          const item = items[0]
          if (!item) return ''
          const data = item.data || {}
          return [
            `<div class="g6-tooltip-title">${data.name || item.id}</div>`,
            `<div>类型：${typeLabel(data.type)}</div>`,
            data.region ? `<div>标签：${data.region}</div>` : '',
          ].join('')
        },
      },
      {
        type: 'toolbar',
        position: 'top-right',
        getItems: () => [
          { id: 'zoom-in', value: 'zoom-in' },
          { id: 'zoom-out', value: 'zoom-out' },
          { id: 'auto-fit', value: 'fit' },
        ],
        onClick: (value) => {
          if (value === 'zoom-in') graph.zoomBy(1.2)
          if (value === 'zoom-out') graph.zoomBy(0.8)
          if (value === 'fit') graph.fitView()
        },
      },
    ],
  })

  graph.on('node:click', (event) => {
    const id = event.target?.id
    if (!id) return

    const nodeData = graph.getNodeData(id)
    const data = nodeData?.data || {}

    if (isNodeCollapsible(id)) {
      void toggleNodeExpand(id)
      return
    }

    selectedNode.value = { ...data }
  })

  resizeGraph()

  resizeObserver = new ResizeObserver(() => {
    if (!graphReady.value || !graph) return
    resizeGraph()
  })
  resizeObserver.observe(graphRef.value)
}

onMounted(() => {
  initGraph()
  void loadAndRender()
})

onUnmounted(() => {
  resizeObserver?.disconnect()
  graph?.destroy()
  graph = null
  positionCache = null
  expandingNodeId.value = null
})
</script>

<style scoped>
.equity-page {
  --eq-bg: #eef5fb;
  --eq-text: #1a3a52;
  --eq-muted: rgba(26, 58, 82, 0.58);
  --eq-border: rgba(74, 159, 216, 0.2);

  display: flex;
  flex: 1;
  flex-direction: column;
  width: 100%;
  height: 100%;
  min-height: 0;
  color: var(--eq-text);
  background: var(--eq-bg);
}

.equity-header {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  gap: 1rem 2rem;
  align-items: flex-end;
  justify-content: space-between;
  padding: 1rem 1.5rem;
  background: #ffffff;
  border-bottom: 1px solid var(--eq-border);
}

.equity-header-main h1 {
  margin: 0 0 0.3rem;
  font-size: 1.35rem;
  font-weight: 700;
}

.equity-header-main p {
  margin: 0;
  font-size: 0.86rem;
  color: var(--eq-muted);
}

.equity-legend {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem 1rem;
  margin: 0;
  padding: 0;
  list-style: none;
  font-size: 0.8rem;
  color: var(--eq-muted);
}

.equity-legend li {
  display: flex;
  gap: 0.35rem;
  align-items: center;
}

.dot {
  width: 10px;
  height: 10px;
  border-radius: 2px;
}

.dot--target {
  background: #4a9fd8;
}

.dot--corp {
  background: #8ec5ef;
  border: 1px solid #5a8fb8;
}

.dot--person {
  background: #fce8ee;
  border: 1px solid #f0a8be;
}

.equity-body {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.equity-status {
  position: absolute;
  inset: 0;
  z-index: 3;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  align-items: center;
  justify-content: center;
  color: var(--eq-muted);
  background: var(--eq-bg);
}

.equity-status p {
  margin: 0;
  font-size: 0.9rem;
}

.equity-status--error p {
  color: #b44;
}

.equity-status-spinner {
  width: 28px;
  height: 28px;
  border: 3px solid rgba(74, 159, 216, 0.2);
  border-top-color: #4a9fd8;
  border-radius: 50%;
  animation: equity-spin 0.8s linear infinite;
}

@keyframes equity-spin {
  to {
    transform: rotate(360deg);
  }
}

.equity-status-retry {
  padding: 0.4rem 1rem;
  font-size: 0.84rem;
  cursor: pointer;
  background: #fff;
  border: 1px solid var(--eq-border);
  border-radius: 6px;
}

.equity-graph {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  visibility: hidden;
}

.equity-graph--ready {
  visibility: visible;
}

.equity-panel {
  position: absolute;
  top: 1rem;
  right: 1rem;
  z-index: 2;
  width: min(260px, calc(100% - 2rem));
  padding: 1rem;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid var(--eq-border);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(26, 58, 82, 0.1);
}

.equity-panel h2 {
  margin: 0 0 0.65rem;
  font-size: 0.9rem;
}

.equity-panel dl {
  margin: 0;
  font-size: 0.84rem;
}

.equity-panel dt {
  margin-top: 0.5rem;
  color: var(--eq-muted);
}

.equity-panel dt:first-child {
  margin-top: 0;
}

.equity-panel dd {
  margin: 0.1rem 0 0;
  font-weight: 600;
}

.equity-panel-close {
  width: 100%;
  margin-top: 0.75rem;
  padding: 0.4rem;
  font-size: 0.8rem;
  cursor: pointer;
  background: #eef5fb;
  border: 1px solid var(--eq-border);
  border-radius: 6px;
}

:global(.g6-tooltip) {
  padding: 8px 10px !important;
  font-size: 12px !important;
  line-height: 1.5 !important;
  color: #1a3a52 !important;
  background: #fff !important;
  border: 1px solid rgba(74, 159, 216, 0.25) !important;
  border-radius: 6px !important;
  box-shadow: 0 6px 16px rgba(26, 58, 82, 0.1) !important;
}

:global(.g6-tooltip-title) {
  margin-bottom: 4px;
  font-weight: 600;
}
</style>
