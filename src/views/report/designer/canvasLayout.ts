/**
 * 报表设计器画布布局 · 纯逻辑（无浏览器副作用，便于单测）
 *
 * 与首页 dashboardLayout.ts 同范式：24 列栅格 + 档位归一 + 持久化清洗合并。
 * layout_json 存「增量」——图表卡片只存 chartType/datasetId/字段绑定，
 * echarts option 由 chartOption.ts 运行时合成（升级不兼容风险最小化）。
 */
import type { DashboardChart, ChartType } from '@/api/report'

/** 布局持久化结构（后端仅校验 schemaVersion ∈ 1..=10） */
export interface ReportLayout {
  schemaVersion: number
  charts: DashboardChart[]
}

export const LAYOUT_SCHEMA_VERSION = 2

/** 允许调整的宽度档位（升序，24 列制） */
export const CHART_SPAN_STEPS = [8, 12, 16, 24] as const
export type ChartSpan = (typeof CHART_SPAN_STEPS)[number]

/** 首版六种图表 */
export const CHART_TYPES: ChartType[] = ['bar', 'line', 'pie', 'gauge', 'stat', 'table']

/** 归一化宽度档位（非法值回退最近档位，超出上界取最大档，缺省 12） */
export function clampSpan(raw: unknown): ChartSpan {
  const num = Number(raw)
  if (CHART_SPAN_STEPS.includes(num as ChartSpan)) return num as ChartSpan
  if (Number.isFinite(num)) {
    const hit = CHART_SPAN_STEPS.find((s) => s >= num)
    if (hit) return hit
    return CHART_SPAN_STEPS[CHART_SPAN_STEPS.length - 1]
  }
  return 12
}

/** 归一化图表类型（非法值回退 bar——fail-safe，宁可不显示也不崩） */
export function clampChartType(raw: unknown): ChartType {
  return CHART_TYPES.includes(raw as ChartType) ? (raw as ChartType) : 'bar'
}

/** 生成短 ID（画布内唯一即可；避免依赖 crypto.randomUUID 的环境差异） */
export function nextChartId(existing: DashboardChart[]): string {
  const used = new Set(existing.map((c) => c.chartId))
  for (let i = 1; ; i++) {
    const id = `chart_${i}`
    if (!used.has(id)) return id
  }
}

/** 清洗单张图表卡片（未知来源 JSON → 合法卡片，缺省补齐；chartId 缺失或与已有重复则重新排号） */
export function sanitizeChart(raw: unknown, existing: DashboardChart[]): DashboardChart | null {
  if (typeof raw !== 'object' || raw === null) return null
  const v = raw as Record<string, unknown>
  const datasetId = Number(v.datasetId)
  if (!Number.isFinite(datasetId) || datasetId <= 0) return null // 无数据绑定的卡片无意义
  const rawId = typeof v.chartId === 'string' ? v.chartId : ''
  const duplicated = rawId !== '' && existing.some((c) => c.chartId === rawId)
  return {
    chartId: rawId !== '' && !duplicated ? rawId : nextChartId(existing),
    chartType: clampChartType(v.chartType),
    datasetId,
    title: typeof v.title === 'string' ? v.title.slice(0, 64) : '',
    span: clampSpan(v.span),
    xField: typeof v.xField === 'string' ? v.xField : undefined,
    yField: typeof v.yField === 'string' ? v.yField : undefined,
    nameField: typeof v.nameField === 'string' ? v.nameField : undefined,
    valueField: typeof v.valueField === 'string' ? v.valueField : undefined
  }
}

/** 解析 layout_json（任意来源 → 合法布局；chartId 重复自动重排） */
export function parseLayout(raw: unknown): ReportLayout {
  const charts: DashboardChart[] = []
  if (typeof raw === 'object' && raw !== null && Array.isArray((raw as Record<string, unknown>).charts)) {
    for (const item of (raw as Record<string, unknown>).charts as unknown[]) {
      const c = sanitizeChart(item, charts)
      if (c) charts.push(c)
    }
  }
  return { schemaVersion: LAYOUT_SCHEMA_VERSION, charts }
}

/** 调整宽度（档位循环切换） */
export function cycleSpan(charts: DashboardChart[], chartId: string): DashboardChart[] {
  return charts.map((c) => {
    if (c.chartId !== chartId) return c
    const idx = CHART_SPAN_STEPS.indexOf(c.span)
    const next = CHART_SPAN_STEPS[(idx + 1) % CHART_SPAN_STEPS.length]
    return { ...c, span: next }
  })
}

/** 上移/下移（与相邻项交换；越界原样返回） */
export function moveChart(charts: DashboardChart[], chartId: string, dir: -1 | 1): DashboardChart[] {
  const idx = charts.findIndex((c) => c.chartId === chartId)
  const target = idx + dir
  if (idx < 0 || target < 0 || target >= charts.length) return charts
  const next = [...charts]
  ;[next[idx], next[target]] = [next[target], next[idx]]
  return next
}

/** 删除图表 */
export function removeChart(charts: DashboardChart[], chartId: string): DashboardChart[] {
  return charts.filter((c) => c.chartId !== chartId)
}

/** 追加图表（新增后返回新数组；chartId 自动排号） */
export function appendChart(charts: DashboardChart[], seed: Omit<DashboardChart, 'chartId'>): DashboardChart[] {
  return [...charts, { ...seed, chartId: nextChartId(charts) }]
}
