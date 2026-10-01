/**
 * 单图表卡片 composable（仪表盘可拖拽布局 · Tier-S #4）
 *
 * 封装每张图表卡片的共性：取数 → 渲染 ECharts、加载 / 错误 / 空态、暗色切换重渲染、
 * 下载 PNG。图表实例复用 useChart()（内部 ResizeObserver 自适应 + 卸载自动清理），
 * 使每个卡片成为自包含组件，可随布局自由拖拽 / 显隐而互不影响。
 *
 * 与旧的 useDashboardCharts 的区别：后者把三张图共享一个实例集合与 window resize 监听，
 * 服务于固定布局的 index.vue；卡片化后每张图拥有独立实例与生命周期，更适合可拖拽布局。
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import type { ECharts, EChartsOption } from '@/utils/echarts'
import { useChart, readCssVar } from '@/composables/useChart'
import { errorHub } from '@/utils/errorHub'
import { useI18n } from 'vue-i18n'
import useSettingsStore from '@/store/modules/settings'

export interface EchartsWidgetConfig<T> {
  /** 下载文件名与日志前缀 */
  name: string
  /** 拉取数据（抛错将置 error 态） */
  fetchData: () => Promise<T>
  /** 由数据构造 ECharts option（可闭包读取组件内响应式子状态） */
  buildOption: (data: T) => EChartsOption
  /** 判定是否「有数据」；缺省时数组按 length、其余按非空 */
  hasData?: (data: T) => boolean
  /** 挂载后是否自动加载（默认 true） */
  autoLoad?: boolean
}

export function useEchartsWidget<T>(cfg: EchartsWidgetConfig<T>) {
  const { t } = useI18n()
  const settingsStore = useSettingsStore()
  const { getChart, withDark } = useChart()

  const el = ref<HTMLElement | null>(null)
  const loading = ref(false)
  const error = ref(false)
  const empty = ref(false)

  let lastData: T | null = null
  let chart: ECharts | null = null
  let disposed = false

  const dataPresent = cfg.hasData ?? ((d: T): boolean => (Array.isArray(d) ? d.length > 0 : d != null))

  async function render(): Promise<void> {
    if (disposed || lastData == null || !el.value) return
    chart = await getChart(el.value)
    if (!chart || disposed) return
    chart.setOption(withDark(chart, cfg.buildOption(lastData)), true)
  }

  async function refresh(): Promise<void> {
    loading.value = true
    error.value = false
    try {
      lastData = await cfg.fetchData()
      empty.value = !dataPresent(lastData)
      await nextTick()
      await render()
    } catch (e) {
      error.value = true
      if (import.meta.env.DEV) console.error(`[dashboard:${cfg.name}] load failed:`, e)
    } finally {
      loading.value = false
    }
  }

  // 主题切换：复用最近数据重渲染，不重新请求
  watch(
    () => settingsStore.isDark,
    async () => {
      await nextTick()
      await render()
    }
  )

  function download(): void {
    if (!chart) {
      errorHub.report('warning', 'other', t('common.chartNotReady'))
      return
    }
    try {
      const isDark = document.documentElement.classList.contains('dark')
      const url = chart.getDataURL({
        type: 'png',
        pixelRatio: 2,
        backgroundColor: isDark ? readCssVar('--el-bg-color', '#141414') : readCssVar('--el-bg-color-page', '#ffffff')
      })
      const a = document.createElement('a')
      a.href = url
      a.download = `chart-${cfg.name}-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      a.href = ''
      ElMessage.success(t('common.chartDownloaded'))
    } catch (e) {
      if (import.meta.env.DEV) console.error('Chart download failed:', e)
      errorHub.report('error', 'other', t('common.chartDownloadFail'))
    }
  }

  onMounted(() => {
    if (cfg.autoLoad !== false) refresh()
  })

  onBeforeUnmount(() => {
    disposed = true
    chart = null
  })

  return { el, loading, error, empty, refresh, render, download }
}
