<template>
  <div class="app-container audit-dashboard p-4">
    <!-- 顶部统计卡片 -->
    <el-row :gutter="16" class="stat-row mb-4">
      <stat-cards :stats="stats" />
    </el-row>

    <!-- 图表区 -->
    <el-row :gutter="16" class="chart-row mb-4">
      <el-col v-motion="fadeInUp" :xs="24" :lg="16">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span class="flex items-center gap-1.5">
                <el-icon><TrendCharts /></el-icon>
                {{ t('auditDashboard.chart.trendRange', { days }) }}
              </span>
              <div class="header-actions flex items-center gap-3">
                <el-radio-group v-model="days" size="small">
                  <el-radio-button :value="7">{{ t('auditDashboard.btn.days7') }}</el-radio-button>
                  <el-radio-button :value="14">{{ t('auditDashboard.btn.days14') }}</el-radio-button>
                  <el-radio-button :value="30">{{ t('auditDashboard.btn.days30') }}</el-radio-button>
                </el-radio-group>
                <el-button
                  type="primary"
                  plain
                  icon="Download"
                  :loading="exporting"
                  @click="handleExportPdf"
                  v-hasPermi="['monitor:audit:list']"
                >
                  {{ t('auditDashboard.btn.exportPdf') }}
                </el-button>
              </div>
            </div>
          </template>
          <div
            ref="trendChartRef"
            class="chart-box w-full h-80"
            v-loading="loading"
            :element-loading-text="t('common.loading')"
          ></div>
          <!-- U20 优化：图表加载错误状态 -->
          <Transition name="fade">
            <div v-if="chartError" class="chart-error flex items-center justify-center gap-2 p-3 text-sm">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ chartErrorText }}</span>
              <el-button text type="primary" @click="loadStats">{{ t('common.refresh') }}</el-button>
            </div>
          </Transition>
        </el-card>
      </el-col>
      <el-col v-motion="fadeInUp" :xs="24" :lg="8">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span class="flex items-center gap-1.5">
                <el-icon><PieChart /></el-icon>
                {{ t('auditDashboard.chart.businessDist') }}
              </span>
              <el-tooltip :content="t('auditDashboard.tip.clickToViewOperlog')" placement="top">
                <el-icon class="text-text-secondary cursor-help"><InfoFilled /></el-icon>
              </el-tooltip>
            </div>
          </template>
          <div
            ref="pieChartRef"
            class="chart-box w-full h-80"
            v-loading="loading"
            :element-loading-text="t('common.loading')"
          ></div>
          <!-- U20 优化：图表加载错误状态 -->
          <Transition name="fade">
            <div v-if="chartError" class="chart-error flex items-center justify-center gap-2 p-3 text-sm">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ chartErrorText }}</span>
              <el-button text type="primary" @click="loadStats">{{ t('common.refresh') }}</el-button>
            </div>
          </Transition>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="chart-row mb-4">
      <el-col v-motion="fadeInUp" :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span class="flex items-center gap-1.5">
                <el-icon><Histogram /></el-icon>
                {{ t('auditDashboard.chart.topUsers') }}
              </span>
            </div>
          </template>
          <div
            ref="topUsersChartRef"
            class="chart-box w-full h-80"
            v-loading="loading"
            :element-loading-text="t('common.loading')"
          ></div>
          <!-- U20 优化：图表加载错误状态 -->
          <Transition name="fade">
            <div v-if="chartError" class="chart-error flex items-center justify-center gap-2 p-3 text-sm">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ chartErrorText }}</span>
              <el-button text type="primary" @click="loadStats">{{ t('common.refresh') }}</el-button>
            </div>
          </Transition>
        </el-card>
      </el-col>
      <el-col v-motion="fadeInUp" :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span class="flex items-center gap-1.5">
                <el-icon><Warning /></el-icon>
                {{ t('auditDashboard.chart.failTrend') }}
              </span>
            </div>
          </template>
          <div
            ref="failTrendChartRef"
            class="chart-box w-full h-80"
            v-loading="loading"
            :element-loading-text="t('common.loading')"
          ></div>
          <!-- U20 优化：图表加载错误状态 -->
          <Transition name="fade">
            <div v-if="chartError" class="chart-error flex items-center justify-center gap-2 p-3 text-sm">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ chartErrorText }}</span>
              <el-button text type="primary" @click="loadStats">{{ t('common.refresh') }}</el-button>
            </div>
          </Transition>
        </el-card>
      </el-col>
    </el-row>

    <!-- 模块统计 + 异常告警 -->
    <el-row :gutter="16" class="chart-row">
      <el-col v-motion="fadeInUp" :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span class="flex items-center gap-1.5">
                <el-icon><Collection /></el-icon>
                {{ t('auditDashboard.chart.topModules') }}
              </span>
            </div>
          </template>
          <div
            ref="topModulesChartRef"
            class="chart-box w-full h-80"
            v-loading="loading"
            :element-loading-text="t('common.loading')"
          ></div>
          <Transition name="fade">
            <div v-if="chartError" class="chart-error flex items-center justify-center gap-2 p-3 text-sm">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ chartErrorText }}</span>
              <el-button text type="primary" @click="loadStats">{{ t('common.refresh') }}</el-button>
            </div>
          </Transition>
        </el-card>
      </el-col>
      <el-col v-motion="fadeInUp" :xs="24" :lg="12">
        <alarm-panel
          :alarm-data="alarmData"
          :alarm-loading="alarmLoading"
          :alarm-threshold-tip="alarmThresholdTip"
          :alarm-error="alarmError"
          :alarm-stale-hint="alarmStaleHint"
          @retry="loadAlarm"
        />
      </el-col>
    </el-row>
    <!-- 操作类型分布（§5.36：operlog stats-by-type 前端接入） -->
    <el-row :gutter="16" class="chart-row mb-4">
      <el-col v-motion="fadeInUp" :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span class="flex items-center gap-1.5">
                <el-icon><Histogram /></el-icon>
                {{ t('auditDashboard.chart.typeStats') }}
              </span>
            </div>
          </template>
          <div
            ref="typeStatsChartRef"
            class="chart-box w-full h-80"
            v-loading="loading"
            :element-loading-text="t('common.loading')"
          ></div>
          <Transition name="fade">
            <div v-if="chartError" class="chart-error flex items-center justify-center gap-2 p-3 text-sm">
              <el-icon><WarningFilled /></el-icon>
              <span>{{ chartErrorText }}</span>
              <el-button text type="primary" @click="loadStats">{{ t('common.refresh') }}</el-button>
            </div>
          </Transition>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts" name="AuditDashboard">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useChart, readCssVar } from '@/composables/useChart'
import { createLatestGuard } from '@/composables/latestRequest'
import { useMotionPresets } from '@/composables/useMotion'
import useSettingsStore from '@/store/modules/settings'
import {
  TrendCharts,
  PieChart,
  Histogram,
  Warning,
  WarningFilled,
  InfoFilled,
  Collection
} from '@element-plus/icons-vue'
import request from '@/utils/request'
import { formatClockTime } from '@/utils'
import { getAlarmStatus } from '@/api/monitor/operlog'
import StatCards from './StatCards.vue'
import AlarmPanel from './AlarmPanel.vue'
import { useAuditCharts, type PieClickParams } from './useAuditCharts'
import { useComplianceReport } from './useComplianceReport'

const { t } = useI18n()
const { getChart, withDark } = useChart()
const settingsStore = useSettingsStore()
const { fadeInUp } = useMotionPresets()
// P1-3：业务类型字典单一来源，与 operlog 共用 sys_oper_type
const { sys_oper_type } = useDict('sys_oper_type')

// 批次十九 P2（福哥拍板）：大屏默认 7 天窗（与后端 stats 默认对齐，聚合量收敛到窗口内）
const days = ref(7)
const loading = ref(false)
const chartError = ref(false)
/** 是否至少成功取过一次统计（失败时区分"留旧图 + 时刻"与"从未加载成功"） */
const statsLoaded = ref(false)
/** 最近一次成功取数的时刻（陈旧横幅要说得出"几点的数据"） */
const statsLastSuccessAt = ref<number | null>(null)
/** 屏上图形属于哪个统计窗口（换窗口 = 换了问题，旧图不得顶着新标题） */
let loadedDays: number | null = null
/** 刷新守卫：快速切换 7/14/30 天时只让最后一次请求的结局生效（b119 单一实现） */
const statsGuard = createLatestGuard()
const chartErrorText = computed(() =>
  statsLoaded.value
    ? t('common.staleDataHintAt', { time: formatClockTime(statsLastSuccessAt.value) })
    : t('dashboard.chartLoadFail')
)

const stats = ref({
  totalOps: 0,
  successOps: 0,
  failOps: 0,
  activeUsers: 0
})

// 饼图扇区点击回调（依赖 lastBusinessTypes，由 useComplianceReport 创建后注入，避免循环依赖）
const onPieClick = ref<((params: PieClickParams) => void) | null>(null)

const {
  trendChartRef,
  pieChartRef,
  topUsersChartRef,
  topModulesChartRef,
  failTrendChartRef,
  typeStatsChartRef,
  lastDaily,
  lastPieData,
  lastTopUsersData,
  lastTopModulesData,
  lastTypeStats,
  formatBusinessType,
  renderTrendChart,
  renderPieChart,
  renderTopUsersChart,
  renderTopModulesChart,
  renderFailTrendChart,
  renderTypeStatsChart,
  handleResize,
  clearResizeTimer,
  clearAllCharts
} = useAuditCharts({
  getChart,
  withDark,
  readCssVar,
  sysOperType: sys_oper_type,
  onPieClick
})

const { exporting, lastBusinessTypes, handleExportPdf, handlePieChartClick } = useComplianceReport({
  days,
  formatBusinessType
})

// 注入饼图点击回调（其依赖 useComplianceReport 内部的 lastBusinessTypes）
onPieClick.value = handlePieChartClick

// 异常操作告警状态
interface AlarmItem {
  name: string
  count: number
}
interface AlarmStatus {
  config: { windowMinutes: number; failThreshold: number; failRateThreshold: number }
  totalInWindow: number
  failInWindow: number
  failRate: number
  failRateAlarm: boolean
  operatorBursts: AlarmItem[]
  moduleBursts: AlarmItem[]
  alertTriggered: boolean
}
const alarmData = ref<AlarmStatus | null>(null)
const alarmLoading = ref(false)
const alarmError = ref(false)
/** 最近一次成功取到告警状态的时刻（失败时面板要说明"旧状态是什么时候的"） */
const alarmLastSuccessAt = ref<number | null>(null)
/** 告警状态守卫：刷新与窗口切换可能重叠（b119 单一实现） */
const alarmGuard = createLatestGuard()
const alarmStaleHint = computed(() => t('common.staleDataHintAt', { time: formatClockTime(alarmLastSuccessAt.value) }))
const alarmThresholdTip = computed(() => {
  const cfg = alarmData.value?.config
  if (!cfg) return ''
  return t('auditDashboard.alarm.thresholdSet', {
    window: cfg.windowMinutes,
    count: cfg.failThreshold,
    rate: cfg.failRateThreshold
  })
})

interface StatsVo {
  summary: { total: number; success: number; fail: number }
  businessTypes: Array<{ businessType: number; count: number }>
  topOperators: Array<{ operName: string; count: number }>
  topModules: Array<{ moduleName: string; count: number }>
  daily: Array<{ date: string; success: number; fail: number }>
}

interface TypeStatsVo {
  insert: number
  update: number
  delete: number
  other: number
}

async function loadStats(): Promise<void> {
  const my = statsGuard.begin()
  // 统计窗口变了（7/14/30 天 = 换了问题）：旧图形与旧汇总必须先丢，
  // 否则新窗口取数失败时屏上是上一个窗口的结果，却顶着新窗口的标题（b109）。
  if (loadedDays !== null && loadedDays !== days.value) {
    clearAllCharts()
    lastDaily.value = []
    lastPieData.value = []
    lastTopUsersData.value = []
    lastTopModulesData.value = []
    lastTypeStats.value = null
    stats.value = { totalOps: 0, successOps: 0, failOps: 0, activeUsers: 0 }
    statsLoaded.value = false
    statsLastSuccessAt.value = null
    loadedDays = null
  }
  loading.value = true
  chartError.value = false
  try {
    // 两个聚合接口并行取数：任一失败即整次失败，避免"部分新数据 + 部分旧数据"的混合断面
    const [res, ts] = (await Promise.all([
      request({
        url: '/monitor/operlog/stats',
        method: 'get',
        params: { days: days.value }
      }),
      request({
        url: '/monitor/operlog/stats-by-type',
        method: 'get'
      })
    ])) as [Partial<StatsVo> & { data?: StatsVo }, Partial<{ data?: TypeStatsVo }> & Partial<TypeStatsVo>]
    // 后发先回：旧请求的结局一律丢弃（既不覆盖数据，也不改错误态与时刻）
    if (!statsGuard.isCurrent(my)) return
    const vo: StatsVo = (res.data || res) as StatsVo
    const summary = vo.summary || { total: 0, success: 0, fail: 0 }
    const businessTypes = vo.businessTypes || []
    const topOperators = vo.topOperators || []
    const topModules = vo.topModules || []
    const daily = vo.daily || []
    const typeVo = (ts.data || ts) as TypeStatsVo
    // P1-3：缓存 businessTypes 供饼图点击回调反查 code
    lastBusinessTypes.value = businessTypes
    stats.value = {
      totalOps: summary.total || 0,
      successOps: summary.success || 0,
      failOps: summary.fail || 0,
      // 活跃用户数 = 有操作记录的独立用户数
      activeUsers: topOperators.length
    }
    // 缓存最近一次数据，主题切换时复用避免重新请求接口
    lastDaily.value = daily
    lastPieData.value = businessTypes.map((b) => ({ name: formatBusinessType(b.businessType), value: b.count }))
    lastTopUsersData.value = topOperators.map((u) => ({ userName: u.operName, count: u.count }))
    lastTopModulesData.value = topModules.map((m) => ({ moduleName: m.moduleName, count: m.count }))
    lastTypeStats.value = {
      insert: typeVo.insert || 0,
      update: typeVo.update || 0,
      delete: typeVo.delete || 0,
      other: typeVo.other || 0
    }
    await nextTick()
    if (!statsGuard.isCurrent(my)) return
    // 图表渲染相互独立，用 Promise.all 并行执行以减少总耗时
    await Promise.all([
      renderTrendChart(lastDaily.value),
      renderPieChart(lastPieData.value),
      renderTopUsersChart(lastTopUsersData.value),
      renderTopModulesChart(lastTopModulesData.value),
      renderFailTrendChart(lastDaily.value),
      renderTypeStatsChart(lastTypeStats.value)
    ])
    if (!statsGuard.isCurrent(my)) return
    statsLoaded.value = true
    statsLastSuccessAt.value = Date.now()
    loadedDays = days.value
  } catch (e) {
    if (!statsGuard.isCurrent(my)) return
    if (import.meta.env.DEV) console.error('Failed to load audit dashboard data:', e)
    // 成功过 ⇒ 旧图保留、文案说明时刻；从未成功 ⇒ 文案为"加载失败，请重试"
    chartError.value = true
  } finally {
    if (statsGuard.isCurrent(my)) loading.value = false
  }
}

/** 加载异常操作告警状态（失败必须可见：否则"取不到"会被读成"没有异常"） */
async function loadAlarm(): Promise<void> {
  const my = alarmGuard.begin()
  alarmLoading.value = true
  alarmError.value = false
  try {
    const res = (await getAlarmStatus()) as { data?: AlarmStatus }
    if (!alarmGuard.isCurrent(my)) return
    alarmData.value = res?.data ?? null
    alarmLastSuccessAt.value = Date.now()
  } catch (e) {
    if (!alarmGuard.isCurrent(my)) return
    if (import.meta.env.DEV) console.error('Failed to load alarm status:', e)
    alarmError.value = true
  } finally {
    if (alarmGuard.isCurrent(my)) alarmLoading.value = false
  }
}

watch(days, () => loadStats())

// 主题切换时复用最近一次数据重新渲染所有图表（不重新请求接口）
watch(
  () => settingsStore.isDark,
  async () => {
    await nextTick()
    if (lastDaily.value.length === 0 && lastPieData.value.length === 0 && lastTopUsersData.value.length === 0) return
    await Promise.all([
      renderTrendChart(lastDaily.value),
      renderPieChart(lastPieData.value),
      renderTopUsersChart(lastTopUsersData.value),
      renderTopModulesChart(lastTopModulesData.value),
      renderFailTrendChart(lastDaily.value),
      renderTypeStatsChart(lastTypeStats.value)
    ])
  }
)

onMounted(async () => {
  await nextTick()
  window.addEventListener('resize', handleResize)
  await Promise.all([loadStats(), loadAlarm()])
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  // 图表实例由 useChart 的 onBeforeUnmount 自动清理，无需手动 dispose
  clearResizeTimer()
})
</script>

<style lang="scss" scoped>
/* U20 优化：图表加载错误状态样式 */
.chart-error {
  color: var(--el-color-danger);

  .el-icon {
    font-size: 18px;
  }
}
</style>
