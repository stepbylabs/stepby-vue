/**
 * 性能优化：echarts 按需导入
 *
 * 设计目标：
 * - 仅注册项目实际使用的图表类型和组件，减少 bundle 体积
 * - 统一入口，避免各页面重复注册
 * - 保留 `echarts.init` / `ECharts` / `EChartsOption` 等常用 API
 *
 * 使用方式：
 *   import echarts, { type ECharts, type EChartsOption } from '@/utils/echarts'
 *   const chart: ECharts = echarts.init(domEl)
 *   const option: EChartsOption = { ... }
 *
 * 已注册的图表类型（按项目实际使用情况）：
 * - LineChart（折线图）
 * - BarChart（柱状图）
 * - PieChart（饼图）
 * - GaugeChart（仪表盘）
 *
 * 已注册的组件：
 * - TitleComponent（标题）
 * - TooltipComponent（提示框）
 * - LegendComponent（图例）
 * - GridComponent（直角坐标系）
 * - DataZoomComponent（数据区域缩放）
 * - MarkLineComponent（标线）
 * - MarkPointComponent（标点）
 *
 * 渲染器：CanvasRenderer
 */
import * as echarts from 'echarts/core'

// 按需注册图表类型
import { LineChart, BarChart, PieChart, GaugeChart } from 'echarts/charts'

// 按需注册组件
import {
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent
} from 'echarts/components'

// 按需注册特性
// LegacyGridContainLabel: ECharts 6 中 grid.containLabel 已弃用，
// 注册此特性可保持与 ECharts 5 完全一致的 containLabel 行为，避免视觉变化
import { LegacyGridContainLabel } from 'echarts/features'

// 按需注册渲染器
import { CanvasRenderer } from 'echarts/renderers'

// 注册所有按需引入的模块（只执行一次）
echarts.use([
  // 图表
  LineChart,
  BarChart,
  PieChart,
  GaugeChart,
  // 组件
  TitleComponent,
  TooltipComponent,
  LegendComponent,
  GridComponent,
  DataZoomComponent,
  MarkLineComponent,
  MarkPointComponent,
  // 特性
  LegacyGridContainLabel,
  // 渲染器
  CanvasRenderer
])

// 重新导出常用类型与 init 函数
export type { ECharts, EChartsOption, ECElementEvent } from 'echarts'
export default echarts
