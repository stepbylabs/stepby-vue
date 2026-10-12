/**
 * 仪表盘可拖拽布局 · 纯逻辑（无浏览器副作用，便于单测）
 *
 * 将「有哪些卡片、默认顺序 / 宽度 / 显隐、持久化结构如何清洗合并」从组件中抽离，
 * 与 useDashboardLayout（localStorage 读写）分离。
 */

/** 卡片唯一标识（同时也是持久化布局里存储的 id） */
export type WidgetId =
  | 'stats'
  | 'quickEntry'
  | 'flowTodo'
  | 'loginTrend'
  | 'operPie'
  | 'userTrend'
  | 'recentOperLog'

/** 栅格宽度（24 列制，与 el-col :span 对齐） */
export type WidgetSpan = 8 | 12 | 16 | 24

/** 允许调整的宽度档位（升序） */
export const SPAN_STEPS: WidgetSpan[] = [8, 12, 16, 24]

/** 卡片元数据定义 */
export interface WidgetDef {
  id: WidgetId
  /** 标题 i18n key（dashboard.layout.*） */
  titleKey: string
  /** Element Plus 图标组件名（字符串，模板动态解析） */
  icon: string
  /** 默认宽度 */
  defaultSpan: WidgetSpan
  /** 该卡片是否可调整宽度（统计 / 快捷入口为整行，不参与宽度切换） */
  resizable: boolean
}

/** 卡片注册表：数组顺序即「恢复默认」后的展示顺序 */
export const WIDGET_REGISTRY: WidgetDef[] = [
  { id: 'stats', titleKey: 'dashboard.layout.widgetStats', icon: 'DataLine', defaultSpan: 24, resizable: false },
  { id: 'quickEntry', titleKey: 'dashboard.layout.widgetQuickEntry', icon: 'Grid', defaultSpan: 24, resizable: false },
  { id: 'flowTodo', titleKey: 'flow.cardMyTodo', icon: 'Bell', defaultSpan: 8, resizable: true },
  { id: 'loginTrend', titleKey: 'dashboard.loginTrend', icon: 'TrendCharts', defaultSpan: 16, resizable: true },
  { id: 'operPie', titleKey: 'dashboard.operTypeDist', icon: 'PieChart', defaultSpan: 8, resizable: true },
  { id: 'userTrend', titleKey: 'dashboard.userCreateTrend', icon: 'Histogram', defaultSpan: 12, resizable: true },
  { id: 'recentOperLog', titleKey: 'dashboard.recentOperLog', icon: 'List', defaultSpan: 12, resizable: true }
]

/** 单个卡片在用户布局里的实例 */
export interface LayoutItem {
  id: WidgetId
  span: WidgetSpan
  visible: boolean
}

/** 按注册表顺序生成默认布局（全部可见、默认宽度） */
export function defaultLayout(): LayoutItem[] {
  return WIDGET_REGISTRY.map((w) => ({ id: w.id, span: w.defaultSpan, visible: true }))
}

function findDef(id: unknown): WidgetDef | undefined {
  return WIDGET_REGISTRY.find((w) => w.id === id)
}

/** 归一化单个宽度档位（非法值回退到最近档位或默认） */
function clampSpan(raw: unknown, fallback: WidgetSpan): WidgetSpan {
  if (SPAN_STEPS.includes(raw as WidgetSpan)) return raw as WidgetSpan
  const num = Number(raw)
  if (Number.isFinite(num)) {
    // 命中最近的不小于自身的档位，保证仍是合法档
    const hit = SPAN_STEPS.find((s) => s >= num)
    if (hit) return hit
  }
  return fallback
}

/**
 * 清洗 / 合并来自 localStorage 的未知布局为合法 LayoutItem[]：
 * - 丢弃注册表里不存在的 id（防止脏数据 / 已下线卡片残留）
 * - 去重（保留首次出现）
 * - 归一化 span 到合法档位、visible 强制布尔
 * - 已保留卡片维持用户自定义相对顺序
 * - 追加注册表里缺失的卡片（如版本新增卡片），按其默认宽度、可见补到末尾
 */
export function normalizeLayout(raw: unknown): LayoutItem[] {
  const base = defaultLayout()
  if (!Array.isArray(raw)) return base

  const seen = new Set<WidgetId>()
  const result: LayoutItem[] = []
  for (const entry of raw) {
    if (typeof entry !== 'object' || entry === null) continue
    const rec = entry as Record<string, unknown>
    const def = findDef(rec.id)
    if (!def || seen.has(def.id)) continue
    seen.add(def.id)
    result.push({
      id: def.id,
      span: clampSpan(rec.span, def.defaultSpan),
      visible: rec.visible !== false
    })
  }

  // 追加注册表里缺失的卡片（默认相对顺序补到末尾）
  for (const b of base) {
    if (!seen.has(b.id)) result.push(b)
  }
  return result.length ? result : base
}

/** 在可拖拽列表内移动元素（无第三方依赖时的兜底实现） */
export function moveById(list: LayoutItem[], fromId: WidgetId, toId: WidgetId): LayoutItem[] {
  const next = list.slice()
  const from = next.findIndex((i) => i.id === fromId)
  const to = next.findIndex((i) => i.id === toId)
  if (from < 0 || to < 0 || from === to) return next
  const [item] = next.splice(from, 1)
  next.splice(to, 0, item)
  return next
}

/** 切换宽度到下一档位（循环），供卡片头「宽度」按钮使用 */
export function nextSpan(span: WidgetSpan): WidgetSpan {
  const idx = SPAN_STEPS.indexOf(span)
  return SPAN_STEPS[(idx + 1) % SPAN_STEPS.length] ?? span
}
