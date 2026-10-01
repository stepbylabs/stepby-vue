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
              <span>{{ t('dashboard.chartLoadFail') }}</span>
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
              <span>{{ t('dashboard.chartLoadFail') }}</span>
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
              <span>{{ t('dashboard.chartLoadFail') }}</span>
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
              <span>{{ t('dashboard.chartLoadFail') }}</span>
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
              <span>{{ t('dashboard.chartLoadFail') }}</span>
              <el-button text type="primary" @click="loadStats">{{ t('common.refresh') }}</el-button>
            </div>
          </Transition>
        </el-card>
      </el-col>
      <el-col v-motion="fadeInUp" :xs="24" :lg="12">
        <alarm-panel :alarm-data="alarmData" :alarm-loading="alarmLoading" :alarm-threshold-tip="alarmThresholdTip" />
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts" name="AuditDashboard">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { useChart, readCssVar } from '@/composables/useChart'
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

const days = ref(14)
const loading = ref(false)
// U20 优化：图表加载错误状态
const chartError = ref(false)

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

async function loadStats() {
  loading.value = true
  // U20 优化：图表加载错误状态
  chartError.value = false
  try {
    const res = (await request({
      url: '/monitor/operlog/stats',
      method: 'get',
      params: { days: days.value }
    })) as Partial<StatsVo> & { data?: StatsVo }
    const vo: StatsVo = (res.data || res) as StatsVo
    const summary = vo.summary || { total: 0, success: 0, fail: 0 }
    const businessTypes = vo.businessTypes || []
    const topOperators = vo.topOperators || []
    const topModules = vo.topModules || []
    const daily = vo.daily || []
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
    await nextTick()
    // 图表渲染相互独立，用 Promise.all 并行执行以减少总耗时
    await Promise.all([
      renderTrendChart(lastDaily.value),
      renderPieChart(lastPieData.value),
      renderTopUsersChart(lastTopUsersData.value),
      renderTopModulesChart(lastTopModulesData.value),
      renderFailTrendChart(lastDaily.value)
    ])
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to load audit dashboard data:', e)
    // U20 优化：图表加载错误状态
    chartError.value = true
  } finally {
    loading.value = false
  }
}

/** 加载异常操作告警状态 */
async function loadAlarm() {
  alarmLoading.value = true
  try {
    const res = (await getAlarmStatus()) as { data?: AlarmStatus }
    alarmData.value = res?.data ?? null
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to load alarm status:', e)
  } finally {
    alarmLoading.value = false
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
      renderFailTrendChart(lastDaily.value)
    ])
  }
)

onMounted(async () => {
  await nextTick()
  await loadStats()
  await loadAlarm()
  window.addEventListener('resize', handleResize)
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
