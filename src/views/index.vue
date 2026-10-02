<template>
  <div class="app-container home text-[13px] text-text-regular overflow-x-hidden">
    <!-- 登录统计仪表盘（首页增强） -->
    <!-- TierS-4: 移除局部水印，由 layout/index.vue 全局控制（userPrefs.watermarkEnabled） -->
    <el-card class="stats-card" shadow="hover">
      <template v-slot:header>
        <div class="stats-header flex justify-between items-center font-semibold">
          <span>
            <el-icon><DataLine /></el-icon>
            {{ t('dashboard.loginStatTitle') }}
          </span>
          <el-tag type="info" size="small">
            {{ t('dashboard.loginStatSummary', { success: totalSuccess, fail: totalFail }) }}
          </el-tag>
        </div>
      </template>
      <div
        ref="chartRef"
        class="h-[280px] w-full"
        v-loading="loading"
        :element-loading-text="t('common.loading')"
      ></div>
      <!-- U20 优化：图表加载错误状态 -->
      <Transition name="fade">
        <div v-if="chartError" class="chart-error flex items-center justify-center gap-2 p-3 text-danger text-sm">
          <el-icon><WarningFilled /></el-icon>
          <span>{{ t('dashboard.chartLoadFail') }}</span>
          <el-button text type="primary" @click="loadLoginStats">{{ t('common.refresh') }}</el-button>
        </div>
      </Transition>
    </el-card>

    <el-row :gutter="20">
      <el-col :sm="24" :lg="12" class="pl-5">
        <h2>{{ t('dashboard.welcomeTitle') }}</h2>
        <p>{{ t('dashboard.welcomeDesc') }}</p>
        <p>
          <b>{{ t('dashboard.versionTitle') }}</b>
          <span>v{{ version }}</span>
        </p>
        <p>
          <el-tag type="danger">{{ t('dashboard.freeOpenSource') }}</el-tag>
        </p>
        <p>
          <el-button type="primary" icon="Cloudy" plain @click="goTarget('https://github.com/stepby/stepby')">
            {{ t('dashboard.visitRepo') }}
          </el-button>
          <el-button icon="HomeFilled" plain @click="goTarget('https://stepby.tzkj.net')">
            {{ t('dashboard.visitHome') }}
          </el-button>
        </p>
      </el-col>

      <el-col :sm="24" :lg="12" class="pl-[50px]">
        <el-row>
          <el-col :span="12">
            <h2>{{ t('dashboard.techStack') }}</h2>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="6">
            <h4>{{ t('dashboard.backendTech') }}</h4>
            <ul>
              <li>Axum</li>
              <li>Tokio</li>
              <li>JWT</li>
              <li>SeaORM</li>
              <li>Redis</li>
              <li>Serde</li>
              <li>...</li>
            </ul>
          </el-col>
          <el-col :span="6">
            <h4>{{ t('dashboard.frontendTech') }}</h4>
            <ul>
              <li>Vue3</li>
              <li>Pinia</li>
              <li>Element Plus</li>
              <li>Axios</li>
              <li>TypeScript</li>
              <li>Tailwind CSS</li>
              <li>...</li>
            </ul>
          </el-col>
        </el-row>
      </el-col>
    </el-row>
    <el-divider />
    <el-row :gutter="20">
      <el-col :xs="24" :sm="24" :md="12" :lg="8">
        <el-card class="update-log">
          <template v-slot:header>
            <div class="clearfix">
              <span>{{ t('dashboard.contactInfo') }}</span>
            </div>
          </template>
          <div class="body">
            <p>
              <el-icon><Promotion /></el-icon>
              {{ t('dashboard.officialSite') }}
              <el-link href="https://stepby.tzkj.net" target="_blank">https://stepby.tzkj.net</el-link>
            </p>
            <p>
              <el-icon><ChatDotRound /></el-icon>
              {{ t('dashboard.wechat') }}
              <span class="font-semibold">Stepby</span>
            </p>
            <p>
              <el-icon><Money /></el-icon>
              {{ t('dashboard.alipay') }}
              <span class="font-semibold">Stepby</span>
            </p>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="24" :md="12" :lg="8">
        <el-card class="update-log">
          <template v-slot:header>
            <div class="clearfix">
              <span>{{ t('dashboard.changelog') }}</span>
            </div>
          </template>
          <el-collapse accordion>
            <el-collapse-item
              v-for="entry in changelog"
              :key="entry.version"
              :title="`${entry.version} - ${entry.date}`"
            >
              <ol>
                <li v-for="item in entry.items" :key="item">{{ item }}</li>
              </ol>
            </el-collapse-item>
          </el-collapse>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts" name="Index">
const { t } = useI18n()
import { Promotion, ChatDotRound, Money, DataLine, WarningFilled } from '@element-plus/icons-vue'
import { changelog } from '@/data/changelog'
import { type ECharts, type EChartsOption } from '@/utils/echarts'
import { useChart, readCssVar } from '@/composables/useChart'
import useSettingsStore from '@/store/modules/settings'
import request from '@/utils/request'

const version = ref<string>(__APP_VERSION__ || '0.1.0')
const chartRef = ref<HTMLElement | null>(null)
const loading = ref(false)
// U20 优化：图表加载错误状态
const chartError = ref(false)
const totalSuccess = ref(0)
const totalFail = ref(0)
// TierS-4: 水印改由 layout/index.vue 全局控制（userPrefs.watermarkEnabled）

let chartInstance: ECharts | null = null
const { getChart, withDark, resize } = useChart()
const settingsStore = useSettingsStore()
// 主题切换时复用最近一次数据重新渲染（避免重新请求接口）
let lastLoginStatsData: Array<{ date: string; success: number; fail: number }> = []

function goTarget(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer')
}

/** 加载登录统计 */
async function loadLoginStats(): Promise<void> {
  loading.value = true
  chartError.value = false
  try {
    const res = (await request({ url: '/monitor/logininfor/stats?days=7', method: 'get' })) as {
      data?: Array<{ date: string; success: number; fail: number }>
    }
    const data: Array<{ date: string; success: number; fail: number }> = res.data || []
    lastLoginStatsData = data
    totalSuccess.value = data.reduce((sum, item) => sum + item.success, 0)
    totalFail.value = data.reduce((sum, item) => sum + item.fail, 0)
    await nextTick()
    await renderChart(data)
  } catch (err) {
    if (import.meta.env.DEV) console.error('[Home] Failed to load login stats:', err)
    chartError.value = true
  } finally {
    loading.value = false
  }
}

async function renderChart(data: Array<{ date: string; success: number; fail: number }>): Promise<void> {
  if (!chartRef.value) return
  chartInstance = await getChart(chartRef.value)
  if (!chartInstance) return
  const option: EChartsOption = withDark(chartInstance, {
    tooltip: { trigger: 'axis' },
    legend: { data: [t('dashboard.buttonSuccess'), t('dashboard.buttonFail')], right: 10 },
    grid: { left: '3%', right: '4%', bottom: '3%', containLabel: true },
    xAxis: {
      type: 'category',
      boundaryGap: false,
      data: data.map((d) => d.date.substring(5))
    },
    yAxis: { type: 'value', minInterval: 1 },
    series: [
      {
        name: t('dashboard.buttonSuccess'),
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.3 },
        itemStyle: {
          color: readCssVar('--el-color-success', '#67c23a')
        },
        data: data.map((d) => d.success)
      },
      {
        name: t('dashboard.buttonFail'),
        type: 'line',
        smooth: true,
        areaStyle: { opacity: 0.3 },
        itemStyle: {
          color: readCssVar('--el-color-danger', '#f56c6c')
        },
        data: data.map((d) => d.fail)
      }
    ]
  })
  chartInstance.setOption(option, true)
}

// 主题切换时复用最近一次数据重新渲染（不重新请求接口）
watch(
  () => settingsStore.isDark,
  async () => {
    await nextTick()
    if (lastLoginStatsData.length > 0) {
      await renderChart(lastLoginStatsData)
    }
  }
)

onMounted(() => {
  loadLoginStats()
  window.addEventListener('resize', handleResize)
})

onBeforeUnmount(() => {
  // 图表实例与 resize 防抖定时器均由 useChart 的 onBeforeUnmount 统一清理
  window.removeEventListener('resize', handleResize)
})

// U18 优化：resize 防抖（150ms）与实例复用统一交由 useChart().resize() 处理，
// 与 dashboard / audit-dashboard / cache 保持一致，避免各页面重复实现防抖与定时器清理。
function handleResize(): void {
  resize()
}
</script>

<style scoped lang="scss">
.home {
  .stats-card {
    margin-bottom: 20px;

    .stats-header {
      .el-icon {
        margin-right: 4px;
        vertical-align: middle;
      }
    }

    /* U20 优化：图表加载错误状态样式 */
    .chart-error {
      .el-icon {
        font-size: 18px;
      }
    }
  }

  blockquote {
    padding: 10px 20px;
    margin: 0 0 20px;
    font-size: 17.5px;
    border-left: 5px solid var(--el-border-color-lighter);
  }
  hr {
    margin-top: 20px;
    margin-bottom: 20px;
    border: 0;
    border-top: 1px solid var(--el-border-color-lighter);
  }
  .col-item {
    margin-bottom: 20px;
  }

  ul {
    padding: 0;
    margin: 0;
  }

  font-family: 'open sans', 'Helvetica Neue', Helvetica, Arial, sans-serif;

  ul {
    list-style-type: none;
  }

  h4 {
    margin-top: 0px;
  }

  h2 {
    margin-top: 10px;
    font-size: 26px;
    font-weight: 100;
  }

  p {
    margin-top: 10px;

    b {
      font-weight: 700;
    }
  }

  .update-log {
    ol {
      display: block;
      list-style-type: decimal;
      margin-block-start: 1em;
      margin-block-end: 1em;
      margin-inline-start: 0;
      margin-inline-end: 0;
      padding-inline-start: 40px;
    }
  }
}
</style>
