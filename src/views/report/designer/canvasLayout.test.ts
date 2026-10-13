/* eslint-disable @typescript-eslint/no-explicit-any -- 图表 option 结构断言需宽松索引访问，属测试断言便利（限定本文件） */
import { describe, expect, it } from 'vitest'
import {
  appendChart,
  clampChartType,
  clampSpan,
  cycleSpan,
  moveChart,
  nextChartId,
  parseLayout,
  removeChart
} from './canvasLayout'
import { buildChartOption, buildStatValue, pickLabels, pickValues } from './chartOption'
import type { DashboardChart } from '@/api/report'

const chart = (over: Partial<DashboardChart> = {}): Omit<DashboardChart, 'chartId'> => ({
  chartType: 'bar',
  datasetId: 1,
  title: 't',
  span: 12,
  xField: 'day',
  yField: 'cnt',
  ...over
})

describe('canvasLayout', () => {
  it('clampSpan：非法回退最近档位，缺省 12', () => {
    expect(clampSpan(12)).toBe(12)
    expect(clampSpan(10)).toBe(12)
    expect(clampSpan(99)).toBe(24)
    expect(clampSpan('x')).toBe(12)
  })

  it('clampChartType：非法回退 bar', () => {
    expect(clampChartType('pie')).toBe('pie')
    expect(clampChartType('banana')).toBe('bar')
  })

  it('nextChartId：跳过已占用', () => {
    const used = [{ ...chart(), chartId: 'chart_1' }, { ...chart(), chartId: 'chart_2' }]
    expect(nextChartId(used)).toBe('chart_3')
    expect(nextChartId([])).toBe('chart_1')
  })

  it('parseLayout：脏数据清洗 + 无绑定卡片丢弃 + chartId 重复重排', () => {
    const layout = parseLayout({
      schemaVersion: 9,
      charts: [
        { chartId: 'chart_1', chartType: 'line', datasetId: 3, span: 16, xField: 'd', yField: 'v' },
        { chartType: 'pie', datasetId: 'not-a-number' }, // 无有效 datasetId → 丢弃
        { chartId: 'chart_1', chartType: 'banana', datasetId: 5 }, // 重复 id + 非法类型
        'garbage'
      ]
    })
    expect(layout.schemaVersion).toBe(2)
    expect(layout.charts).toHaveLength(2)
    expect(layout.charts[0].chartType).toBe('line')
    expect(layout.charts[1].chartType).toBe('bar') // 非法类型回退
    expect(layout.charts[1].chartId).not.toBe('chart_1')
  })

  it('parseLayout：非对象输入 → 空布局', () => {
    expect(parseLayout(null).charts).toHaveLength(0)
    expect(parseLayout('junk').charts).toHaveLength(0)
  })

  it('cycleSpan：档位循环', () => {
    const charts = [{ ...chart(), chartId: 'a', span: 24 as const }]
    expect(cycleSpan(charts, 'a')[0].span).toBe(8)
    expect(cycleSpan(charts, 'missing')).toEqual(charts)
  })

  it('moveChart：交换与越界', () => {
    const charts = [
      { ...chart(), chartId: 'a' },
      { ...chart(), chartId: 'b' }
    ]
    expect(moveChart(charts, 'b', -1).map((c) => c.chartId)).toEqual(['b', 'a'])
    expect(moveChart(charts, 'a', -1)).toEqual(charts)
    expect(moveChart(charts, 'a', 1).map((c) => c.chartId)).toEqual(['b', 'a'])
  })

  it('removeChart / appendChart', () => {
    let charts = [{ ...chart(), chartId: 'chart_1' }]
    charts = removeChart(charts, 'chart_1')
    expect(charts).toHaveLength(0)
    charts = appendChart(charts, chart())
    expect(charts[0].chartId).toBe('chart_1')
  })
})

describe('chartOption', () => {
  const rows = [
    { day: '周一', cnt: 5, kind: '登录', ratio: 62 },
    { day: '周二', cnt: 8, kind: '操作', ratio: 41 }
  ]

  it('bar/line：labels + values 合成', () => {
    const opt = buildChartOption({ ...chart(), chartId: 'x', chartType: 'bar' }, rows) as Record<string, any>
    expect(opt.xAxis.data).toEqual(['周一', '周二'])
    expect(opt.series[0].data).toEqual([5, 8])
  })

  it('pie：name/value 组对', () => {
    const opt = buildChartOption(
      { ...chart(), chartId: 'x', chartType: 'pie', xField: undefined, nameField: 'kind', valueField: 'cnt' },
      rows
    ) as Record<string, any>
    expect(opt.series[0].data).toEqual([
      { name: '登录', value: 5 },
      { name: '操作', value: 8 }
    ])
  })

  it('gauge：取首行数值', () => {
    const opt = buildChartOption(
      { ...chart(), chartId: 'x', chartType: 'gauge', xField: undefined, yField: undefined, valueField: 'ratio' },
      rows
    ) as Record<string, any>
    expect(opt.series[0].data[0].value).toBe(62)
  })

  it('缺字段绑定或 stat/table → null（组件自渲染/空态）', () => {
    expect(buildChartOption({ ...chart(), chartId: 'x', yField: undefined }, rows)).toBeNull()
    expect(buildChartOption({ ...chart(), chartId: 'x', chartType: 'table' }, rows)).toBeNull()
    expect(buildChartOption({ ...chart(), chartId: 'x', chartType: 'stat' }, rows)).toBeNull()
    expect(buildStatValue({ ...chart(), chartId: 'x', chartType: 'stat', valueField: 'cnt' }, rows)).toBe(5)
    expect(buildStatValue({ ...chart(), chartId: 'x', chartType: 'stat' }, rows)).toBeNull()
  })

  it('pickValues 过滤非有限值', () => {
    expect(pickValues([{ v: 1 }, { v: 'x' }, {}], 'v')).toEqual([1])
    expect(pickLabels([{ k: 'a' }, { k: '' }], 'k')).toEqual(['a'])
  })
})
