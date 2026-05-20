/**
 * 股权穿透图数据（中心标的 + 股东 + 对外投资，子节点可懒加载）
 */

/** 首屏骨架：不含需点击 + 才加载的子节点 */
export const equityGraphInitial = {
  nodes: [
    {
      id: 'target',
      data: {
        name: '未来汽车科技集团有限公司',
        type: 'target',
        region: '中华人民共和国',
        creditCode: '91330100MA2H8K3X2P',
      },
    },
    { id: 'sh-1', data: { name: '高瓴岭妍（香港）控股有限公司', type: 'corp', region: '中国香港' } },
    { id: 'sh-2', data: { name: '红杉隽成（香港）投资有限公司', type: 'corp', region: '中国香港' } },
    { id: 'sh-3', data: { name: '腾讯睿力（香港）有限公司', type: 'corp', region: '中国香港' } },
    { id: 'sh-4', data: { name: '顺为资本（香港）有限公司', type: 'corp', region: '中国香港' } },
    { id: 'sh-5', data: { name: '小米紫米（香港）科技有限公司', type: 'corp', region: '中国香港' } },
    { id: 'sh-6', data: { name: '经纬成长（香港）投资有限公司', type: 'corp', region: '中国香港' } },
    { id: 'sh-7', data: { name: '淡马锡富敦（香港）控股有限公司', type: 'corp', region: '中国香港' } },
    { id: 'sh-8', data: { name: '宁波梅山保税港区蔚澜投资合伙企业（有限合伙）', type: 'corp', region: '中国大陆' } },
    { id: 'inv-1', data: { name: '深圳未来动力科技有限公司', type: 'corp', region: '中国大陆' } },
    { id: 'inv-2', data: { name: '上海未来出行服务有限公司', type: 'corp', region: '中国大陆' } },
    { id: 'inv-3', data: { name: '北京未来智驾研究院有限公司', type: 'corp', region: '中国大陆' } },
    { id: 'inv-4', data: { name: '合肥未来能源科技有限公司', type: 'corp', region: '中国大陆' } },
  ],
  edges: [
    { id: 'e-sh-1', source: 'sh-1', target: 'target', data: { ratio: '1%' } },
    { id: 'e-sh-2', source: 'sh-2', target: 'target', data: { ratio: '33%' } },
    { id: 'e-sh-3', source: 'sh-3', target: 'target', data: { ratio: '14%' } },
    { id: 'e-sh-4', source: 'sh-4', target: 'target', data: { ratio: '1%' } },
    { id: 'e-sh-5', source: 'sh-5', target: 'target', data: { ratio: '1%' } },
    { id: 'e-sh-6', source: 'sh-6', target: 'target', data: { ratio: '1%' } },
    { id: 'e-sh-7', source: 'sh-7', target: 'target', data: { ratio: '1%' } },
    { id: 'e-sh-8', source: 'sh-8', target: 'target', data: { ratio: '1%' } },
    { id: 'e-inv-1', source: 'target', target: 'inv-1', data: { ratio: '26%' } },
    { id: 'e-inv-2', source: 'target', target: 'inv-2', data: { ratio: '78%' } },
    { id: 'e-inv-3', source: 'target', target: 'inv-3', data: { ratio: '90.00%' } },
    { id: 'e-inv-4', source: 'target', target: 'inv-4', data: { ratio: '67%' } },
  ],
  collapsibleParents: {},
  /** 有子级但尚未请求接口的节点 */
  lazyExpandable: ['inv-1', 'inv-4'],
}

/** 点击 + 时按父节点返回的子图片段（模拟接口） */
const equityChildrenPacks = {
  'inv-1': {
    nodes: [
      {
        id: 'inv-1-1',
        data: {
          name: '常州未来电池系统有限公司',
          type: 'corp',
          region: '中国大陆',
          parentId: 'inv-1',
        },
      },
    ],
    edges: [{ id: 'e-inv-1-1', source: 'inv-1', target: 'inv-1-1', data: { ratio: '67%' } }],
    collapsibleParents: {},
    lazyExpandable: [],
  },
  'inv-4': {
    nodes: [
      {
        id: 'inv-4-1',
        data: {
          name: '武汉未来储能装备制造有限公司',
          type: 'corp',
          region: '中国大陆',
          parentId: 'inv-4',
        },
      },
      {
        id: 'inv-4-2',
        data: {
          name: '南京未来充换电网络有限公司',
          type: 'corp',
          region: '中国大陆',
          parentId: 'inv-4',
        },
      },
    ],
    edges: [
      { id: 'e-inv-4-1', source: 'inv-4', target: 'inv-4-1', data: { ratio: '45%' } },
      { id: 'e-inv-4-2', source: 'inv-4', target: 'inv-4-2', data: { ratio: '32%' } },
    ],
    collapsibleParents: { 'inv-4-2': ['inv-4-2-1'] },
    lazyExpandable: ['inv-4-2'],
  },
  'inv-4-2': {
    nodes: [
      {
        id: 'inv-4-2-1',
        data: { name: '陈志远', type: 'person', region: '自然人股东', parentId: 'inv-4-2' },
      },
    ],
    edges: [{ id: 'e-inv-4-2-1', source: 'inv-4-2', target: 'inv-4-2-1', data: { ratio: '18%' } }],
    collapsibleParents: {},
    lazyExpandable: [],
  },
}

/** 全量 Mock（兼容导出） */
export const equityGraphMock = mergeGraphPayload(equityGraphInitial, ...Object.values(equityChildrenPacks))

/** @deprecated */
export const equityGraphFull = equityGraphMock

let graphSource = null
/** @type {Set<string>} */
const loadedChildParents = new Set()

function mergeGraphPayload(base, ...packs) {
  const nodeMap = new Map(base.nodes.map((n) => [n.id, n]))
  const edgeMap = new Map(base.edges.map((e) => [e.id, e]))
  const collapsibleParents = { ...base.collapsibleParents }
  const lazyExpandable = [...(base.lazyExpandable || [])]

  packs.forEach((pack) => {
    pack.nodes.forEach((n) => nodeMap.set(n.id, n))
    pack.edges.forEach((e) => edgeMap.set(e.id, e))
    Object.assign(collapsibleParents, pack.collapsibleParents || {})
    ;(pack.lazyExpandable || []).forEach((id) => {
      if (!lazyExpandable.includes(id)) lazyExpandable.push(id)
    })
  })

  return {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    collapsibleParents,
    lazyExpandable,
  }
}

function deriveChildIdsFromEdges(parentId, edges) {
  return [...new Set(edges.filter((e) => e.source === parentId).map((e) => e.target))]
}

function applyPackToSource(parentId, pack) {
  const nodeMap = new Map(graphSource.nodes.map((n) => [n.id, n]))
  const edgeMap = new Map(graphSource.edges.map((e) => [e.id, e]))
  pack.nodes.forEach((n) => nodeMap.set(n.id, n))
  pack.edges.forEach((e) => edgeMap.set(e.id, e))

  const collapsibleParents = { ...graphSource.collapsibleParents, ...(pack.collapsibleParents || {}) }
  const childIds = deriveChildIdsFromEdges(parentId, pack.edges)
  if (childIds.length) collapsibleParents[parentId] = childIds

  const lazy = new Set(graphSource.lazyExpandable || [])
  lazy.delete(parentId)
  ;(pack.lazyExpandable || []).forEach((id) => lazy.add(id))

  graphSource = {
    nodes: [...nodeMap.values()],
    edges: [...edgeMap.values()],
    collapsibleParents,
    lazyExpandable: [...lazy],
  }
  applyLazyCollapseHints()
}

/** 懒加载节点的子级 id 预登记，便于折叠时隐藏已加载的子树 */
function applyLazyCollapseHints() {
  if (!graphSource) return
  const cp = { ...graphSource.collapsibleParents }
  ;(graphSource.lazyExpandable || []).forEach((parentId) => {
    const pack = equityChildrenPacks[parentId]
    if (!pack) return
    const ids = deriveChildIdsFromEdges(parentId, pack.edges)
    if (ids.length) cp[parentId] = ids
  })
  graphSource.collapsibleParents = cp
}

export function setEquityGraphSource(payload) {
  graphSource = {
    nodes: [...payload.nodes],
    edges: [...payload.edges],
    collapsibleParents: { ...(payload.collapsibleParents || {}) },
    lazyExpandable: [...(payload.lazyExpandable || [])],
  }
  loadedChildParents.clear()
  applyLazyCollapseHints()
}

export function hasEquityGraphSource() {
  return graphSource != null
}

/** 从内存数据源取节点（懒加载并入后、尚未 setData 到 G6 时也可用） */
export function getSourceNode(id) {
  if (!graphSource) return null
  return graphSource.nodes.find((n) => n.id === id) ?? null
}

export function isChildrenLoaded(parentId) {
  return loadedChildParents.has(parentId)
}

export function needsLazyLoad(parentId) {
  if (!graphSource) return false
  if (loadedChildParents.has(parentId)) return false
  return (graphSource.lazyExpandable || []).includes(parentId)
}

/** 直接子节点 id（已加载的登记 + 未加载的懒加载） */
export function getChildIds(nodeId) {
  if (!graphSource) return []
  return graphSource.collapsibleParents[nodeId] || []
}

export function isNodeCollapsible(nodeId) {
  if (!graphSource) return false
  if (needsLazyLoad(nodeId)) return true
  return getChildIds(nodeId).length > 0
}

/** 子级是否处于收起态（含：懒加载未完成、或用户在 collapsedSet 中折叠） */
export function isEffectivelyCollapsed(nodeId, collapsedSet) {
  if (needsLazyLoad(nodeId)) return true
  return collapsedSet.has(nodeId)
}

/**
 * 模拟首屏异步加载
 */
export function fetchEquityGraphData(delayMs = 800) {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        setEquityGraphSource(equityGraphInitial)
        resolve(graphSource)
      } catch (err) {
        reject(err)
      }
    }, delayMs)
  })
}

/**
 * 模拟点击 + 展开时加载子节点
 * @param {string} parentId
 * @param {number} [delayMs=600]
 */
export function fetchEquityChildren(parentId, delayMs = 600) {
  const pack = equityChildrenPacks[parentId]
  if (!pack) {
    return Promise.reject(new Error(`暂无子节点数据: ${parentId}`))
  }
  if (loadedChildParents.has(parentId)) {
    return Promise.resolve(graphSource)
  }

  return new Promise((resolve, reject) => {
    setTimeout(() => {
      try {
        if (!graphSource) throw new Error('请先加载主图数据')
        applyPackToSource(parentId, pack)
        loadedChildParents.add(parentId)
        resolve(graphSource)
      } catch (err) {
        reject(err)
      }
    }, delayMs)
  })
}

function collectDescendants(parentId, hidden, collapsibleParents) {
  const children = collapsibleParents[parentId] || []
  children.forEach((childId) => {
    hidden.add(childId)
    collectDescendants(childId, hidden, collapsibleParents)
  })
}

export function buildVisibleGraph(collapsedSet = new Set()) {
  if (!graphSource) return { nodes: [], edges: [] }

  const { nodes: fullNodes, edges: fullEdges, collapsibleParents } = graphSource
  const hidden = new Set()
  collapsedSet.forEach((parentId) => collectDescendants(parentId, hidden, collapsibleParents))

  const nodes = fullNodes
    .filter((n) => !hidden.has(n.id))
    .map((n) => ({
      ...n,
      data: {
        ...n.data,
        collapsed: isEffectivelyCollapsed(n.id, collapsedSet),
        collapsible: isNodeCollapsible(n.id),
      },
    }))

  const nodeIds = new Set(nodes.map((n) => n.id))
  const edges = fullEdges.filter((e) => nodeIds.has(e.source) && nodeIds.has(e.target))

  return { nodes, edges }
}
