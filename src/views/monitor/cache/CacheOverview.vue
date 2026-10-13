<template>
  <!-- Redis 未连接空状态 -->
  <Transition mode="out-in" name="fade">
    <div v-if="!cache?.info" key="empty">
      <el-empty :description="t('cache.tip.notConnected')" :image-size="120">
        <el-button type="primary" @click="getList">{{ t('common.refresh') }}</el-button>
      </el-empty>
    </div>
    <div v-else key="content">
      <el-row :gutter="10">
        <el-col :span="24" class="card-box">
          <el-card>
            <template #header>
              <Monitor class="align-middle w-[1em] h-[1em]"/>
              <span class="align-middle">{{ t('cache.info.basicInfo') }}</span>
            </template>
            <el-descriptions :column="4" border size="small">
              <el-descriptions-item :label="t('cache.info.redisVersion')">
                {{ cache.info.redis_version }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.runMode')">
                {{ cache.info.redis_mode == 'standalone' ? t('cache.info.standalone') : t('cache.info.cluster') }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.port')">{{ cache.info.tcp_port }}</el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.clients')">
                {{ cache.info.connected_clients }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.uptimeDays')">
                {{ cache.info.uptime_in_day }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.usedMemory')">
                {{ cache.info.used_memory_human }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.usedCpu')">
                {{ (parseFloat(cache.info.used_cpu_user_children) || 0).toFixed(2) }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.maxMemory')">
                {{ cache.info.maxmemory_human }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.aofEnabled')">
                {{ cache.info.aof_enabled == '0' ? t('common.no') : t('common.yes') }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.rdbStatus')">
                {{ cache.info.rdb_last_bgsave_status }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.keyCount')">{{ cache.dbSize }}</el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.network')">
                {{ cache.info.instantaneous_input_kbps }}kps/{{ cache.info.instantaneous_output_kbps }}kps
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="24" :md="12" class="card-box">
          <el-card>
            <template #header>
              <PieChart class="align-middle w-[1em] h-[1em]"/>
              <span class="align-middle">{{ t('cache.info.commandStats') }}</span>
            </template>
            <div v-loading="loading" :element-loading-text="t('common.loading')">
              <div ref="commandstats" class="h-[420px] w-full min-w-[300px]" />
              <Transition name="fade">
                <div v-if="chartError" class="chart-error flex items-center justify-center gap-2 p-3 text-sm">
                  <el-icon><WarningFilled /></el-icon>
                  <span>{{ t('dashboard.chartLoadFail') }}</span>
                  <el-button text type="primary" @click="getList">{{ t('common.refresh') }}</el-button>
                </div>
              </Transition>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="24" :md="12" class="card-box">
          <el-card>
            <template #header>
              <Odometer class="align-middle w-[1em] h-[1em]"/>
              <span class="align-middle">{{ t('cache.info.memoryInfo') }}</span>
            </template>
            <div v-loading="loading" :element-loading-text="t('common.loading')">
              <div ref="usedmemory" class="h-[420px] w-full min-w-[300px]" />
            </div>
          </el-card>
        </el-col>
      </el-row>
    </div>
  </Transition>
</template>

<script setup lang="ts" name="CacheOverview">
import { Monitor, PieChart, Odometer, WarningFilled } from '@element-plus/icons-vue'
import { getCache } from '@/api/monitor/cache'
// 性能优化：echarts 按需导入（统一从 @/utils/echarts 引入，所有页面共享同一份注册）
import { type ECharts, type EChartsOption } from '@/utils/echarts'
import { useChart } from '@/composables/useChart'
import useSettingsStore from '@/store/modules/settings'
import modal from '@/plugins/modal'

const { t } = useI18n()
const { getChart, withDark, resize } = useChart()
const settingsStore = useSettingsStore()

// ====== 概览数据 ======
interface CacheData {
  info: Record<string, string>
  dbSize: number
  commandStats: Array<{ name: string; value: string }>
}

const cache = ref<CacheData | null>(null)
const loading = ref(false)
const chartError = ref(false)
const commandstats = useTemplateRef<HTMLDivElement>('commandstats')
const usedmemory = useTemplateRef<HTMLDivElement>('usedmemory')
let commandstatsInstance: ECharts | null = null
let usedmemoryInstance: ECharts | null = null

let initResizeTimer: ReturnType<typeof setTimeout> | null = null
// resize 防抖（150ms）与实例复用统一交由 useChart().resize() 处理，
// 与 index / dashboard / audit-dashboard 保持一致，避免各页面重复实现防抖与定时器清理。
const handleResize = () => {
  resize()
}

const handleVisibilityChange = () => {
  if (document.visibilityState === 'visible') {
    resize()
  }
}

function parseMemoryMB(memStr: string): number {
  if (!memStr) return 0
  const match = memStr.match(/^([\d.]+)\s*([BKMGTPE])/i)
  if (!match) return parseFloat(memStr) || 0
  const value = parseFloat(match[1])
  const unit = match[2].toUpperCase()
  const units: Record<string, number> = {
    B: 1 / 1024 / 1024,
    K: 1 / 1024,
    M: 1,
    G: 1024,
    T: 1024 * 1024,
    P: 1024 ** 3,
    E: 1024 ** 4
  }
  return value * (units[unit] || 1)
}

/** 渲染缓存图表（从已有数据，不请求接口），主题切换时复用 */
async function renderCharts(data: CacheData): Promise<void> {
  await nextTick()
  await new Promise<void>((resolve) => setTimeout(resolve, 0))

  const cmdChart = await getChart(commandstats.value!)
  if (!cmdChart) return
  commandstatsInstance = cmdChart
  cmdChart.setOption(
    withDark(cmdChart, {
      tooltip: {
        trigger: 'item',
        formatter: '{a} <br/>{b} : {c} ({d}%)'
      },
      legend: {
        type: 'scroll',
        orient: 'vertical',
        right: 10,
        top: 20,
        bottom: 20,
        formatter: (name: string) => {
          return name.length > 20 ? name.substring(0, 18) + '...' : name
        }
      },
      series: [
        {
          name: t('cache.info.command'),
          type: 'pie',
          roseType: 'radius',
          radius: [15, 95],
          center: ['35%', '50%'],
          data: data.commandStats,
          animationEasing: 'cubicInOut',
          animationDuration: 1000,
          label: {
            show: false
          },
          emphasis: {
            label: {
              show: true,
              formatter: '{b}\n{c} ({d}%)'
            }
          }
        }
      ]
    } as EChartsOption),
    true
  )

  const usedMB = parseMemoryMB(data.info.used_memory_human)
  const maxMB = parseMemoryMB(data.info.maxmemory_human)
  const gaugeMax = maxMB > 0 ? maxMB : Math.max(usedMB * 2, 1000)
  const memChart = await getChart(usedmemory.value!)
  if (!memChart) return
  usedmemoryInstance = memChart
  memChart.setOption(
    withDark(memChart, {
      tooltip: {
        formatter: '{b} <br/>{a} : ' + data.info.used_memory_human
      },
      series: [
        {
          name: t('cache.info.peak'),
          type: 'gauge',
          min: 0,
          max: gaugeMax,
          progress: {
            show: true,
            width: 18
          },
          axisLine: {
            lineStyle: {
              width: 18
            }
          },
          detail: {
            formatter: data.info.used_memory_human,
            fontSize: 16,
            offsetCenter: [0, '70%']
          },
          data: [
            {
              value: usedMB,
              name: t('cache.info.memoryConsume')
            }
          ]
        }
      ]
    } as EChartsOption),
    true
  )

  // 图表渲染后需稍后触发 resize 以适配容器尺寸（保存 timer ID 在卸载时清理）
  if (initResizeTimer) clearTimeout(initResizeTimer)
  initResizeTimer = setTimeout(() => {
    commandstatsInstance?.resize()
    usedmemoryInstance?.resize()
  }, 100)
}

function getList(): void {
  loading.value = true
  chartError.value = false
  modal.loading(t('cache.tip.loading'))
  getCache()
    .then(async (response) => {
      const data = response.data as CacheData
      cache.value = data
      await renderCharts(data)
    })
    .catch(() => {
      modal.msgError(t('cache.tip.loadFailed'))
      chartError.value = true
    })
    .finally(() => {
      modal.closeLoading()
      loading.value = false
    })
}

// 主题切换时复用最近一次数据重新渲染所有图表（不重新请求接口）
watch(
  () => settingsStore.isDark,
  async () => {
    await nextTick()
    if (cache.value) {
      await renderCharts(cache.value)
    }
  }
)

onMounted(() => {
  window.addEventListener('resize', handleResize)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  getList()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  document.removeEventListener('visibilitychange', handleVisibilityChange)
  commandstatsInstance = null
  usedmemoryInstance = null
  // resize 防抖定时器由 useChart 的 onBeforeUnmount 统一清理
  if (initResizeTimer) {
    clearTimeout(initResizeTimer)
    initResizeTimer = null
  }
})
</script>

<style scoped lang="scss">
.chart-error {
  color: var(--el-color-danger);

  .el-icon {
    font-size: 18px;
  }
}
</style>
