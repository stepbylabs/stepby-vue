/**
 * 审计大屏图表渲染 composable
 *
 * 从 audit-dashboard/index.vue 中抽取：
 * - 5 个图表渲染函数（趋势/饼图/Top 用户/Top 模块/失败趋势）
 * - 图表容器 ref 与图表实例变量
 * - 主题切换复用的最近一次数据缓存（lastDaily 等）
 * - resize 防抖逻辑
 * - 业务类型 code → 名称映射（formatBusinessType，与 operlog 共用 sys_oper_type 字典）
 *
 * 依赖说明：
 * - getChart/withDark 来自父组件 useChart() 调用（通过参数传入）
 * - readCssVar 默认导入自 @/composables/useChart，也可由父组件传入
 * - t 在 composable 内通过 useI18n() 获取
 * - sys_oper_type 字典 Ref 与饼图点击回调（onPieClick）由父组件注入
 */
import { ref, type Ref } from 'vue'
import type { ECharts, EChartsOption, ECElementEvent } from '@/utils/echarts'
import { readCssVar } from '@/composables/useChart'
import { selectDictLabel } from '@/utils/stepby'
import type { DictOption } from '@/types'

/** 饼图扇区点击回调参数（用于反查业务类型 code 并跳转 operlog） */
export interface PieClickParams {
  name?: string
  data?: { businessType?: number }
}

interface TrendData {
  date: string
  success: number
  fail: number
}
interface PieData {
  name: string
  value: number
}
interface TopUsersData {
  userName: string
  count: number
}
interface TopModulesData {
  moduleName: string
  count: number
}

export interface UseAuditChartsOptions {
  /** useChart() 返回的 getChart */
  getChart: (el: HTMLElement | null) => Promise<ECharts | null>
  /** useChart() 返回的 withDark（暗色模式适配） */
  withDark: <T extends EChartsOption>(chart: ECharts, option: T) => T
  /** 读取 CSS 变量颜色，缺省时使用 @/composables/useChart 导出的 readCssVar */
  readCssVar?: (name: string, fallback: string) => string
  /** sys_oper_type 字典（业务类型单一来源，与 operlog 共用） */
  sysOperType: Ref<DictOption[]>
  /** 饼图扇区点击回调（延迟注入：依赖 lastBusinessTypes，由父组件在创建后赋值） */
  onPieClick?: Ref<((params: PieClickParams) => void) | null>
}

export function useAuditCharts(options: UseAuditChartsOptions) {
  const { getChart, withDark, sysOperType, onPieClick } = options
  const cssVar = options.readCssVar ?? readCssVar
  const { t } = useI18n()

  const trendChartRef = ref<HTMLElement | null>(null)
  const pieChartRef = ref<HTMLElement | null>(null)
  const topUsersChartRef = ref<HTMLElement | null>(null)
  const topModulesChartRef = ref<HTMLElement | null>(null)
  const failTrendChartRef = ref<HTMLElement | null>(null)

  let trendChart: ECharts | null = null
  let pieChart: ECharts | null = null
  let topUsersChart: ECharts | null = null
  let topModulesChart: ECharts | null = null
  let failTrendChart: ECharts | null = null

  // 主题切换时复用最近一次数据重新渲染（避免重新请求接口）
  const lastDaily = ref<TrendData[]>([])
  const lastPieData = ref<PieData[]>([])
  const lastTopUsersData = ref<TopUsersData[]>([])
  const lastTopModulesData = ref<TopModulesData[]>([])

  /**
   * 业务类型 code → 中文名称映射
   * P1-3：统一使用 sys_oper_type 字典作为单一来源，与 operlog 页面共用，
   *      避免双份映射漂移；字典未加载时回退到原 i18n key
   */
  function formatBusinessType(code: number): string {
    const dictLabel = selectDictLabel(sysOperType.value, code)
    if (dictLabel && dictLabel !== '' + code) return dictLabel
    // 字典未加载时的回退（保持原有 i18n 行为）
    const map: Record<number, string> = {
      0: t('auditDashboard.businessType.other'),
      1: t('auditDashboard.businessType.insert'),
      2: t('auditDashboard.businessType.update'),
      3: t('auditDashboard.businessType.delete'),
      4: t('auditDashboard.businessType.grant'),
      5: t('auditDashboard.businessType.export'),
      6: t('auditDashboard.businessType.import'),
      7: t('auditDashboard.businessType.forceLogout'),
      8: t('auditDashboard.businessType.genCode'),
      9: t('auditDashboard.businessType.clean')
    }
    return map[code] || t('auditDashboard.report.unknownBusinessType', { type: code })
  }

  async function renderTrendChart(data: TrendData[]) {
    const chart = await getChart(trendChartRef.value)
    if (!chart) return
    trendChart = chart
    const dates = data.map((d) => d.date)
    const success = data.map((d) => d.success)
    const fail = data.map((d) => d.fail)
    chart.setOption(
      withDark(chart, {
        tooltip: { trigger: 'axis' },
        legend: { data: [t('common.successStatus'), t('common.fail')], right: 10 },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: dates },
        yAxis: { type: 'value', minInterval: 1 },
        series: [
          {
            name: t('common.successStatus'),
            type: 'line',
            smooth: true,
            data: success,
            areaStyle: {},
            itemStyle: { color: cssVar('--el-color-success', '#67c23a') }
          },
          {
            name: t('common.fail'),
            type: 'line',
            smooth: true,
            data: fail,
            areaStyle: {},
            itemStyle: { color: cssVar('--el-color-danger', '#f56c6c') }
          }
        ]
      }),
      true
    )
  }

  async function renderPieChart(data: PieData[]) {
    const chart = await getChart(pieChartRef.value)
    if (!chart) return
    pieChart = chart
    // P1-3：饼图点击扇区跳转 operlog（仅对真实业务类型数据生效，空数据占位不跳转）
    chart.off('click')
    chart.on('click', (params: ECElementEvent) => {
      if (params.name === t('common.noData')) return
      onPieClick?.value?.({ name: params.name })
    })
    const palette = [
      cssVar('--el-color-primary', '#409eff'),
      cssVar('--el-color-warning', '#e6a23c'),
      cssVar('--el-color-danger', '#f56c6c'),
      cssVar('--el-color-info', '#909399'),
      cssVar('--el-color-success', '#67c23a'),
      cssVar('--el-color-primary-light-3', '#9c64ff'),
      cssVar('--el-color-danger-light-3', '#ff7e7e')
    ]
    chart.setOption(
      withDark(chart, {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left' },
        series: [
          {
            name: t('auditDashboard.report.businessType'),
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            label: { show: true, formatter: '{b}: {c}' },
            data: data.length > 0 ? data : [{ name: t('common.noData'), value: 1 }],
            color: palette
          }
        ]
      }),
      true
    )
  }

  async function renderTopUsersChart(data: TopUsersData[]) {
    const chart = await getChart(topUsersChartRef.value)
    if (!chart) return
    topUsersChart = chart
    const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10)
    chart.setOption(
      withDark(chart, {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value', minInterval: 1 },
        yAxis: { type: 'category', data: sorted.map((d) => d.userName).reverse() },
        series: [
          {
            name: t('auditDashboard.report.operCount'),
            type: 'bar',
            data: sorted.map((d) => d.count).reverse(),
            itemStyle: { color: cssVar('--el-color-primary', '#409eff') }
          }
        ]
      }),
      true
    )
  }

  // 模块名可能较长，超出容器时截断显示，避免拥挤
  function truncateName(name: string, max = 18): string {
    return name.length > max ? `${name.slice(0, max)}...` : name
  }

  async function renderTopModulesChart(data: TopModulesData[]) {
    const chart = await getChart(topModulesChartRef.value)
    if (!chart) return
    topModulesChart = chart
    const sorted = [...data].sort((a, b) => b.count - a.count).slice(0, 10)
    chart.setOption(
      withDark(chart, {
        tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'value', minInterval: 1 },
        yAxis: {
          type: 'category',
          data: sorted.map((d) => truncateName(d.moduleName)).reverse(),
          axisLabel: { overflow: 'truncate', width: 110 }
        },
        series: [
          {
            name: t('auditDashboard.report.operCount'),
            type: 'bar',
            data: sorted.map((d) => d.count).reverse(),
            itemStyle: { color: cssVar('--el-color-success', '#67c23a') },
            label: { show: true, position: 'right' }
          }
        ]
      }),
      true
    )
  }

  async function renderFailTrendChart(data: TrendData[]) {
    const chart = await getChart(failTrendChartRef.value)
    if (!chart) return
    failTrendChart = chart
    chart.setOption(
      withDark(chart, {
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: data.map((d) => d.date) },
        yAxis: { type: 'value', minInterval: 1 },
        series: [
          {
            name: t('auditDashboard.chart.failCount'),
            type: 'bar',
            data: data.map((d) => d.fail),
            itemStyle: { color: cssVar('--el-color-danger', '#f56c6c') }
          }
        ]
      }),
      true
    )
  }

  // U18 优化：防抖 150ms，避免高频 resize 卡顿（多个图表同时 resize 开销大）
  let resizeTimer: ReturnType<typeof setTimeout> | null = null
  function handleResize() {
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      trendChart?.resize()
      pieChart?.resize()
      topUsersChart?.resize()
      topModulesChart?.resize()
      failTrendChart?.resize()
    }, 150)
  }

  /** 清理 resize 防抖定时器（组件卸载时调用） */
  function clearResizeTimer() {
    if (resizeTimer) {
      clearTimeout(resizeTimer)
      resizeTimer = null
    }
  }

  return {
    trendChartRef,
    pieChartRef,
    topUsersChartRef,
    topModulesChartRef,
    failTrendChartRef,
    lastDaily,
    lastPieData,
    lastTopUsersData,
    lastTopModulesData,
    formatBusinessType,
    renderTrendChart,
    renderPieChart,
    renderTopUsersChart,
    renderTopModulesChart,
    renderFailTrendChart,
    handleResize,
    clearResizeTimer
  }
}
