<template>
  <div class="app-container p-4" v-loading="loading">
    <!-- 顶部统计卡片 -->
    <el-row :gutter="16" class="mb-4">
      <stat-cards :stats="stats" />
    </el-row>

    <!-- 快捷入口 -->
    <quick-entry-panel />

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
          <div>
            <div
              v-motion="fadeInUp"
              ref="loginChartRef"
              v-show="hasLoginData && !chartError.login"
              class="chart-box w-full h-[280px]"
              v-loading="chartLoading.login"
              :element-loading-text="t('common.loading')"
            ></div>
            <el-empty
              v-if="!chartLoading.login && !chartError.login && !hasLoginData"
              class="chart-empty"
              :image-size="60"
              :description="t('common.noData')"
            />
            <Transition name="fade">
              <div v-if="chartError.login" class="chart-error py-4 text-center">
                <el-empty :image-size="60" :description="t('dashboard.loginTrendLoadFail')" />
              </div>
            </Transition>
          </div>
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
          <div>
            <div
              v-motion="fadeInUp"
              ref="operPieRef"
              v-show="hasOperData && !chartError.oper"
              class="chart-box w-full h-[280px]"
              v-loading="chartLoading.oper"
              :element-loading-text="t('common.loading')"
            ></div>
            <el-empty
              v-if="!chartLoading.oper && !chartError.oper && !hasOperData"
              class="chart-empty"
              :image-size="60"
              :description="t('common.noData')"
            />
            <Transition name="fade">
              <div v-if="chartError.oper" class="chart-error py-4 text-center">
                <el-empty :image-size="60" :description="t('dashboard.operDistLoadFail')" />
              </div>
            </Transition>
          </div>
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
          <div>
            <div
              v-motion="fadeInUp"
              ref="userTrendRef"
              v-show="hasUserTrendData && !chartError.userTrend"
              class="chart-box w-full h-[280px]"
              v-loading="chartLoading.userTrend"
              :element-loading-text="t('common.loading')"
            ></div>
            <el-empty
              v-if="!chartLoading.userTrend && !chartError.userTrend && !hasUserTrendData"
              class="chart-empty"
              :image-size="60"
              :description="t('common.noData')"
            />
            <Transition name="fade">
              <div v-if="chartError.userTrend" class="chart-error py-4 text-center">
                <el-empty :image-size="60" :description="t('dashboard.userTrendLoadFail')" />
              </div>
            </Transition>
          </div>
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
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { TrendCharts, PieChart, Histogram, List, Download } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import useSettingsStore from '@/store/modules/settings'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useMotionPresets } from '@/composables/useMotion'
import { useChart, readCssVar } from '@/composables/useChart'
import request from '@/utils/request'
import StatCards from './StatCards.vue'
import QuickEntryPanel from './QuickEntryPanel.vue'
import { useDashboardCharts } from './useDashboardCharts'

// P0 动效：图表容器淡入
const { fadeInUp } = useMotionPresets()

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

// 统一图表管理：复用实例 + 暗色模式适配
const { getChart, withDark } = useChart()

// 图表渲染逻辑（登录趋势/操作类型分布/用户创建趋势）抽离至 composable
const {
  loginChartRef,
  operPieRef,
  userTrendRef,
  loginChartType,
  hasLoginData,
  hasOperData,
  hasUserTrendData,
  chartLoading,
  chartError,
  lastTypeCount,
  lastUserTrend,
  setLoginData,
  renderLoginChart,
  renderOperPie,
  renderUserTrendChart,
  downloadChart,
  handleResize,
  // 图表实例（非响应式捕获值，仅用于模板 :disabled 绑定，保持原有始终禁用行为）
  loginChart,
  operPieChart,
  userTrendChart
} = useDashboardCharts({ getChart, withDark, readCssVar })

const router = useRouter()
const settingsStore = useSettingsStore()
const loading = ref(false)

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

const recentOperLogs = ref<RecentOperLog[]>([])

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
    setLoginData(res.data || [])
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
    lastUserTrend.value = { dates: trendDates, counts: trendCounts }
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
    lastTypeCount.value = typeCount
    hasOperData.value = Object.values(typeCount).some((v) => v > 0)
    await nextTick()
    await renderOperPie(typeCount)
  } catch (e) {
    chartError.value.oper = true
    if (import.meta.env.DEV) console.error('Failed to load operation distribution:', e)
  } finally {
    chartLoading.value.oper = false
  }
}

// 主题切换时复用最近一次数据重新渲染所有图表（不重新请求接口）
watch(
  () => settingsStore.isDark,
  async () => {
    await nextTick()
    await Promise.all([
      renderLoginChart(),
      renderOperPie(lastTypeCount.value),
      renderUserTrendChart(lastUserTrend.value.dates, lastUserTrend.value.counts)
    ])
  }
)

function goToOperLog() {
  router.push('/monitor/operlog')
}

onMounted(async () => {
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
  // 图表实例由 useChart 的 onBeforeUnmount 自动清理
  // resize 定时器由 useDashboardCharts 的 onBeforeUnmount 清理
  // M7: useAutoRefresh 内部通过 onBeforeUnmount 自清理定时器，无需在此手动停止
})
</script>

<style lang="scss" scoped>
/* U20 优化：图表加载错误状态样式（暗色模式兼容） */
.chart-empty {
  height: 280px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.chart-error {
  color: var(--el-text-color-secondary, #909399);
  background: var(--el-fill-color-light, #f5f7fa);
  border-radius: 4px;
}
</style>
