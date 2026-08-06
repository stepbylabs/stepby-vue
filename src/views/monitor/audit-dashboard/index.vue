<template>
  <div class="app-container audit-dashboard p-4">
    <!-- 顶部统计卡片 -->
    <el-row :gutter="16" class="stat-row mb-4">
      <el-col v-motion="staggerChildren(0)" :xs="12" :sm="12" :md="6" :lg="6">
        <el-card shadow="hover" class="stat-card stat-total mb-3 transition-all duration-200 hover:-translate-y-1">
          <div class="stat-content flex items-center gap-3.5">
            <div class="stat-icon w-12 h-12 flex items-center justify-center text-2xl">
              <el-icon><Document /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value text-2xl font-semibold leading-tight text-text-primary">{{ stats.totalOps }}</div>
              <div class="stat-label text-text-secondary mt-1">{{ t('auditDashboard.stat.totalOps') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(1)" :xs="12" :sm="12" :md="6" :lg="6">
        <el-card shadow="hover" class="stat-card stat-success mb-3 transition-all duration-200 hover:-translate-y-1">
          <div class="stat-content flex items-center gap-3.5">
            <div class="stat-icon w-12 h-12 flex items-center justify-center text-2xl">
              <el-icon><CircleCheck /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value text-2xl font-semibold leading-tight text-text-primary">
                {{ stats.successOps }}
              </div>
              <div class="stat-label text-text-secondary mt-1">{{ t('auditDashboard.stat.successOps') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(2)" :xs="12" :sm="12" :md="6" :lg="6">
        <el-card shadow="hover" class="stat-card stat-fail mb-3 transition-all duration-200 hover:-translate-y-1">
          <div class="stat-content flex items-center gap-3.5">
            <div class="stat-icon w-12 h-12 flex items-center justify-center text-2xl">
              <el-icon><CircleClose /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value text-2xl font-semibold leading-tight text-text-primary">{{ stats.failOps }}</div>
              <div class="stat-label text-text-secondary mt-1">{{ t('auditDashboard.stat.failOps') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(3)" :xs="12" :sm="12" :md="6" :lg="6">
        <el-card shadow="hover" class="stat-card stat-active mb-3 transition-all duration-200 hover:-translate-y-1">
          <div class="stat-content flex items-center gap-3.5">
            <div class="stat-icon w-12 h-12 flex items-center justify-center text-2xl">
              <el-icon><User /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value text-2xl font-semibold leading-tight text-text-primary">
                {{ stats.activeUsers }}
              </div>
              <div class="stat-label text-text-secondary mt-1">{{ t('auditDashboard.stat.activeUsers') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
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
  </div>
</template>

<script setup lang="ts" name="AuditDashboard">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { type ECharts, type ECElementEvent } from '@/utils/echarts'
import { useChart, readCssVar } from '@/composables/useChart'
import { useMotionPresets } from '@/composables/useMotion'
import useSettingsStore from '@/store/modules/settings'
import { ElMessage } from 'element-plus'
import {
  Document,
  CircleCheck,
  CircleClose,
  User,
  TrendCharts,
  PieChart,
  Histogram,
  Warning,
  WarningFilled,
  InfoFilled
} from '@element-plus/icons-vue'
import request from '@/utils/request'
import { exportElementToPdf } from '@/utils/pdf'
import { getComplianceReport } from '@/api/monitor/operlog'
import { escapeHtml } from '@/utils'
import { selectDictLabel } from '@/utils/yebot'

const { t } = useI18n()
const { getChart, withDark } = useChart()
const settingsStore = useSettingsStore()
const { fadeInUp, staggerChildren } = useMotionPresets()
const router = useRouter()
// P1-3：业务类型字典单一来源，与 operlog 共用 sys_oper_type
const { sys_oper_type } = useDict('sys_oper_type')

const days = ref(14)
const loading = ref(false)
// U20 优化：图表加载错误状态
const chartError = ref(false)
const exporting = ref(false)

const stats = ref({
  totalOps: 0,
  successOps: 0,
  failOps: 0,
  activeUsers: 0
})

const trendChartRef = ref<HTMLElement | null>(null)
const pieChartRef = ref<HTMLElement | null>(null)
const topUsersChartRef = ref<HTMLElement | null>(null)
const failTrendChartRef = ref<HTMLElement | null>(null)

let trendChart: ECharts | null = null
let pieChart: ECharts | null = null
let topUsersChart: ECharts | null = null
let failTrendChart: ECharts | null = null

// 主题切换时复用最近一次数据重新渲染（避免重新请求接口）
let lastDaily: Array<{ date: string; success: number; fail: number }> = []
let lastPieData: Array<{ name: string; value: number }> = []
let lastTopUsersData: Array<{ userName: string; count: number }> = []

interface StatsVo {
  summary: { total: number; success: number; fail: number }
  businessTypes: Array<{ businessType: number; count: number }>
  topOperators: Array<{ operName: string; count: number }>
  daily: Array<{ date: string; success: number; fail: number }>
}

/** 合规报告数据结构（导出 PDF 用） */
interface ComplianceReport {
  periodFrom: string
  periodTo: string
  generatedAt: string
  summary: { total: number; success: number; fail: number }
  businessTypes: Array<{ businessType: number; count: number }>
  topOperators: Array<{ operName: string; count: number }>
  anomalies: Array<{
    operTime: string
    title: string
    operName: string
    operIp: string
    errorMsg?: string
  }>
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
    lastDaily = daily
    lastPieData = businessTypes.map((b) => ({ name: formatBusinessType(b.businessType), value: b.count }))
    lastTopUsersData = topOperators.map((u) => ({ userName: u.operName, count: u.count }))
    await nextTick()
    // 四个图表渲染相互独立，用 Promise.all 并行执行以减少总耗时
    await Promise.all([
      renderTrendChart(lastDaily),
      renderPieChart(lastPieData),
      renderTopUsersChart(lastTopUsersData),
      renderFailTrendChart(lastDaily)
    ])
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to load audit dashboard data:', e)
    // U20 优化：图表加载错误状态
    chartError.value = true
  } finally {
    loading.value = false
  }
}

async function renderTrendChart(data: Array<{ date: string; success: number; fail: number }>) {
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
          itemStyle: { color: readCssVar('--el-color-success', '#67c23a') }
        },
        {
          name: t('common.fail'),
          type: 'line',
          smooth: true,
          data: fail,
          areaStyle: {},
          itemStyle: { color: readCssVar('--el-color-danger', '#f56c6c') }
        }
      ]
    }),
    true
  )
}

async function renderPieChart(data: Array<{ name: string; value: number }>) {
  const chart = await getChart(pieChartRef.value)
  if (!chart) return
  pieChart = chart
  // P1-3：饼图点击扇区跳转 operlog（仅对真实业务类型数据生效，空数据占位不跳转）
  chart.off('click')
  chart.on('click', (params: ECElementEvent) => {
    if (params.name === t('common.noData')) return
    handlePieChartClick({ name: params.name })
  })
  const palette = [
    readCssVar('--el-color-primary', '#409eff'),
    readCssVar('--el-color-warning', '#e6a23c'),
    readCssVar('--el-color-danger', '#f56c6c'),
    readCssVar('--el-color-info', '#909399'),
    readCssVar('--el-color-success', '#67c23a'),
    readCssVar('--el-color-primary-light-3', '#9c64ff'),
    readCssVar('--el-color-danger-light-3', '#ff7e7e')
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

async function renderTopUsersChart(data: Array<{ userName: string; count: number }>) {
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
          itemStyle: { color: readCssVar('--el-color-primary', '#409eff') }
        }
      ]
    }),
    true
  )
}

async function renderFailTrendChart(data: Array<{ date: string; success: number; fail: number }>) {
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
          itemStyle: { color: readCssVar('--el-color-danger', '#f56c6c') }
        }
      ]
    }),
    true
  )
}

// U18 优化：防抖 150ms，避免高频 resize 卡顿（4 个图表同时 resize 开销大）
let resizeTimer: ReturnType<typeof setTimeout> | null = null
function handleResize() {
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    trendChart?.resize()
    pieChart?.resize()
    topUsersChart?.resize()
    failTrendChart?.resize()
  }, 150)
}

// ==================== 审计合规报告 PDF 导出 ====================

/**
 * 业务类型 code → 中文名称映射
 * P1-3：统一使用 sys_oper_type 字典作为单一来源，与 operlog 页面共用，
 *      避免双份映射漂移；字典未加载时回退到原 i18n key
 */
function formatBusinessType(code: number): string {
  const dictLabel = selectDictLabel(sys_oper_type.value, code)
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

// 缓存最近一次 businessTypes，供饼图点击回调反查 code
const lastBusinessTypes = ref<Array<{ businessType: number; count: number }>>([])

/** P1-3：点击饼图业务类型扇区 → 跳转 operlog 并按该业务类型筛选 */
function handlePieChartClick(params: { name?: string; data?: { businessType?: number } }): void {
  // businessTypes 数据已通过 renderPieChart 传入，但 ECharts 回调不携带原始 code
  // 因此从 name 反查最近一次 businessTypes 数据
  const bt = lastBusinessTypes.value.find(
    (b: { businessType: number; count: number }) => formatBusinessType(b.businessType) === params.name
  )
  if (!bt) return
  router.push({
    path: '/monitor/operlog',
    query: { businessType: String(bt.businessType) }
  })
}

/** 转义字符串，避免注入到 innerHTML 时破坏布局 */
// P3-1：escapeHtml 已统一到 @/utils/index.ts，本地实现已删除（含单引号转义，行为与 changelog 一致）

/** 构建临时报告 DOM（脱离文档流，导出后移除） */
function buildReportDom(report: ComplianceReport): HTMLElement {
  const container = document.createElement('div')
  container.style.cssText =
    'position:fixed;left:-9999px;top:0;width:794px;padding:30px;background:#fff;font-family:"Microsoft YaHei",sans-serif;'

  const successRate =
    report.summary.total > 0 ? ((report.summary.success / report.summary.total) * 100).toFixed(2) : '0.00'

  container.innerHTML = `
    <h1 style="text-align:center;font-size:24px;margin-bottom:8px;">${t('auditDashboard.report.title')}</h1>
    <div style="text-align:center;color:#666;margin-bottom:20px;">
      ${t('auditDashboard.report.period')}：${escapeHtml(report.periodFrom)} ${t('auditDashboard.report.periodConnector')} ${escapeHtml(report.periodTo)}<br/>
      ${t('auditDashboard.report.generatedAt')}：${escapeHtml(report.generatedAt)}
    </div>

    <h2 style="font-size:18px;border-bottom:2px solid #409eff;padding-bottom:4px;">${t('auditDashboard.report.sectionOverview')}</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      <tr>
        <td style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.totalOps')}</td>
        <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(report.summary.total)}</td>
        <td style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.successOps')}</td>
        <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(report.summary.success)}</td>
      </tr>
      <tr>
        <td style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.failOps')}</td>
        <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(report.summary.fail)}</td>
        <td style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.successRate')}</td>
        <td style="border:1px solid #ddd;padding:8px;">${successRate}%</td>
      </tr>
    </table>

    <h2 style="font-size:18px;border-bottom:2px solid #409eff;padding-bottom:4px;">${t('auditDashboard.report.section2')}</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      <thead>
        <tr>
          <th style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.businessType')}</th>
          <th style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.operCount')}</th>
        </tr>
      </thead>
      <tbody>
        ${(report.businessTypes || [])
          .map(
            (bt: { businessType: number; count: number }) => `<tr>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(formatBusinessType(bt.businessType))}</td>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(bt.count)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <h2 style="font-size:18px;border-bottom:2px solid #409eff;padding-bottom:4px;">${t('auditDashboard.report.section3')}</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;">
      <thead>
        <tr>
          <th style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.username')}</th>
          <th style="border:1px solid #ddd;padding:8px;">${t('auditDashboard.report.operCount')}</th>
        </tr>
      </thead>
      <tbody>
        ${(report.topOperators || [])
          .map(
            (op: { operName: string; count: number }) => `<tr>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(op.operName)}</td>
          <td style="border:1px solid #ddd;padding:8px;">${escapeHtml(op.count)}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <h2 style="font-size:18px;border-bottom:2px solid #409eff;padding-bottom:4px;">${t('auditDashboard.report.sectionAnomalies', { count: (report.anomalies || []).length })}</h2>
    <table style="width:100%;border-collapse:collapse;margin:10px 0;font-size:12px;">
      <thead>
        <tr>
          <th style="border:1px solid #ddd;padding:6px;">${t('auditDashboard.report.time')}</th>
          <th style="border:1px solid #ddd;padding:6px;">${t('auditDashboard.report.module')}</th>
          <th style="border:1px solid #ddd;padding:6px;">${t('auditDashboard.report.operator')}</th>
          <th style="border:1px solid #ddd;padding:6px;">${t('auditDashboard.report.ip')}</th>
          <th style="border:1px solid #ddd;padding:6px;">${t('auditDashboard.report.errorMsg')}</th>
        </tr>
      </thead>
      <tbody>
        ${(report.anomalies || [])
          .map(
            (a: { operTime: string; title: string; operName: string; operIp: string; errorMsg?: string }) => `<tr>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(a.operTime)}</td>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(a.title)}</td>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(a.operName)}</td>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(a.operIp)}</td>
          <td style="border:1px solid #ddd;padding:6px;">${escapeHtml(a.errorMsg || '')}</td>
        </tr>`
          )
          .join('')}
      </tbody>
    </table>

    <div style="margin-top:40px;text-align:center;color:#999;font-size:12px;">
      ${t('auditDashboard.report.footerDisclaimer')}
    </div>
  `

  document.body.appendChild(container)
  return container
}

/** 导出审计合规报告 PDF */
async function handleExportPdf() {
  exporting.value = true
  try {
    const res = await getComplianceReport(days.value)
    const report = (res?.data ?? res) as ComplianceReport | undefined
    if (!report) {
      ElMessage.warning(t('auditDashboard.report.noData'))
      return
    }

    const reportEl = buildReportDom(report)
    try {
      const filename = `${t('auditDashboard.report.title')}_${new Date().toISOString().slice(0, 10)}`
      await exportElementToPdf(reportEl, filename, {
        orientation: 'portrait',
        format: 'a4'
      })
      ElMessage.success(t('auditDashboard.report.exportSuccess'))
    } finally {
      reportEl.remove()
    }
  } catch (e) {
    if (import.meta.env.DEV) console.error('Export PDF failed:', e)
    ElMessage.error(t('auditDashboard.report.exportFail'))
  } finally {
    exporting.value = false
  }
}

watch(days, () => loadStats())

// 主题切换时复用最近一次数据重新渲染所有图表（不重新请求接口）
watch(
  () => settingsStore.isDark,
  async () => {
    await nextTick()
    if (lastDaily.length === 0 && lastPieData.length === 0 && lastTopUsersData.length === 0) return
    await Promise.all([
      renderTrendChart(lastDaily),
      renderPieChart(lastPieData),
      renderTopUsersChart(lastTopUsersData),
      renderFailTrendChart(lastDaily)
    ])
  }
)

onMounted(async () => {
  await nextTick()
  await loadStats()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  // 图表实例由 useChart 的 onBeforeUnmount 自动清理，无需手动 dispose
  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
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
}

.stat-total .stat-icon {
  background: linear-gradient(135deg, #409eff, #66b1ff);
}
.stat-success .stat-icon {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}
.stat-fail .stat-icon {
  background: linear-gradient(135deg, #f56c6c, #f89898);
}
.stat-active .stat-icon {
  background: linear-gradient(135deg, #e6a23c, #ebb563);
}

.stat-label {
  font-size: 13px;
}

/* U20 优化：图表加载错误状态样式 */
.chart-error {
  color: var(--el-color-danger);

  .el-icon {
    font-size: 18px;
  }
}
</style>
