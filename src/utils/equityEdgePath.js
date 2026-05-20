/**
 * 股权穿透图折线：源下 → 水平总线 → 子节点上竖线汇入
 * 股东→标的：比例在源侧竖线中段；标的/父→子：比例在子侧竖线中段
 */

const BUS_GAP = 22

function getNodeBox(node) {
  const [w, h] = node.style?.size || [152, 40]
  const x = node.style?.x ?? 0
  const y = node.style?.y ?? 0
  return {
    x,
    y,
    w,
    h,
    top: y - h / 2,
    bottom: y + h / 2,
    left: x - w / 2,
    right: x + w / 2,
  }
}

function calcLabelRatioOnSegment(points, segmentIndex, t = 0.5) {
  const lengths = []
  let total = 0
  for (let i = 0; i < points.length - 1; i++) {
    const len = Math.hypot(
      points[i + 1][0] - points[i][0],
      points[i + 1][1] - points[i][1],
    )
    lengths.push(len)
    total += len
  }
  if (total <= 0) return 0.5
  let acc = 0
  for (let i = 0; i < segmentIndex; i++) acc += lengths[i]
  return (acc + lengths[segmentIndex] * t) / total
}

/**
 * @param {string} edgeTarget - 边的 target 节点 id
 */
export function buildEquityEdgePath(sourceNode, targetNode, edgeTarget) {
  const s = getNodeBox(sourceNode)
  const t = getNodeBox(targetNode)
  const downward = s.y < t.y

  let points
  if (downward) {
    const busY = t.top - BUS_GAP
    points = [
      [s.x, s.bottom],
      [s.x, busY],
      [t.x, busY],
      [t.x, t.top],
    ]
  } else {
    const busY = t.bottom + BUS_GAP
    points = [
      [s.x, s.top],
      [s.x, busY],
      [t.x, busY],
      [t.x, t.bottom],
    ]
  }

  const controlPoints = points.slice(1, -1)
  const labelOnSourceSide = edgeTarget === 'target'
  const labelSegmentIndex = labelOnSourceSide ? 0 : points.length - 2
  const labelRatio = calcLabelRatioOnSegment(points, labelSegmentIndex, 0.5)

  return {
    controlPoints,
    labelRatio,
    labelOffsetX: labelOnSourceSide ? 10 : 10,
    labelOffsetY: 0,
    labelTextAlign: 'left',
    downward,
  }
}
