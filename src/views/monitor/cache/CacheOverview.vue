<template>
  <!-- Redis 未连接空状态 -->
  <Transition mode="out-in" name="fade">
    <div v-if="!cache?.info" key="empty">
      <!-- 取数失败不等于"Redis 未连接"：从未取到过数据时按失败态显示，并给重试入口 -->
      <el-empty
        :description="chartError ? t('dashboard.chartLoadFail') : t('cache.tip.notConnected')"
        :image-size="120"
      >
        <el-button type="primary" @click="getList">{{ t('common.refresh') }}</el-button>
      </el-empty>
    </div>
    <div v-else key="content">
      <!-- 成功过再失败：旧信息继续展示，横幅写明"几点的数据"（b109） -->
      <el-alert v-if="chartError" class="mb-2" type="warning" :closable="false" show-icon :title="staleHint">
        <el-button link type="primary" @click="getList">{{ t('common.retry') }}</el-button>
      </el-alert>
      <el-row :gutter="10">
        <el-col :span="24" class="card-box">
          <el-card>
            <template #header>
              <Monitor class="align-middle w-[1em] h-[1em]" />
              <span class="align-middle">{{ t('cache.info.basicInfo') }}</span>
            </template>
            <el-descriptions :column="4" border size="small">
              <el-descriptions-item :label="t('cache.info.redisVersion')">
                {{ dash(cache.info.redis_version) }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.runMode')">
                {{ runModeLabel(cache.info) }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.port')">{{ dash(cache.info.tcp_port) }}</el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.clients')">
                {{ dash(cache.info.connected_clients) }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.uptimeDays')">
                {{ dash(cache.info.uptime_in_day) }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.usedMemory')">
                {{ dash(cache.info.used_memory_human) }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.usedCpu')">
                {{
                  cache.info.used_cpu_user_children
                    ? (parseFloat(cache.info.used_cpu_user_children) || 0).toFixed(2)
                    : '-'
                }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.maxMemory')">
                {{ dash(cache.info.maxmemory_human) }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.aofEnabled')">
                {{ boolLabel(cache.info.aof_enabled) }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.rdbStatus')">
                {{ dash(cache.info.rdb_last_bgsave_status) }}
              </el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.keyCount')">{{ cache.dbSize }}</el-descriptions-item>
              <el-descriptions-item :label="t('cache.info.network')">
                {{
                  cache.info.instantaneous_input_kbps || cache.info.instantaneous_output_kbps
                    ? `${dash(cache.info.instantaneous_input_kbps)}kps/${dash(cache.info.instantaneous_output_kbps)}kps`
                    : '-'
                }}
              </el-descriptions-item>
            </el-descriptions>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="24" :md="12" class="card-box">
          <el-card>
            <template #header>
              <PieChart class="align-middle w-[1em] h-[1em]" />
              <span class="align-middle">{{ t('cache.info.commandStats') }}</span>
            </template>
            <div v-loading="loading" :element-loading-text="t('common.loading')">
              <!-- 有可画数据才挂容器；无数据给 el-empty 说明，不留 420px 空白 -->
              <div v-if="hasCommandStats" ref="commandstats" class="h-[420px] w-full min-w-[300px]" />
              <el-empty v-else :image-size="80" :description="t('common.empty')" />
              <Transition name="fade">
                <div v-if="chartError" class="chart-error flex items-center justify-center gap-2 p-3 text-sm">
                  <el-icon><WarningFilled /></el-icon>
                  <span>{{ chartErrorText }}</span>
                  <el-button text type="primary" @click="getList">{{ t('common.refresh') }}</el-button>
                </div>
              </Transition>
            </div>
          </el-card>
        </el-col>

        <el-col :xs="24" :sm="24" :md="12" class="card-box">
          <el-card>
            <template #header>
              <Odometer class="align-middle w-[1em] h-[1em]" />
              <span class="align-middle">{{ t('cache.info.memoryInfo') }}</span>
            </template>
            <div v-loading="loading" :element-loading-text="t('common.loading')">
              <div v-if="hasMemoryInfo" ref="usedmemory" class="h-[420px] w-full min-w-[300px]" />
              <el-empty v-else :image-size="80" :description="t('common.empty')" />
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
import { formatClockTime } from '@/utils'
// 性能优化：echarts 按需导入（统一从 @/utils/echarts 引入，所有页面共享同一份注册）
import { type ECharts, type EChartsOption } from '@/utils/echarts'
import { useChart } from '@/composables/useChart'
import useSettingsStore from '@/store/modules/settings'
import modal from '@/plugins/modal'

const { t } = useI18n()
const { getChart, withDark, waitForRef, resize } = useChart()
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
/** 最近一次成功取数的时刻（陈旧横幅要说得出"几点的数据"） */
const lastSuccessAt = ref<number | null>(null)
/** 刷新序号：连续点刷新时只让最后一次请求的结局生效 */
let seq = 0
const staleHint = computed(() => t('common.staleDataHintAt', { time: formatClockTime(lastSuccessAt.value) }))
const chartErrorText = computed(() => (lastSuccessAt.value ? staleHint.value : t('dashboard.chartLoadFail')))
const commandstats = useTemplateRef<HTMLDivElement>('commandstats')
const usedmemory = useTemplateRef<HTMLDivElement>('usedmemory')
let commandstatsInstance: ECharts | null = null
let usedmemoryInstance: ECharts | null = null

/**
 * 两张图各自"有没有可画的数据"。
 *
 * 为什么必须显式判：SharedStore `local` 档（无 Redis 的单文件部署，官方推荐档之一）
 * 返回的 `info` 里没有 `used_memory_human`，`commandStats` 为空数组。
 * 此前无脑 init + setOption 的结果是两张 420px 空白卡片——既不是图也没有说明，
 * 用户只能自己猜"页面坏了"。空态必须给可读解释（项目统一标准）。
 */
const hasCommandStats = computed(() => (cache.value?.commandStats ?? []).length > 0)
const hasMemoryInfo = computed(() => !!cache.value?.info?.used_memory_human)

/** 后端字段缺失时显示占位符而不是空白/臆造值（local 档 info 字段集与 Redis 档不同） */
function dash(v: unknown): string {
  const s = v === undefined || v === null ? '' : String(v).trim()
  return s === '' ? '-' : s
}

/** AOF 开关：只有明确的 0/1 才回答"否/是"，未知就未知 */
function boolLabel(v: string | undefined): string {
  if (v === '1') return t('common.yes')
  if (v === '0') return t('common.no')
  return '-'
}

/** 运行模式：Redis 档给单机/集群，其他档位（local 等）原样展示，未知给占位 */
function runModeLabel(info: Record<string, string> | undefined): string {
  const mode = info?.redis_mode
  if (mode === 'standalone') return t('cache.info.standalone')
  if (mode === 'cluster') return t('cache.info.cluster')
  return dash(mode ?? info?.mode)
}

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

/** 命令统计饼图：实例就位后由 renderCharts 调用（主题切换时复用同一份数据重画） */
function paintCommandPie(chart: ECharts, data: CacheData): void {
  chart.setOption(
    withDark(chart, {
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
}

/** 内存用量仪表盘：`info.used_memory_human` 缺失（SharedStore local 档）时不调用 */
function paintMemoryGauge(chart: ECharts, data: CacheData): void {
  const usedMB = parseMemoryMB(data.info.used_memory_human ?? '')
  const maxMB = parseMemoryMB(data.info.maxmemory_human ?? '')
  const gaugeMax = maxMB > 0 ? maxMB : Math.max(usedMB * 2, 1000)
  chart.setOption(
    withDark(chart, {
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
}

/**
 * 渲染缓存图表（从已有数据，不请求接口），主题切换时复用。
 *
 * 两处必须显式处理，否则会出现"卡片永久空白且没有任何提示"（b73 轮 14 实证缺陷）：
 *  1. `<Transition mode="out-in">` 下，空态→内容态的新分支要等旧分支 leave 结束才进 DOM，
 *     单靠一次 `nextTick` 时模板 ref 仍是 null，`getChart(null)` 静默返回 null，
 *     于是两张 420px 卡片谁都没画、`chartError` 也没置位；
 *  2. 没有可画数据的图（local 档 commandStats 为空 / 无 used_memory_human）根本不进 DOM，
 *     由卡片内 el-empty 说明取代——不能空等容器，也不能算成错误。
 * 单张图初始化失败不再 `return`：那会把另一张图一起跳过（一处失败掩盖两处）。
 */
async function renderCharts(data: CacheData): Promise<void> {
  await nextTick()
  if (hasCommandStats.value) {
    const chart = await getChart(await waitForRef(() => commandstats.value ?? null))
    if (chart) {
      commandstatsInstance = chart
      paintCommandPie(chart, data)
    } else {
      chartError.value = true
    }
  }
  if (hasMemoryInfo.value) {
    const chart = await getChart(await waitForRef(() => usedmemory.value ?? null))
    if (chart) {
      usedmemoryInstance = chart
      paintMemoryGauge(chart, data)
    } else {
      chartError.value = true
    }
  }
  // 图表渲染后需稍后触发 resize 以适配容器尺寸（保存 timer ID 在卸载时清理）
  if (initResizeTimer) clearTimeout(initResizeTimer)
  initResizeTimer = setTimeout(() => {
    commandstatsInstance?.resize()
    usedmemoryInstance?.resize()
  }, 100)
}

function getList(): void {
  const my = ++seq
  loading.value = true
  chartError.value = false
  modal.loading(t('cache.tip.loading'))
  getCache()
    .then(async (response) => {
      // 后发先回：旧请求的结局一律丢弃（不覆盖数据、不改错误态与时刻）
      if (my !== seq) return
      const data = response.data as CacheData
      cache.value = data
      lastSuccessAt.value = Date.now()
      await renderCharts(data)
    })
    .catch(() => {
      if (my !== seq) return
      modal.msgError(t('cache.tip.loadFailed'))
      // 成功过 ⇒ 旧信息保留 + 横幅说明时刻；从未成功 ⇒ 空态显示"取数失败"而不是"未连接"
      chartError.value = true
    })
    .finally(() => {
      if (my !== seq) return
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
