/**
 * 单图表卡片 composable（仪表盘可拖拽布局 · Tier-S #4）
 *
 * 封装每张图表卡片的共性：取数 → 渲染 ECharts、加载 / 错误 / 空态、暗色切换重渲染、
 * 下载 PNG。图表实例复用 useChart()（内部 ResizeObserver 自适应 + 卸载自动清理），
 * 使每个卡片成为自包含组件，可随布局自由拖拽 / 显隐而互不影响。
 *
 * 失败语义（b108）：**首载失败**才用失败态替代图表；**成功过再失败**保留已渲染的图，
 * 由模板给"陈旧数据 + 截止时刻 + 重试"的横幅——把整张图换成"加载失败"等于把一次
 * 网络抖动变成数据丢失，用户连"上一次看到的是什么"都失去了。并发请求按后发先回丢弃。
 *
 * 与旧的 useDashboardCharts 的区别：后者把三张图共享一个实例集合与 window resize 监听，
 * 服务于固定布局的 index.vue；卡片化后每张图拥有独立实例与生命周期，更适合可拖拽布局。
 */
import { ref, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'
import { ElMessage } from 'element-plus'
import type { ECharts, EChartsOption } from '@/utils/echarts'
import { useChart, readCssVar } from '@/composables/useChart'
import { createLatestGuard } from '@/composables/latestRequest'
import { errorHub } from '@/utils/errorHub'
import { saveDataUrl } from '@/utils/saveBlob'
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
  /** 至少成功取数过一次：模板据此区分「首载失败」与「刷新失败但屏上有旧图」 */
  const loaded = ref(false)
  /** 最近一次成功取数的时刻（ms）；失败不清空——否则"陈旧"这件事就没法说明是什么时候的数据 */
  const lastSuccessAt = ref<number | null>(null)

  let lastData: T | null = null
  let chart: ECharts | null = null
  let disposed = false
  const guard = createLatestGuard()

  const dataPresent = cfg.hasData ?? ((d: T): boolean => (Array.isArray(d) ? d.length > 0 : d != null))

  async function render(): Promise<void> {
    if (disposed || lastData == null || !el.value) return
    chart = await getChart(el.value)
    if (!chart || disposed) return
    chart.setOption(withDark(chart, cfg.buildOption(lastData)), true)
  }

  async function refresh(): Promise<void> {
    // 自动刷新与手动重试可能重叠：只让最后一次请求的结局生效，且旧响应不得把 loading 提前摘掉
    const my = guard.begin()
    loading.value = true
    error.value = false
    try {
      const next = await cfg.fetchData()
      if (!guard.isCurrent(my)) return
      lastData = next
      lastSuccessAt.value = Date.now()
      loaded.value = true
      empty.value = !dataPresent(next)
      await nextTick()
      if (!guard.isCurrent(my)) return
      await render()
    } catch (e) {
      if (!guard.isCurrent(my)) return
      error.value = true
      if (import.meta.env.DEV) console.error(`[dashboard:${cfg.name}] load failed:`, e)
    } finally {
      if (guard.isCurrent(my)) loading.value = false
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
      // 走 utils/saveBlob 的 data URL 通道：原先把整张 PNG（base64）塞进 a.href，
      // 且点完立刻报"图表已下载"——落盘不可观测，那句是假成功；失败分支也没有出口
      if (saveDataUrl(url, `chart-${cfg.name}-${Date.now()}.png`)) {
        ElMessage.success(t('common.chartDownloading'))
      } else {
        errorHub.report('error', 'other', t('common.chartDownloadFail'))
      }
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

  return { el, loading, error, empty, loaded, lastSuccessAt, refresh, render, download }
}
