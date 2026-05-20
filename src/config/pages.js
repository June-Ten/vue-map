/**
 * 应用页面注册表 — 新增页面时在此追加一项即可，Home 会自动展示入口。
 *
 * 步骤：
 * 1. 在 src/views/ 下新建页面组件
 * 2. 在 appPages 数组末尾添加配置（path / name / title / component 必填）
 * 3. meta.fullscreen: true 时全屏展示（如数据大屏），隐藏顶栏
 */
export const appPages = [
  {
    path: '/about',
    name: 'About',
    title: 'About',
    navLabel: 'About',
    description: 'Vue Router 基础示例页面。',
    tags: ['示例'],
    component: () => import('../views/About.vue'),
  },
  {
    path: '/article',
    name: 'Article',
    title: '文章详情',
    navLabel: 'Article',
    description: '长文渲染与 HTML 展示示例。',
    tags: ['内容'],
    component: () => import('../views/Article.vue'),
  },
  {
    path: '/dashboard',
    name: 'Dashboard',
    title: '3D 数据大屏',
    navLabel: 'Dashboard',
    description: '中国地图三维可视化，含省份交互与人口柱图。',
    tags: ['Three.js', 'D3', '全屏'],
    component: () => import('../views/Dashboard.vue'),
    meta: { fullscreen: true },
  },
  {
    path: '/equity',
    name: 'EquityPenetration',
    title: '股权穿透图',
    navLabel: '股权穿透',
    description: 'AntV G6 5 缩进树展示股东与投资关系穿透结构。',
    tags: ['G6', '树图'],
    component: () => import('../views/EquityPenetration.vue'),
    meta: { fullscreen: true },
  },
]
