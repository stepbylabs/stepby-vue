<template>
  <div class="app-container p-4" v-loading="loading">
    <!-- 顶部统计卡片 -->
    <el-row :gutter="16" class="mb-4">
      <el-col v-motion="staggerChildren(0)" :xs="12" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card mb-3 stat-users" shadow="hover">
          <div class="stat-content flex items-center gap-[14px]">
            <div
              class="stat-icon w-12 h-12 rounded-[10px] flex items-center justify-center text-2xl text-white shrink-0"
            >
              <el-icon><User /></el-icon>
            </div>
            <div class="stat-info flex-1 min-w-0">
              <div class="stat-value text-2xl font-semibold text-text-primary leading-[1.2]">
                {{ stats.totalUsers }}
              </div>
              <div class="stat-label text-xs text-text-secondary mt-0.5">{{ t('dashboard.totalUsers') }}</div>
              <div
                class="stat-trend text-[11px] text-text-secondary mt-1 flex items-center gap-0.5"
                :class="stats.newUsers > 0 ? 'up' : ''"
              >
                <el-icon v-if="stats.newUsers > 0"><Top /></el-icon>
                {{ t('dashboard.weekNew') }} {{ stats.newUsers }}
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(1)" :xs="12" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card mb-3 stat-roles" shadow="hover">
          <div class="stat-content flex items-center gap-[14px]">
            <div
              class="stat-icon w-12 h-12 rounded-[10px] flex items-center justify-center text-2xl text-white shrink-0"
            >
              <el-icon><UserFilled /></el-icon>
            </div>
            <div class="stat-info flex-1 min-w-0">
              <div class="stat-value text-2xl font-semibold text-text-primary leading-[1.2]">
                {{ stats.totalRoles }}
              </div>
              <div class="stat-label text-xs text-text-secondary mt-0.5">{{ t('dashboard.activeRoles') }}</div>
              <div class="stat-trend text-[11px] text-text-secondary mt-1 flex items-center gap-0.5">
                {{ stats.activeRoles }} {{ t('dashboard.activeRolesSuffix') }}
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(2)" :xs="12" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card mb-3 stat-logins" shadow="hover">
          <div class="stat-content flex items-center gap-[14px]">
            <div
              class="stat-icon w-12 h-12 rounded-[10px] flex items-center justify-center text-2xl text-white shrink-0"
            >
              <el-icon><Monitor /></el-icon>
            </div>
            <div class="stat-info flex-1 min-w-0">
              <div class="stat-value text-2xl font-semibold text-text-primary leading-[1.2]">
                {{ stats.todayLogins }}
              </div>
              <div class="stat-label text-xs text-text-secondary mt-0.5">{{ t('dashboard.todayLogin') }}</div>
              <div
                class="stat-trend text-[11px] text-text-secondary mt-1 flex items-center gap-0.5"
                :class="stats.loginFail > 0 ? 'down' : ''"
              >
                {{ t('dashboard.buttonFail') }} {{ stats.loginFail }}
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(3)" :xs="12" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card mb-3 stat-online" shadow="hover">
          <div class="stat-content flex items-center gap-[14px]">
            <div
              class="stat-icon w-12 h-12 rounded-[10px] flex items-center justify-center text-2xl text-white shrink-0"
            >
              <el-icon><Connection /></el-icon>
            </div>
            <div class="stat-info flex-1 min-w-0">
              <div class="stat-value text-2xl font-semibold text-text-primary leading-[1.2]">
                {{ stats.onlineCount }}
              </div>
              <div class="stat-label text-xs text-text-secondary mt-0.5">{{ t('dashboard.onlineUsers') }}</div>
              <div class="stat-trend up text-[11px] text-text-secondary mt-1 flex items-center gap-0.5">
                {{ t('dashboard.realtime') }}
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(4)" :xs="12" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card mb-3 stat-anomaly" shadow="hover">
          <div class="stat-content flex items-center gap-[14px]">
            <div
              class="stat-icon w-12 h-12 rounded-[10px] flex items-center justify-center text-2xl text-white shrink-0"
            >
              <el-icon><Warning /></el-icon>
            </div>
            <div class="stat-info flex-1 min-w-0">
              <div class="stat-value text-2xl font-semibold text-text-primary leading-[1.2]">
                {{ stats.todayAnomalyIps }}
              </div>
              <div class="stat-label text-xs text-text-secondary mt-0.5">{{ t('dashboard.todayAnomaly') }}</div>
              <div
                class="stat-trend text-[11px] text-text-secondary mt-1 flex items-center gap-0.5"
                :class="stats.todayAnomalyIps > 0 ? 'down' : ''"
              >
                {{ t('dashboard.failIpCount') }}
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 快捷入口 -->
    <el-row :gutter="16" class="mb-4">
      <el-col :span="24">
        <el-card shadow="hover" class="rounded-lg">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span>
                <el-icon><Promotion /></el-icon>
                {{ t('dashboard.quickEntry.title') }}
              </span>
              <el-tooltip :content="t('dashboard.quickEntry.tip')" placement="top">
                <el-icon class="header-tip-icon text-text-secondary cursor-help text-base"><QuestionFilled /></el-icon>
              </el-tooltip>
            </div>
          </template>
          <div class="quick-entry-grid grid gap-3">
            <div
              v-for="entry in quickEntries"
              :key="entry.path"
              class="quick-entry-item flex items-center gap-3 p-3 px-[14px] rounded-lg cursor-pointer border border-transparent"
              :class="{ disabled: entry.disabled }"
              @click="handleQuickEntry(entry)"
            >
              <div
                class="entry-icon w-10 h-10 rounded-lg flex items-center justify-center text-xl text-white shrink-0"
                :style="{ background: entry.bgColor }"
              >
                <el-icon><component :is="entry.icon" /></el-icon>
              </div>
              <div class="entry-text flex-1 min-w-0">
                <div class="entry-title text-sm font-semibold text-text-primary leading-[1.2]">
                  {{ t(entry.titleKey) }}
                </div>
                <div class="entry-desc text-[11px] text-text-secondary mt-1 truncate">{{ t(entry.descKey) }}</div>
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 图表区 -->
    <el-row :gutter="16" class="mb-4">
      <el-col :xs="24" :lg="16">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span>
                <el-icon><TrendCharts /></el-icon>
                {{ t('dashboard.loginTrend') }}
              </span>
              <div class="card-header-actions flex items-center gap-2">
                <el-radio-group v-model="loginChartType" size="small">
                  <el-radio-button value="success">{{ t('dashboard.buttonSuccess') }}</el-radio-button>
                  <el-radio-button value="fail">{{ t('dashboard.buttonFail') }}</el-radio-button>
                  <el-radio-button value="all">{{ t('dashboard.buttonAll') }}</el-radio-button>
                </el-radio-group>
                <!-- TierS-6: 图表下载按钮 -->
                <el-tooltip :content="t('common.downloadChart')" placement="top">
                  <el-button
                    link
                    type="primary"
                    :aria-label="t('common.downloadChart')"
                    @click="downloadChart('login')"
                    :disabled="!loginChart"
                  >
                    <el-icon><Download /></el-icon>
                  </el-button>
                </el-tooltip>
              </div>
            </div>
          </template>
          <div
            v-motion="fadeInUp"
            ref="loginChartRef"
            class="chart-box w-full h-[280px]"
            v-loading="chartLoading.login"
            :element-loading-text="t('common.loading')"
          ></div>
          <Transition name="fade">
            <div v-if="chartError.login" class="chart-error py-4 text-center">
              <el-empty :image-size="60" :description="t('dashboard.loginTrendLoadFail')" />
            </div>
          </Transition>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="8">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span>
                <el-icon><PieChart /></el-icon>
                {{ t('dashboard.operTypeDist') }}
              </span>
              <!-- TierS-6: 图表下载按钮 -->
              <el-tooltip :content="t('common.downloadChart')" placement="top">
                <el-button
                  link
                  type="primary"
                  :aria-label="t('common.downloadChart')"
                  @click="downloadChart('oper')"
                  :disabled="!operPieChart"
                >
                  <el-icon><Download /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </template>
          <div
            v-motion="fadeInUp"
            ref="operPieRef"
            class="chart-box w-full h-[280px]"
            v-loading="chartLoading.oper"
            :element-loading-text="t('common.loading')"
          ></div>
          <Transition name="fade">
            <div v-if="chartError.oper" class="chart-error py-4 text-center">
              <el-empty :image-size="60" :description="t('dashboard.operDistLoadFail')" />
            </div>
          </Transition>
        </el-card>
      </el-col>
    </el-row>

    <el-row :gutter="16" class="mb-4">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span>
                <el-icon><Histogram /></el-icon>
                {{ t('dashboard.userCreateTrend') }}
              </span>
              <!-- TierS-6: 图表下载按钮 -->
              <el-tooltip :content="t('common.downloadChart')" placement="top">
                <el-button
                  link
                  type="primary"
                  :aria-label="t('common.downloadChart')"
                  @click="downloadChart('userTrend')"
                  :disabled="!userTrendChart"
                >
                  <el-icon><Download /></el-icon>
                </el-button>
              </el-tooltip>
            </div>
          </template>
          <div
            v-motion="fadeInUp"
            ref="userTrendRef"
            class="chart-box w-full h-[280px]"
            v-loading="chartLoading.userTrend"
            :element-loading-text="t('common.loading')"
          ></div>
          <Transition name="fade">
            <div v-if="chartError.userTrend" class="chart-error py-4 text-center">
              <el-empty :image-size="60" :description="t('dashboard.userTrendLoadFail')" />
            </div>
          </Transition>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <div class="card-header flex items-center justify-between font-medium">
              <span>
                <el-icon><List /></el-icon>
                {{ t('dashboard.recentOperLog') }}
              </span>
              <el-button link type="primary" @click="goToOperLog">{{ t('common.viewAll') }}</el-button>
            </div>
          </template>
          <el-table :data="recentOperLogs" size="small" :show-header="true" style="width: 100%">
            <el-table-column prop="title" :label="t('common.tip')" min-width="120" show-overflow-tooltip />
            <el-table-column prop="operName" :label="t('common.column.operator')" width="100" />
            <el-table-column :label="t('common.column.status')" width="70" align="center">
              <template #default="{ row }">
                <el-tag :type="row.status === 0 ? 'success' : 'danger'" size="small">
                  {{ row.status === 0 ? t('dashboard.buttonSuccess') : t('dashboard.buttonFail') }}
                </el-tag>
              </template>
            </el-table-column>
            <el-table-column prop="costTime" :label="t('common.column.duration')" width="80" align="right">
              <template #default="{ row }">{{ row.costTime }}ms</template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts">
const { t } = useI18n()
import { ref, onMounted, onBeforeUnmount, watch, markRaw, nextTick } from 'vue'
import type { Component } from 'vue'
import { type ECharts } from '@/utils/echarts'
import { useChart } from '@/composables/useChart'
import {
  User,
  UserFilled,
  Monitor,
  Connection,
  Top,
  TrendCharts,
  PieChart,
  Histogram,
  List,
  Warning,
  Promotion,
  QuestionFilled,
  Document,
  Bell,
  Files,
  Setting,
  Guide,
  InfoFilled,
  Download
} from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import useUserStore from '@/store/modules/user'
import useSettingsStore from '@/store/modules/settings'
import { ElMessage } from 'element-plus'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useMotionPresets } from '@/composables/useMotion'
import request from '@/utils/request'

// P0 动效：统计卡片错峰入场 + 图表容器淡入
const { fadeInUp, staggerChildren } = useMotionPresets()

// P3-3：为 dashboard 接口响应定义具体类型，替换 :any
interface RecentOperLog {
  title: string
  operName: string
  status: number | string
  costTime: number
}

interface DashboardStats {
  totalUsers?: number
  totalRoles?: number
  activeRoles?: number
  todayLogins?: number
  loginFail?: number
  onlineCount?: number
  todayAnomalyIps?: number
  recentOperLogs?: RecentOperLog[]
  newUsersThisWeek?: number
  createTrend?: Array<{ date: string; count: number }>
}

interface LoginTrendItem {
  date: string
  success: number
  fail: number
}

// U18 优化：ECharts resize 防抖，避免高频 resize 卡顿
let resizeTimer: ReturnType<typeof setTimeout> | null = null
// U20 优化：图表加载/错误状态，提升用户感知
const chartLoading = ref({ login: false, oper: false, userTrend: false })
const chartError = ref({ login: false, oper: false, userTrend: false })

// 统一图表管理：复用实例 + 暗色模式适配
const { getChart, withDark } = useChart()

// 读取 CSS 变量值供 ECharts 等 JS 场景使用（带 fallback 兜底）
function getCssVar(name: string, fallback: string): string {
  if (typeof window === 'undefined') return fallback
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

const router = useRouter()
const userStore = useUserStore()
const settingsStore = useSettingsStore()
const loading = ref(false)

// 快捷入口配置（根据权限动态过滤）
interface QuickEntry {
  path: string
  titleKey: string
  descKey: string
  icon: Component
  // M2: bgColor 为图标背景渐变色，属于设计变体（非语义色）。
  // 暗色模式下鲜艳渐变色仍然合适，故保留 inline style 不做暗色模式适配。
  bgColor: string
  permission?: string
  disabled?: boolean
}

const allQuickEntries: QuickEntry[] = [
  {
    path: '/system/user',
    titleKey: 'dashboard.quickEntry.userManage',
    descKey: 'dashboard.quickEntry.userManageDesc',
    icon: markRaw(User),
    bgColor: 'linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3))',
    permission: 'system:user:list'
  },
  {
    path: '/system/role',
    titleKey: 'dashboard.quickEntry.roleManage',
    descKey: 'dashboard.quickEntry.roleManageDesc',
    icon: markRaw(UserFilled),
    bgColor: 'linear-gradient(135deg, var(--el-color-success), var(--el-color-success-light-3))',
    permission: 'system:role:list'
  },
  {
    path: '/system/notice',
    titleKey: 'dashboard.quickEntry.notice',
    descKey: 'dashboard.quickEntry.noticeDesc',
    icon: markRaw(Bell),
    bgColor: 'linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-light-3))',
    permission: 'system:notice:list'
  },
  {
    path: '/monitor/backup',
    titleKey: 'dashboard.quickEntry.backup',
    descKey: 'dashboard.quickEntry.backupDesc',
    icon: markRaw(Files),
    bgColor: 'linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-light-3))',
    permission: 'system:backup:list'
  },
  {
    path: '/system/log/operlog',
    titleKey: 'dashboard.quickEntry.operLog',
    descKey: 'dashboard.quickEntry.operLogDesc',
    icon: markRaw(Document),
    bgColor: 'linear-gradient(135deg, var(--el-color-info), var(--el-color-info-light-3))',
    permission: 'monitor:operlog:list'
  },
  {
    path: '/monitor/logininfor',
    titleKey: 'dashboard.quickEntry.myLogin',
    descKey: 'dashboard.quickEntry.myLoginDesc',
    icon: markRaw(Guide),
    bgColor: 'linear-gradient(135deg, var(--el-color-info), var(--el-color-info-light-5))'
  },
  {
    path: '/system/config',
    titleKey: 'dashboard.quickEntry.config',
    descKey: 'dashboard.quickEntry.configDesc',
    icon: markRaw(Setting),
    bgColor: 'linear-gradient(135deg, var(--el-color-info), var(--el-color-info-light-3))',
    permission: 'system:config:list'
  },
  {
    path: '/help-center/about',
    titleKey: 'dashboard.quickEntry.about',
    descKey: 'dashboard.quickEntry.aboutDesc',
    icon: markRaw(InfoFilled),
    bgColor: 'linear-gradient(135deg, var(--el-color-success), var(--el-color-success-light-5))'
  }
]

const quickEntries = ref<QuickEntry[]>([])

function hasPermission(perm?: string): boolean {
  if (!perm) return true
  // 超管拥有所有权限
  if (userStore.roles?.includes('admin')) return true
  return (userStore.permissions || []).includes(perm) || (userStore.permissions || []).includes('*:*:*')
}

function loadQuickEntries() {
  quickEntries.value = allQuickEntries.filter((e) => hasPermission(e.permission))
}

function handleQuickEntry(entry: QuickEntry) {
  if (entry.disabled) return
  router.push(entry.path)
}

const stats = ref({
  totalUsers: 0,
  newUsers: 0,
  totalRoles: 0,
  activeRoles: 0,
  todayLogins: 0,
  loginFail: 0,
  onlineCount: 0,
  todayAnomalyIps: 0
})

const loginChartRef = ref<HTMLElement | null>(null)
const operPieRef = ref<HTMLElement | null>(null)
const userTrendRef = ref<HTMLElement | null>(null)
const loginChartType = ref<'success' | 'fail' | 'all'>('all')

const recentOperLogs = ref<RecentOperLog[]>([])

// L8: loginData 用 let 模块变量（非 ref）是有意为之 - 数据加载后通过 renderLoginChart 直接消费，
// 不需要响应式驱动视图更新（图表通过 setOption 显式更新），避免无谓的响应式开销。
let loginChart: ECharts | null = null
let operPieChart: ECharts | null = null
let userTrendChart: ECharts | null = null

let loginData: Array<{ date: string; success: number; fail: number }> = []
// 主题切换时复用最近一次数据重新渲染（避免重新请求接口）
let lastTypeCount: Record<string, number> = {}
let lastUserTrend: { dates: string[]; counts: number[] } = { dates: [], counts: [] }

async function loadStats() {
  loading.value = true
  try {
    // U5 优化：从 6 路并发请求合并为单次 /dashboard/stats 调用
    // 后端聚合返回用户/角色/登录/在线/异常IP/最近操作日志等全部字段
    const res: { data?: DashboardStats } = await request({ url: '/dashboard/stats', method: 'get' })
    const data = res.data || {}
    stats.value.totalUsers = data.totalUsers || 0
    stats.value.totalRoles = data.totalRoles || 0
    stats.value.activeRoles = data.activeRoles || 0
    stats.value.todayLogins = data.todayLogins || 0
    stats.value.loginFail = data.loginFail || 0
    stats.value.onlineCount = data.onlineCount || 0
    stats.value.todayAnomalyIps = data.todayAnomalyIps || 0
    recentOperLogs.value = (data.recentOperLogs || []).map((r: RecentOperLog) => ({
      title: r.title,
      operName: r.operName,
      status: typeof r.status === 'string' ? (r.status === '0' ? 0 : 1) : r.status,
      costTime: r.costTime
    }))
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to load stats:', e)
  } finally {
    loading.value = false
  }
}

async function loadLoginTrend() {
  chartLoading.value.login = true
  chartError.value.login = false
  try {
    const res: { data?: LoginTrendItem[] } = await request({
      url: '/monitor/logininfor/stats',
      method: 'get',
      params: { days: 14 }
    })
    loginData = (res.data || []) as Array<{ date: string; success: number; fail: number }>
    await nextTick()
    await renderLoginChart()
  } catch (e) {
    chartError.value.login = true
    if (import.meta.env.DEV) console.error('Failed to load login trend:', e)
  } finally {
    chartLoading.value.login = false
  }
}

async function loadUserTrend() {
  chartLoading.value.userTrend = true
  chartError.value.userTrend = false
  try {
    // U14 优化：从 /system/user/list?pageSize=100 改为专用 /dashboard/user-stats 聚合接口
    // 后端按天聚合 30 天用户创建数，避免拉取全量用户列表
    const res = (await request({ url: '/dashboard/user-stats', method: 'get' })) as {
      data?: { newUsersThisWeek?: number; createTrend?: Array<{ date: string; count: number }> }
    }
    const data = res.data || {}
    stats.value.newUsers = data.newUsersThisWeek || 0

    const trend: Array<{ date: string; count: number }> = data.createTrend || []
    const trendDates = trend.map((t) => t.date)
    const trendCounts = trend.map((t) => t.count)
    lastUserTrend = { dates: trendDates, counts: trendCounts }
    await nextTick()
    await renderUserTrendChart(trendDates, trendCounts)
  } catch (e) {
    chartError.value.userTrend = true
    if (import.meta.env.DEV) console.error('Failed to load user trend:', e)
  } finally {
    chartLoading.value.userTrend = false
  }
}

async function loadOperPie() {
  chartLoading.value.oper = true
  chartError.value.oper = false
  try {
    // G5：改用后端专用聚合接口 /monitor/operlog/stats-by-type，避免拉取 pageSize=1000 全量明细再客户端分组。
    // 后端按 business_type 聚合后一次性返回 insert/update/delete/other 四桶计数。
    const res = (await request({
      url: '/monitor/operlog/stats-by-type',
      method: 'get'
    })) as { data?: { insert: number; update: number; delete: number; other: number } }
    const d = res.data || { insert: 0, update: 0, delete: 0, other: 0 }
    // 使用英文常量作为 typeCount 的键，避免 i18n 文本变化导致 keyMap 不匹配；
    // 渲染时通过 renderOperPie 内的 keyMap 转换为 i18n 文本展示
    const typeCount: Record<string, number> = {
      insert: d.insert || 0,
      update: d.update || 0,
      delete: d.delete || 0,
      other: d.other || 0
    }
    lastTypeCount = typeCount
    await nextTick()
    await renderOperPie(typeCount)
  } catch (e) {
    chartError.value.oper = true
    if (import.meta.env.DEV) console.error('Failed to load operation distribution:', e)
  } finally {
    chartLoading.value.oper = false
  }
}

async function renderLoginChart() {
  if (!loginChartRef.value || loginData.length === 0) return
  loginChart = await getChart(loginChartRef.value)
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
      itemStyle: { color: getCssVar('--el-color-success', '#67c23a') }
    })
  }
  if (loginChartType.value === 'fail' || loginChartType.value === 'all') {
    series.push({
      name: t('dashboard.buttonFail'),
      type: 'line',
      smooth: true,
      data: fail,
      areaStyle: {},
      itemStyle: { color: getCssVar('--el-color-danger', '#f56c6c') }
    })
  }
  loginChart.setOption(
    withDark(loginChart, {
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
  operPieChart = await getChart(operPieRef.value)
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
    withDark(operPieChart, {
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
            getCssVar('--el-color-primary', '#409eff'),
            getCssVar('--el-color-warning', '#e6a23c'),
            getCssVar('--el-color-danger', '#f56c6c'),
            getCssVar('--el-color-info', '#909399')
          ]
        }
      ]
    }),
    true
  )
}

async function renderUserTrendChart(dates: string[], counts: number[]) {
  if (!userTrendRef.value) return
  userTrendChart = await getChart(userTrendRef.value)
  if (!userTrendChart) return
  userTrendChart.setOption(
    withDark(userTrendChart, {
      tooltip: { trigger: 'axis' },
      grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
      xAxis: { type: 'category', data: dates, axisLabel: { rotate: 30 } },
      yAxis: { type: 'value', minInterval: 1 },
      series: [
        {
          name: t('common.add'),
          type: 'bar',
          data: counts,
          itemStyle: { color: getCssVar('--el-color-primary', '#409eff') }
        }
      ]
    }),
    true
  )
}

watch(loginChartType, () => renderLoginChart())

// 主题切换时复用最近一次数据重新渲染所有图表（不重新请求接口）
watch(
  () => settingsStore.isDark,
  async () => {
    await nextTick()
    await Promise.all([
      renderLoginChart(),
      renderOperPie(lastTypeCount),
      renderUserTrendChart(lastUserTrend.dates, lastUserTrend.counts)
    ])
  }
)

function handleResize() {
  // U18 优化：防抖 150ms，避免高频 resize 卡顿
  if (resizeTimer) clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => {
    loginChart?.resize()
    operPieChart?.resize()
    userTrendChart?.resize()
  }, 150)
}

function goToOperLog() {
  router.push('/system/log/operlog')
}

/** TierS-6: 下载图表为 PNG 图片 */
function downloadChart(name: 'login' | 'oper' | 'userTrend'): void {
  const chart = name === 'login' ? loginChart : name === 'oper' ? operPieChart : userTrendChart
  if (!chart) {
    ElMessage.warning(t('common.chartNotReady'))
    return
  }
  try {
    // 暗色模式下导出白底图片，避免透明背景导致看不清
    const isDark = document.documentElement.classList.contains('dark')
    const url = chart.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: isDark ? getCssVar('--el-bg-color', '#141414') : getCssVar('--el-bg-color-page', '#ffffff')
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
    ElMessage.error(t('common.chartDownloadFail'))
  }
}

onMounted(async () => {
  loadQuickEntries()
  await loadStats()
  await Promise.all([loadLoginTrend(), loadUserTrend(), loadOperPie()])
  window.addEventListener('resize', handleResize)
})

// TierS-7: 自动刷新 - 根据 userPrefs.autoRefreshInterval 定时刷新统计与图表
// 不立即执行（onMounted 已加载），仅按间隔刷新
useAutoRefresh(async () => {
  await loadStats()
  await Promise.all([loadLoginTrend(), loadUserTrend(), loadOperPie()])
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  if (resizeTimer) {
    clearTimeout(resizeTimer)
    resizeTimer = null
  }
  // 图表实例由 useChart 的 onBeforeUnmount 自动清理
  // M7: useAutoRefresh 内部通过 onBeforeUnmount 自清理定时器，无需在此手动停止
})
</script>

<style lang="scss" scoped>
.stat-card {
  :deep(.el-card__body) {
    padding: 16px;
  }
}

.stat-users .stat-icon {
  background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
}
.stat-roles .stat-icon {
  background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-light-3));
}
.stat-logins .stat-icon {
  background: linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-light-3));
}
.stat-online .stat-icon {
  background: linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-light-3));
}
.stat-anomaly .stat-icon {
  background: linear-gradient(135deg, var(--el-color-info), var(--el-color-info-light-3));
}

.stat-trend {
  &.up {
    color: var(--el-color-success, #67c23a);
  }
  &.down {
    color: var(--el-color-danger, #f56c6c);
  }
}

.quick-entry-grid {
  grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
}

/* U20 优化：图表加载错误状态样式（暗色模式兼容） */
.chart-error {
  color: var(--el-text-color-secondary, #909399);
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 4px;
}

.quick-entry-item {
  background: var(--el-fill-color-light, #f5f7fa);
  transition: all 0.25s ease;

  &:hover {
    background: var(--el-fill-color, #ebeef5);
    transform: translateY(-2px);
    border-color: var(--el-color-primary-light-7, #d9ecff);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  &.disabled {
    opacity: 0.5;
    cursor: not-allowed;
    &:hover {
      transform: none;
    }
  }
}
</style>
