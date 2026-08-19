/**
 * Dashboard 图表渲染 composable
 *
 * 从 dashboard/index.vue 中抽取：登录趋势 / 操作类型分布 / 用户创建趋势
 * 三组图表的渲染、下载、resize 防抖、加载/错误状态管理。
 *
 * 依赖（通过参数注入，避免在 composable 内重复创建 useChart 实例）：
 *   - getChart / withDark：来自 useChart()
 *   - readCssVar：读取 CSS 变量（@/composables/useChart 导出）
 *
 * 数据加载逻辑（loadLoginTrend / loadUserTrend / loadOperPie）保留在 index.vue，
 * 通过本 composable 返回的 setLoginData / lastTypeCount / lastUserTrend /
 * hasOperData / chartLoading / chartError 与渲染方法协作。
 */
import { ref, watch, onBeforeUnmount } from 'vue'
import type { ECharts, EChartsOption } from '@/utils/echarts'
import { ElMessage } from 'element-plus'
import { errorHub } from '@/utils/errorHub'
import { useI18n } from 'vue-i18n'

export type ChartName = 'login' | 'oper' | 'userTrend'

export interface LoginTrendItem {
  date: string
  success: number
  fail: number
}

export interface DashboardChartsDeps {
  getChart: (el: HTMLElement | null) => Promise<ECharts | null>
  withDark: <T extends EChartsOption>(chart: ECharts, option: T) => T
  readCssVar: (name: string, fallback: string) => string
}

export function useDashboardCharts(deps: DashboardChartsDeps) {
  const { t } = useI18n()

  const loginChartRef = ref<HTMLElement | null>(null)
  const operPieRef = ref<HTMLElement | null>(null)
  const userTrendRef = ref<HTMLElement | null>(null)
  const loginChartType = ref<'success' | 'fail' | 'all'>('all')

  // 各图表是否有数据：用于在无数据时显示空态占位，避免渲染成空白大框
  const hasLoginData = ref(false)
  const hasOperData = ref(false)
  const hasUserTrendData = ref(false)

  // U20 优化：图表加载/错误状态，提升用户感知
  const chartLoading = ref({ login: false, oper: false, userTrend: false })
  const chartError = ref({ login: false, oper: false, userTrend: false })

  // L8: loginData 用 let 模块变量（非 ref）是有意为之 - 数据加载后通过 renderLoginChart 直接消费，
  // 不需要响应式驱动视图更新（图表通过 setOption 显式更新），避免无谓的响应式开销。
  let loginData: LoginTrendItem[] = []
  // 主题切换时复用最近一次数据重新渲染（避免重新请求接口）
  const lastTypeCount = ref<Record<string, number>>({})
  const lastUserTrend = ref<{ dates: string[]; counts: number[] }>({ dates: [], counts: [] })

  // 图表实例：以非响应式 let 持有。返回给模板（:disabled="!loginChart" 等）时按 setup
  // 返回的"捕获值"暴露，与原有 index.vue 中 let 变量行为一致（不触发按钮响应式刷新）。
  let loginChart: ECharts | null = null
  let operPieChart: ECharts | null = null
  let userTrendChart: ECharts | null = null

  // U18 优化：ECharts resize 防抖，避免高频 resize 卡顿
  let resizeTimer: ReturnType<typeof setTimeout> | null = null

  /** 注入登录趋势数据（供 loadLoginTrend 调用后由 renderLoginChart 消费） */
  function setLoginData(data: LoginTrendItem[]): void {
    loginData = data
  }

  async function renderLoginChart() {
    if (!loginChartRef.value || loginData.length === 0) return
    loginChart = await deps.getChart(loginChartRef.value)
    if (!loginChart) return
    const dates = loginData.map((d) => d.date)
    const success = loginData.map((d) => d.success)
    const fail = loginData.map((d) => d.fail)
    const series: Array<{ name: string } & Record<string, unknown>> = []
    if (loginChartType.value === 'success' || loginChartType.value === 'all') {
      series.push({
        name: t('dashboard.buttonSuccess'),
        type: 'line',
        smooth: true,
        data: success,
        areaStyle: {},
        itemStyle: { color: deps.readCssVar('--el-color-success', '#67c23a') }
      })
    }
    if (loginChartType.value === 'fail' || loginChartType.value === 'all') {
      series.push({
        name: t('dashboard.buttonFail'),
        type: 'line',
        smooth: true,
        data: fail,
        areaStyle: {},
        itemStyle: { color: deps.readCssVar('--el-color-danger', '#f56c6c') }
      })
    }
    loginChart.setOption(
      deps.withDark(loginChart, {
        tooltip: { trigger: 'axis' },
        legend: { data: series.map((s) => s.name), right: 10 },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', boundaryGap: false, data: dates },
        yAxis: { type: 'value', minInterval: 1 },
        series
      }),
      true
    )
  }

  async function renderOperPie(typeCount: Record<string, number>) {
    if (!operPieRef.value) return
    operPieChart = await deps.getChart(operPieRef.value)
    if (!operPieChart) return
    const keyMap: Record<string, string> = {
      insert: t('common.add'),
      update: t('common.edit'),
      delete: t('common.delete'),
      other: t('common.other')
    }
    const data = Object.entries(typeCount)
      .filter(([_, v]) => v > 0)
      .map(([name, value]) => ({ name: keyMap[name] || name, value }))
    operPieChart.setOption(
      deps.withDark(operPieChart, {
        tooltip: { trigger: 'item', formatter: '{a}<br/>{b}: {c} ({d}%)' },
        legend: { orient: 'vertical', left: 'left' },
        series: [
          {
            name: t('dashboard.operTypeDist'),
            type: 'pie',
            radius: ['40%', '70%'],
            avoidLabelOverlap: false,
            label: { show: true, formatter: '{b}: {c}' },
            data,
            color: [
              deps.readCssVar('--el-color-primary', '#409eff'),
              deps.readCssVar('--el-color-warning', '#e6a23c'),
              deps.readCssVar('--el-color-danger', '#f56c6c'),
              deps.readCssVar('--el-color-info', '#909399')
            ]
          }
        ]
      }),
      true
    )
  }

  async function renderUserTrendChart(dates: string[], counts: number[]) {
    if (!userTrendRef.value) return
    userTrendChart = await deps.getChart(userTrendRef.value)
    if (!userTrendChart) return
    userTrendChart.setOption(
      deps.withDark(userTrendChart, {
        tooltip: { trigger: 'axis' },
        grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
        xAxis: { type: 'category', data: dates, axisLabel: { rotate: 30 } },
        yAxis: { type: 'value', minInterval: 1 },
        series: [
          {
            name: t('common.add'),
            type: 'bar',
            data: counts,
            itemStyle: { color: deps.readCssVar('--el-color-primary', '#409eff') }
          }
        ]
      }),
      true
    )
  }

  // 登录趋势类型切换时重新渲染
  watch(loginChartType, () => renderLoginChart())

  function handleResize() {
    // U18 优化：防抖 150ms，避免高频 resize 卡顿
    if (resizeTimer) clearTimeout(resizeTimer)
    resizeTimer = setTimeout(() => {
      loginChart?.resize()
      operPieChart?.resize()
      userTrendChart?.resize()
    }, 150)
  }

  /** TierS-6: 下载图表为 PNG 图片 */
  function downloadChart(name: ChartName): void {
    const chart = name === 'login' ? loginChart : name === 'oper' ? operPieChart : userTrendChart
    if (!chart) {
      errorHub.report('warning', 'other', t('common.chartNotReady'))
      return
    }
    try {
      // 暗色模式下导出白底图片，避免透明背景导致看不清
      const isDark = document.documentElement.classList.contains('dark')
      const url = chart.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: isDark
          ? deps.readCssVar('--el-bg-color', '#141414')
          : deps.readCssVar('--el-bg-color-page', '#ffffff')
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `chart-${name}-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      // L3: 清理 href，释放 data URL 引用避免内存泄漏
      a.href = ''
      ElMessage.success(t('common.chartDownloaded'))
    } catch (e) {
      if (import.meta.env.DEV) console.error('Chart download failed:', e)
      errorHub.report('error', 'other', t('common.chartDownloadFail'))
    }
  }

  // 清理 resize 定时器（图表实例由 useChart 的 onBeforeUnmount 自动清理）
  onBeforeUnmount(() => {
    if (resizeTimer) {
      clearTimeout(resizeTimer)
      resizeTimer = null
    }
  })

  return {
    // 模板 ref / 状态
    loginChartRef,
    operPieRef,
    userTrendRef,
    loginChartType,
    hasLoginData,
    hasOperData,
    hasUserTrendData,
    chartLoading,
    chartError,
    // 主题切换复用数据（由 index.vue 的 load* 写入、主题 watch 读取）
    lastTypeCount,
    lastUserTrend,
    // 数据注入
    setLoginData,
    // 渲染 / 动作
    renderLoginChart,
    renderOperPie,
    renderUserTrendChart,
    downloadChart,
    handleResize,
    // 图表实例（模板 :disabled 绑定使用；以捕获值暴露，非响应式）
    loginChart,
    operPieChart,
    userTrendChart
  }
}
