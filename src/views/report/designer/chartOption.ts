/**
 * 图表 echarts option 前端合成 · 纯函数（G-01 M2）
 *
 * layout_json 只存增量绑定（chartType/datasetId/字段名），运行时由本模块
 * 把 preview 返回的 rows 合成为完整 echarts option —— 存增量不存全量，
 * 后端 schema 演进不破坏存量大屏。
 */
import type { DashboardChart } from '@/api/report'

/** 从 rows 提取数值列（去重有序） */
export function pickValues(rows: Record<string, unknown>[], field: string | undefined): number[] {
  if (!field) return []
  return rows.map((r) => Number(r[field])).filter((n) => Number.isFinite(n))
}

/** 从 rows 提取类目/名称列（字符串化，去空） */
export function pickLabels(rows: Record<string, unknown>[], field: string | undefined): string[] {
  if (!field) return []
  return rows.map((r) => String(r[field] ?? '')).filter((s) => s !== '')
}

/**
 * 合成 echarts option（bar/line/pie/gauge 四种；stat/table 由组件自渲染，返回 null）
 * 缺字段绑定时返回 null（调用方渲染空态提示，而非半残图表）
 */
export function buildChartOption(
  chart: DashboardChart,
  rows: Record<string, unknown>[]
): Record<string, unknown> | null {
  switch (chart.chartType) {
    case 'bar':
    case 'line': {
      if (!chart.xField || !chart.yField) return null
      const labels = pickLabels(rows, chart.xField)
      const values = pickValues(rows, chart.yField)
      if (labels.length === 0) return null
      return {
        tooltip: { trigger: 'axis' },
        grid: { left: 40, right: 16, top: 32, bottom: 28 },
        xAxis: { type: 'category', data: labels },
        yAxis: { type: 'value' },
        series: [{ type: chart.chartType, data: values, itemStyle: { borderRadius: 2 } }]
      }
    }
    case 'pie': {
      if (!chart.nameField || !chart.valueField) return null
      const labels = pickLabels(rows, chart.nameField)
      const values = pickValues(rows, chart.valueField)
      if (labels.length === 0 || labels.length !== values.length) return null
      const data = labels.map((name, i) => ({ name, value: values[i] }))
      return {
        tooltip: { trigger: 'item' },
        legend: { orient: 'horizontal', bottom: 0 },
        series: [{ type: 'pie', radius: ['38%', '66%'], data, avoidLabelOverlap: true }]
      }
    }
    case 'gauge': {
      if (!chart.valueField) return null
      const values = pickValues(rows, chart.valueField)
      if (values.length === 0) return null
      return {
        series: [
          {
            type: 'gauge',
            min: 0,
            max: 100,
            progress: { show: true },
            axisLine: { lineStyle: { width: 10 } },
            detail: { formatter: '{value}' },
            data: [{ value: values[0] }]
          }
        ]
      }
    }
    default:
      // stat / table 由组件自渲染，不产 echarts option
      return null
  }
}

/** stat 卡片的聚合值（rows 首行 valueField；缺绑定返回 null） */
export function buildStatValue(chart: DashboardChart, rows: Record<string, unknown>[]): number | null {
  if (!chart.valueField) return null
  const values = pickValues(rows, chart.valueField)
  return values.length > 0 ? values[0] : null
}
