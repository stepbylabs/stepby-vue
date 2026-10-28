<template>
  <div class="app-container p-4">
    <!-- 显式标注"这一屏数据来源失败"（照 tool/reportBoard 的 failedSources 形态）：
         首载失败时整屏渲染加载失败+重试，绝不渲染"已加载但所有值都是 -"的假仪表盘；
         已有成功数据、仅本轮刷新失败时，横幅声明屏上是最近一次成功加载的快照 -->
    <list-empty v-if="loadError && !server" :load-error="true" @retry="loadServer(true)" />
    <el-alert
      v-else-if="loadError"
      type="warning"
      show-icon
      :closable="false"
      class="mb-4"
      :title="t('common.staleDataHintAt', { time: lastUpdate || '—' })"
    />

    <!-- 顶部统计卡片（P3-16）：CPU / 内存 / 运行时长 / 运行时，使用环形进度展示使用率 -->
    <el-row v-if="!(loadError && !server)" :gutter="16" class="mb-4">
      <template v-if="loading && !server">
        <el-col v-for="n in 4" :key="n" :xs="12" :sm="12" :md="6" :lg="6">
          <div class="stat-card stat-skeleton">
            <el-skeleton animated>
              <template #template>
                <div class="stat-skeleton__content flex items-center gap-[14px]">
                  <el-skeleton-item variant="circle" class="!w-12 !h-12 shrink-0" />
                  <div class="flex-1 min-w-0 space-y-1">
                    <el-skeleton-item variant="h3" class="w-[55%]" />
                    <el-skeleton-item variant="text" class="w-[80%]" />
                    <el-skeleton-item variant="text" class="w-[65%]" />
                  </div>
                </div>
              </template>
            </el-skeleton>
          </div>
        </el-col>
      </template>
      <template v-else>
        <el-col v-motion="staggerChildren(0)" :xs="12" :sm="12" :md="6" :lg="6">
          <el-card shadow="hover" class="stat-card stat-cpu mb-3 transition-all duration-200 hover:-translate-y-1">
            <div class="stat-content flex items-center gap-3.5">
              <el-progress
                type="dashboard"
                :percentage="progressPercent(cpuUsage)"
                :width="72"
                :stroke-width="8"
                :color="usageColor(cpuUsage)"
              >
                <template #default="{ percentage }">
                  <span class="text-lg font-semibold">{{ percentage }}%</span>
                </template>
              </el-progress>
              <div class="stat-info min-w-0 flex-1">
                <div class="stat-label text-text-secondary">{{ t('server.stat.cpuUsage') }}</div>
                <div class="stat-desc mt-1 text-sm text-text-regular">
                  {{ t('server.stat.cpuNum') }} {{ server?.cpu.cpuNum ?? '-' }}
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col v-motion="staggerChildren(1)" :xs="12" :sm="12" :md="6" :lg="6">
          <el-card shadow="hover" class="stat-card stat-mem mb-3 transition-all duration-200 hover:-translate-y-1">
            <div class="stat-content flex items-center gap-3.5">
              <el-progress
                type="dashboard"
                :percentage="progressPercent(memUsage)"
                :width="72"
                :stroke-width="8"
                :color="usageColor(memUsage)"
              >
                <template #default="{ percentage }">
                  <span class="text-lg font-semibold">{{ percentage }}%</span>
                </template>
              </el-progress>
              <div class="stat-info min-w-0 flex-1">
                <div class="stat-label text-text-secondary">{{ t('server.stat.memUsage') }}</div>
                <div class="stat-desc mt-1 text-sm text-text-regular">
                  {{ num(server?.mem.used) }} / {{ num(server?.mem.total) }} G
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col v-motion="staggerChildren(2)" :xs="12" :sm="12" :md="6" :lg="6">
          <el-card shadow="hover" class="stat-card stat-uptime mb-3 transition-all duration-200 hover:-translate-y-1">
            <div class="stat-content flex items-center gap-3.5">
              <div class="stat-icon w-12 h-12 flex items-center justify-center text-2xl">
                <el-icon><Timer /></el-icon>
              </div>
              <div class="stat-info min-w-0 flex-1">
                <div class="stat-label text-text-secondary">{{ t('server.stat.runTime') }}</div>
                <div class="stat-value text-xl font-semibold leading-tight text-text-primary break-all">
                  {{ server?.jvm.runTime || '-' }}
                </div>
                <div class="stat-desc mt-1 text-sm text-text-regular">
                  {{ t('server.stat.startTime') }} {{ server?.jvm.startTime || '-' }}
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
        <el-col v-motion="staggerChildren(3)" :xs="12" :sm="12" :md="6" :lg="6">
          <el-card shadow="hover" class="stat-card stat-jvm mb-3 transition-all duration-200 hover:-translate-y-1">
            <div class="stat-content flex items-center gap-3.5">
              <div class="stat-icon w-12 h-12 flex items-center justify-center text-2xl">
                <el-icon><Cpu /></el-icon>
              </div>
              <div class="stat-info min-w-0 flex-1">
                <div class="stat-label text-text-secondary">{{ t('server.stat.runtime') }}</div>
                <div class="stat-value text-lg font-semibold leading-tight text-text-primary truncate">
                  {{ server?.jvm.name || '-' }}
                </div>
                <div class="stat-desc mt-1 text-sm text-text-regular">
                  {{ num(server?.jvm.used) }} / {{ num(server?.jvm.total) }} M
                </div>
              </div>
            </div>
          </el-card>
        </el-col>
      </template>
    </el-row>

    <!-- 实时资源使用率曲线（前端 ~2s 轮询采样） -->
    <el-row v-if="!(loadError && !server)" :gutter="16" class="mb-4">
      <el-col :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span>
                <el-icon><TrendCharts /></el-icon>
                {{ t('server.chart.title') }}
              </span>
              <div class="card-header-actions flex items-center gap-3">
                <el-switch
                  v-model="autoRefresh"
                  :aria-label="t('server.chart.autoRefresh')"
                  :active-text="t('server.chart.autoRefresh')"
                  @change="toggleAutoRefresh"
                />
                <el-button type="primary" link icon="Refresh" :loading="loading" @click="loadServer(true)">
                  {{ t('server.btn.refresh') }}
                </el-button>
                <span v-if="lastUpdate" class="last-update text-xs text-text-secondary">
                  {{ t('server.chart.lastUpdate') }}{{ lastUpdate }}
                </span>
              </div>
            </div>
          </template>
          <div
            v-motion="fadeInUp"
            ref="trendRef"
            class="chart-box w-full h-[300px]"
            v-loading="loading && !server"
            :element-loading-text="t('common.loading')"
          ></div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 磁盘分区 + 服务器/运行时信息 -->
    <el-row v-if="!(loadError && !server)" :gutter="16">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <span>
              <el-icon><Coin /></el-icon>
              {{ t('server.diskInfo') }}
            </span>
          </template>
          <el-table :data="diskList" stripe size="small">
            <el-table-column prop="dirName" :label="t('server.column.dirName')" min-width="110" />
            <el-table-column prop="sysTypeName" :label="t('server.column.sysTypeName')" min-width="90" />
            <el-table-column :label="t('server.column.total')" width="90" align="right">
              <template #default="{ row }">{{ num(row.total) }}</template>
            </el-table-column>
            <el-table-column :label="t('server.column.used')" width="90" align="right">
              <template #default="{ row }">{{ num(row.used) }}</template>
            </el-table-column>
            <el-table-column :label="t('server.column.free')" width="90" align="right">
              <template #default="{ row }">{{ num(row.free) }}</template>
            </el-table-column>
            <el-table-column :label="t('server.column.usage')" min-width="150">
              <template #default="{ row }">
                <el-progress
                  :percentage="progressPercent(Number(row.usage))"
                  :color="progressColor"
                  :stroke-width="12"
                />
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <span>
              <el-icon><Monitor /></el-icon>
              {{ t('server.runtimeInfo') }}
            </span>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item :label="t('server.column.computerName')">
              {{ server?.sys.computerName || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('server.column.computerIp')">
              {{ server?.sys.computerIp || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('server.column.osName')">
              {{ server?.sys.osName || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('server.column.osArch')">
              {{ server?.sys.osArch || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('server.column.runtimeName')">
              {{ server?.jvm.name || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('server.column.version')">
              {{ server?.jvm.version || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('server.column.startTime')">
              {{ server?.jvm.startTime || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('server.column.runTime')">
              {{ server?.jvm.runTime || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('server.column.userDir')" :span="2">
              {{ server?.sys.userDir || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('server.column.home')" :span="2">
              {{ server?.jvm.home || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('server.column.inputArgs')" :span="2">
              <span class="break-all">{{ server?.jvm.inputArgs || '-' }}</span>
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts" name="ServerMonitor">
import { onMounted, onBeforeUnmount, ref, computed, watch, nextTick } from 'vue'
import { TrendCharts, Coin, Monitor, Cpu, Timer } from '@element-plus/icons-vue'
import { useChart, readCssVar } from '@/composables/useChart'
import { useMotionPresets } from '@/composables/useMotion'
import useSettingsStore from '@/store/modules/settings'
import { getServer, type ServerInfo } from '@/api/monitor/server'
import type { ECharts, EChartsOption } from '@/utils/echarts'

const { t } = useI18n()
const { fadeInUp, staggerChildren } = useMotionPresets()
const { getChart, withDark } = useChart()
const settingsStore = useSettingsStore()

const POLL_INTERVAL = 2000
const MAX_POINTS = 60

const loading = ref(false)
const autoRefresh = ref(true)
const lastUpdate = ref('')
const server = ref<ServerInfo | null>(null)
// 数据源加载失败标记（与 useCrudTable.loadError 同语义，本页手写轮询故为本地 ref）：
// 失败不再静默——首载失败整屏给「加载失败 + 重试」，刷新失败横幅标注快照态
const loadError = ref(false)

// 采样曲线数据
const trendRef = ref<HTMLElement | null>(null)
const times = ref<string[]>([])
const cpuSerie = ref<number[]>([])
const memSerie = ref<number[]>([])
let chart: ECharts | null = null
let pollTimer: ReturnType<typeof setInterval> | null = null

const cpuUsage = computed<number>(() => server.value?.cpu.used ?? 0)
const memUsage = computed<number>(() => server.value?.mem.usage ?? 0)

const diskList = computed(() => server.value?.sysFiles ?? [])

const progressColor = [
  { color: 'var(--el-color-success)', percentage: 60 },
  { color: 'var(--el-color-warning)', percentage: 80 },
  { color: 'var(--el-color-danger)', percentage: 100 }
]

/** 进度环百分比（0-100 取整，越界钳制） */
function progressPercent(v: number): number {
  const n = Number(v)
  if (Number.isNaN(n)) return 0
  return Math.min(100, Math.max(0, Math.round(n)))
}

/** 按使用率分级的进度颜色 */
function usageColor(v: number): string {
  if (v >= 90) return 'var(--el-color-danger)'
  if (v >= 70) return 'var(--el-color-warning)'
  return 'var(--el-color-success)'
}

/** 数字格式化：仅保留一位小数，空值显示为 '-' */
function num(v: number | undefined): string {
  if (v === undefined || v === null || Number.isNaN(v)) return '-'
  return Number(v.toFixed(1)).toString()
}

function tickLabel(): string {
  return new Date().toLocaleTimeString('zh-CN', { hour12: false })
}

async function loadServer(immediate = false): Promise<void> {
  if (!immediate && !server.value) loading.value = true
  try {
    const res = await getServer()
    server.value = res.data
    loadError.value = false
    // 采样入曲线，维护最近 MAX_POINTS 个点
    times.value.push(tickLabel())
    cpuSerie.value.push(Number((res.data?.cpu?.used ?? 0).toFixed(1)))
    memSerie.value.push(Number((res.data?.mem?.usage ?? 0).toFixed(1)))
    if (times.value.length > MAX_POINTS) {
      times.value.shift()
      cpuSerie.value.shift()
      memSerie.value.shift()
    }
    lastUpdate.value = tickLabel()
    await renderChart()
  } catch (e) {
    // 失败置位标记：模板据此渲染「加载失败」整屏/横幅，不再落回 "-" 假仪表盘
    loadError.value = true
    if (import.meta.env.DEV) console.error('[ServerMonitor] load failed:', e)
  } finally {
    loading.value = false
  }
}

async function renderChart(): Promise<void> {
  if (!trendRef.value || times.value.length === 0) return
  chart = await getChart(trendRef.value)
  if (!chart) return
  const option: EChartsOption = {
    tooltip: { trigger: 'axis' },
    legend: { data: [t('server.chart.cpu'), t('server.chart.mem')], right: 10 },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: { type: 'category', boundaryGap: false, data: times.value },
    yAxis: {
      type: 'value',
      min: 0,
      max: 100,
      interval: 20,
      axisLabel: { formatter: '{value}%' }
    },
    series: [
      {
        name: t('server.chart.cpu'),
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: cpuSerie.value,
        areaStyle: { opacity: 0.12 },
        lineStyle: { width: 2 },
        itemStyle: { color: readCssVar('--el-color-primary', '#409eff') }
      },
      {
        name: t('server.chart.mem'),
        type: 'line',
        smooth: true,
        showSymbol: false,
        data: memSerie.value,
        areaStyle: { opacity: 0.12 },
        lineStyle: { width: 2 },
        itemStyle: { color: readCssVar('--el-color-success', '#67c23a') }
      }
    ]
  }
  chart.setOption(withDark(chart, option), true)
}

function schedulePoll(): void {
  if (pollTimer) clearInterval(pollTimer)
  pollTimer = setInterval(() => {
    loadServer(true)
  }, POLL_INTERVAL)
}

function toggleAutoRefresh(val: boolean | string | number): void {
  if (val) {
    schedulePoll()
  } else if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

// 主题切换时复用最近数据重新渲染，保证暗色模式变量生效
watch(
  () => settingsStore.isDark,
  async () => {
    await nextTick()
    await renderChart()
  }
)

onMounted(async () => {
  await loadServer()
  schedulePoll()
})

// 卸载即停止轮询（图表实例/ResizeObserver 由 useChart 卸载钩子统一清理）
onBeforeUnmount(() => {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
})
</script>

<style lang="scss" scoped>
.stat-card {
  :deep(.el-card__body) {
    padding: 16px;
  }
}

.stat-icon {
  border-radius: 10px;
  color: var(--el-color-white);
  background: linear-gradient(135deg, var(--el-color-primary), #66b1ff);
}
.stat-uptime .stat-icon {
  background: linear-gradient(135deg, var(--el-color-warning), #ebb563);
}
.stat-jvm .stat-icon {
  background: linear-gradient(135deg, var(--el-color-success), #85ce61);
}

.stat-label {
  font-size: 13px;
}

/* 骨架屏占位，与统计卡片视觉一致 */
.stat-skeleton {
  background-color: var(--el-card-bg-color, #fff);
  border: 1px solid var(--el-card-border-color, var(--el-border-color-lighter));
  border-radius: var(--el-card-border-radius, 4px);
  box-shadow: var(--el-box-shadow-light);
  padding: 16px;
  box-sizing: border-box;
}
.stat-skeleton__content {
  height: 72px;
}
</style>
