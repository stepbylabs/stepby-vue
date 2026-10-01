<template>
  <div class="app-container">
    <!-- Tab 切换：概览 / 键管理 -->
    <el-tabs v-model="activeTab" class="cache-tabs">
      <el-tab-pane :label="t('cache.title')" name="overview">
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
      </el-tab-pane>

      <el-tab-pane :label="t('cache.list.title')" name="keys">
        <el-row :gutter="10">
          <el-col :xs="24" :sm="24" :md="8">
            <el-card class="h-[calc(100vh-180px)]">
              <template #header>
                <Collection class="align-middle w-[1em] h-[1em]"/>
                <span class="align-middle">{{ t('cache.list.title') }}</span>
                <el-button
                  v-hasPermi="['monitor:cache:list']"
                  class="ml-auto py-[3px]"
                  link
                  type="primary"
                  icon="Refresh"
                  :aria-label="t('common.refresh')"
                  @click="refreshCacheNames()" ></el-button>
              </template>
              <el-table
                v-loading="listLoading"
                :data="cacheNames"
                :height="listTableHeight"
                highlight-current-row
                @row-click="getCacheKeys"
                class="w-ful" >
                <el-table-column :label="t('cache.list.column.id')" width="60" type="index"></el-table-column>
                <el-table-column
                  :label="t('cache.list.column.name')"
                  align="center"
                  prop="cacheName"
                  show-overflow-tooltip
                  :formatter="nameFormatte" ></el-table-column>
                <el-table-column
                  :label="t('cache.list.column.remark')"
                  align="center"
                  prop="remark"
                  show-overflow-tooltip
                />
                <el-table-column
                  :label="t('cache.list.column.operation')"
                  width="60"
                  align="center"
                  class-name="small-padding fixed-widt" >
                  <template #default="scope">
                    <el-button
                      v-hasPermi="['monitor:cache:clearName']"
                      link
                      type="primary"
                      icon="Delete"
                      :aria-label="t('common.delete')"
                      @click.stop="handleClearCacheName(scope.row)" ></el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <el-empty :description="t('common.empty')" />
                </template>
              </el-table>
            </el-card>
          </el-col>

          <el-col :xs="24" :sm="24" :md="8">
            <el-card class="h-[calc(100vh-180px)]">
              <template #header>
                <Key class="align-middle w-[1em] h-[1em]"/>
                <span class="align-middle">{{ t('cache.list.keyListTitle') }}</span>
                <Transition name="fade">
                  <el-button
                    v-if="nowCacheName"
                    v-hasPermi="['monitor:cache:list']"
                    class="ml-auto py-[3px]"
                    link
                    type="primary"
                    icon="Refresh"
                    :aria-label="t('common.refresh')"
                    @click="refreshCacheKeys()" ></el-button>
                </Transition>
              </template>
              <el-table
                v-loading="subLoading"
                :data="cacheKeys"
                :height="listTableHeight"
                highlight-current-row
                @row-click="handleCacheValue"
                class="w-ful" >
                <el-table-column :label="t('cache.list.keyColumn.id')" width="60" type="index"></el-table-column>
                <el-table-column
                  :label="t('cache.list.keyColumn.key')"
                  align="center"
                  show-overflow-tooltip
                  :formatter="keyFormatte" ></el-table-column>
                <el-table-column
                  :label="t('cache.list.keyColumn.operation')"
                  width="60"
                  align="center"
                  class-name="small-padding fixed-widt" >
                  <template #default="scope">
                    <el-button
                      v-hasPermi="['monitor:cache:clearKey']"
                      link
                      type="primary"
                      icon="Delete"
                      :aria-label="t('common.delete')"
                      @click.stop="handleClearCacheKey(scope.row)" ></el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <el-empty :description="nowCacheName ? t('common.empty') : t('cache.list.tip.selectCacheFirst')" />
                </template>
              </el-table>
            </el-card>
          </el-col>

          <el-col :xs="24" :sm="24" :md="8">
            <el-card :bordered="false" class="h-[calc(100vh-180px)]">
              <template #header>
                <Document class="align-middle w-[1em] h-[1em]"/>
                <span class="align-middle">{{ t('cache.list.contentTitle') }}</span>
              </template>
              <Transition mode="out-in" name="fade">
                <el-form v-if="cacheForm.cacheKey" key="form" :model="cacheForm">
                  <el-row :gutter="32">
                    <el-col :offset="1" :span="22">
                      <el-form-item :label="t('cache.list.form.name')" prop="cacheName">
                        <el-input v-model="cacheForm.cacheName" :readOnly="true" :maxlength="100" />
                      </el-form-item>
                    </el-col>
                    <el-col :offset="1" :span="22">
                      <el-form-item :label="t('cache.list.form.key')" prop="cacheKey">
                        <el-input v-model="cacheForm.cacheKey" :readOnly="true" :maxlength="100" />
                      </el-form-item>
                    </el-col>
                    <el-col :offset="1" :span="22">
                      <el-form-item :label="t('cache.list.form.content')" prop="cacheValue">
                        <el-input
                          v-model="cacheForm.cacheValue"
                          type="textarea"
                          :rows="8"
                          :readOnly="true"
                          :maxlength="500"
                          show-word-limit
                        />
                      </el-form-item>
                    </el-col>
                  </el-row>
                </el-form>
                <el-empty v-else key="empty" :description="t('cache.list.tip.selectKeyFirst')" :image-size="80" />
              </Transition>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>

      <el-tab-pane :label="t('cache.hot.title')" name="stats">
        <el-row :gutter="10">
          <el-col :xs="24" :sm="24" :md="12" class="card-box">
            <el-card>
              <template #header>
                <Histogram class="align-middle w-[1em] h-[1em]"/>
                <span class="align-middle">{{ t('cache.prefix.title') }}</span>
                <el-button
                  v-hasPermi="['monitor:cache:list']"
                  class="ml-auto py-[3px]"
                  link
                  type="primary"
                  icon="Refresh"
                  :aria-label="t('cache.prefix.refresh')"
                  @click="loadStats()" ></el-button>
              </template>
              <el-table v-loading="prefixLoading" :data="prefixStats" :height="statsTableHeight" class="w-full">
                <el-table-column
                  :label="t('cache.prefix.column.cacheName')"
                  align="center"
                  prop="cacheName"
                  show-overflow-tooltip
                />
                <el-table-column
                  :label="t('cache.prefix.column.keyCount')"
                  align="center"
                  prop="keyCount"
                  width="110"
                />
                <el-table-column :label="t('cache.prefix.column.memory')" align="center" width="140">
                  <template #default="scope">
                    <span :class="{ 'memory-large': isLargeMemory(scope.row.memoryBytes) }">
                      <el-icon v-if="isLargeMemory(scope.row.memoryBytes)"><WarningFilled /></el-icon>
                      {{ formatBytes(scope.row.memoryBytes) }}
                    </span>
                  </template>
                </el-table-column>
                <template #empty>
                  <el-empty :description="t('cache.prefix.empty')" />
                </template>
              </el-table>
            </el-card>
          </el-col>

          <el-col :xs="24" :sm="24" :md="12" class="card-box">
            <el-card>
              <template #header>
                <Warning class="align-middle w-[1em] h-[1em]"/>
                <span class="align-middle">{{ t('cache.hot.title') }}</span>
                <el-button
                  v-hasPermi="['monitor:cache:list']"
                  class="ml-auto py-[3px]"
                  link
                  type="primary"
                  icon="Refresh"
                  :aria-label="t('cache.hot.refresh')"
                  @click="loadStats()" ></el-button>
              </template>
              <el-table v-loading="hotLoading" :data="hotKeys" :height="statsTableHeight" class="w-full">
                <el-table-column :label="t('cache.hot.column.key')" align="center" prop="key" show-overflow-tooltip />
                <el-table-column :label="t('cache.hot.column.type')" align="center" prop="keyType" width="90" />
                <el-table-column :label="t('cache.hot.column.memory')" align="center" width="120">
                  <template #default="scope">{{ formatBytes(scope.row.memoryBytes) }}</template>
                </el-table-column>
                <el-table-column :label="t('cache.hot.column.hotspot')" align="center" width="90">
                  <template #default="scope">
                    <el-tag v-if="scope.row.memoryBytes > HOT_KEY_THRESHOLD" type="danger" size="small">
                      {{ t('cache.hot.hotspot') }}
                    </el-tag>
                    <span v-else>{{ t('common.normal') }}</span>
                  </template>
                </el-table-column>
                <el-table-column
                  :label="t('cache.list.column.operation')"
                  width="60"
                  align="center"
                  class-name="small-padding fixed-widt" >
                  <template #default="scope">
                    <el-button
                      v-hasPermi="['monitor:cache:clearKey']"
                      link
                      type="primary"
                      icon="Delete"
                      :aria-label="t('common.delete')"
                      @click="handleClearHotKey(scope.row)" ></el-button>
                  </template>
                </el-table-column>
                <template #empty>
                  <el-empty :description="t('common.empty')" />
                </template>
              </el-table>
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts" name="Cache">
import {
  Monitor,
  PieChart,
  Odometer,
  Collection,
  Key,
  Document,
  WarningFilled,
  Histogram,
  Warning
} from '@element-plus/icons-vue'
import {
  getCache,
  listCacheName,
  listCacheKey,
  getCacheValue,
  clearCacheName,
  clearCacheKey,
  getHotKeys,
  getPrefixStats
} from '@/api/monitor/cache'
import type { SysCache, HotKey, CachePrefixStat } from '@/types/api/monitor/cache'
// 性能优化：echarts 按需导入（统一从 @/utils/echarts 引入，所有页面共享同一份注册）
import { type ECharts, type EChartsOption } from '@/utils/echarts'
import { useChart } from '@/composables/useChart'
import useSettingsStore from '@/store/modules/settings'
import modal from '@/plugins/modal'

const { t } = useI18n()
const { getChart, withDark, resize } = useChart()
const settingsStore = useSettingsStore()

// ====== Tab 切换 ======
const activeTab = ref<'overview' | 'keys' | 'stats'>('overview')

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

// ====== 键管理数据 ======
interface CacheName {
  cacheName: string
  [key: string]: unknown
}

interface CacheForm {
  cacheName?: string
  cacheKey?: string
  cacheValue?: string
}

const cacheNames = shallowRef<CacheName[]>([])
const cacheKeys = shallowRef<string[]>([])
const cacheForm = ref<CacheForm>({})
const listLoading = ref<boolean>(false)
const subLoading = ref<boolean>(false)
const nowCacheName = ref<string>('')
const listTableHeight = ref<number>(window.innerHeight - 260)

function handleListResize(): void {
  listTableHeight.value = window.innerHeight - 260
  statsTableHeight.value = window.innerHeight - 300
}

// ====== 统计 / 热 Key 数据 ======
// 热 Key 判定阈值（>1MB 标「热点」）
const HOT_KEY_THRESHOLD = 1024 * 1024
// 前缀「大内存」红色高亮阈值（>5MB）
const PREFIX_LARGE_THRESHOLD = 5 * 1024 * 1024
const statsTableHeight = ref<number>(window.innerHeight - 300)
const prefixStats = shallowRef<CachePrefixStat[]>([])
const hotKeys = shallowRef<HotKey[]>([])
const prefixLoading = ref(false)
const hotLoading = ref(false)
let initStats = false

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = bytes
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(2)} ${units[i]}`
}

function isLargeMemory(bytes: number): boolean {
  return bytes > PREFIX_LARGE_THRESHOLD
}

function loadStats(): void {
  initStats = true
  prefixLoading.value = true
  hotLoading.value = true
  getPrefixStats()
    .then((response) => {
      prefixStats.value = response.data!
    })
    .catch(() => {})
    .finally(() => {
      prefixLoading.value = false
    })
  getHotKeys()
    .then((response) => {
      hotKeys.value = response.data!
    })
    .catch(() => {})
    .finally(() => {
      hotLoading.value = false
    })
}

// 清理热 Key：业务缓存，二次确认后调用 clearCacheKey
function handleClearHotKey(row: HotKey): void {
  modal
    .confirm(t('cache.hot.tip.confirmClearKey', { key: row.key }))
    .then(() => {
      return clearCacheKey(row.key)
    })
    .then(() => {
      modal.msgSuccess(t('cache.hot.tip.clearKeySuccess', { key: row.key }))
      // 清理后同步刷新热 Key 列表与统计
      getHotKeys()
        .then((response) => {
          hotKeys.value = response.data!
        })
        .catch(() => {})
      getPrefixStats()
        .then((response) => {
          prefixStats.value = response.data!
        })
        .catch(() => {})
    })
    .catch(() => {})
}

// 切换到键管理 Tab 时首次加载
watch(activeTab, (val: 'overview' | 'keys' | 'stats') => {
  if (val === 'keys' && cacheNames.value.length === 0 && !listLoading.value) {
    getCacheNames()
  }
  if (val === 'stats' && !initStats) {
    loadStats()
  }
})

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

function getCacheNames(): void {
  listLoading.value = true
  listCacheName()
    .then((response) => {
      cacheNames.value = response.data!
    })
    .catch(() => {})
    .finally(() => {
      listLoading.value = false
    })
}

function refreshCacheNames(): void {
  getCacheNames()
  modal.msgSuccess(t('cache.list.tip.refreshSuccess'))
}

function handleClearCacheName(row: SysCache): void {
  modal
    .confirm(t('cache.list.tip.confirmClearName', { name: row.cacheName }))
    .then(() => {
      return clearCacheName(row.cacheName as string)
    })
    .then(() => {
      modal.msgSuccess(t('cache.list.tip.clearNameSuccess', { name: row.cacheName }))
      getCacheKeys()
    })
    .catch(() => {})
}

function getCacheKeys(row?: SysCache): void {
  const cacheName = row !== undefined ? row.cacheName : nowCacheName.value
  if (cacheName === '') {
    return
  }
  subLoading.value = true
  listCacheKey(cacheName)
    .then((response) => {
      cacheKeys.value = response.data!
      nowCacheName.value = cacheName
    })
    .catch(() => {})
    .finally(() => {
      subLoading.value = false
    })
}

function refreshCacheKeys(): void {
  getCacheKeys()
  modal.msgSuccess(t('cache.list.tip.refreshKeySuccess'))
}

function handleClearCacheKey(cacheKey: string): void {
  modal
    .confirm(t('cache.list.tip.confirmClearKey', { key: cacheKey }))
    .then(() => {
      return clearCacheKey(cacheKey)
    })
    .then(() => {
      modal.msgSuccess(t('cache.list.tip.clearKeySuccess', { key: cacheKey }))
      getCacheKeys()
    })
    .catch(() => {})
}

function nameFormatter(row: SysCache): string {
  if (!row?.cacheName) return ''
  return row.cacheName.replace(':', '')
}

function keyFormatter(cacheKey: string): string {
  // 使用正则 /g 全局替换，避免 cacheName 在 key 中多次出现时只替换首个
  return cacheKey.replace(new RegExp(nowCacheName.value, 'g'), '')
}

function handleCacheValue(cacheKey: string): void {
  getCacheValue(nowCacheName.value, cacheKey)
    .then((response) => {
      cacheForm.value = response.data!
    })
    .catch(() => {})
}

onMounted(() => {
  window.addEventListener('resize', handleResize)
  window.addEventListener('resize', handleListResize)
  document.addEventListener('visibilitychange', handleVisibilityChange)
  getList()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', handleResize)
  window.removeEventListener('resize', handleListResize)
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
.cache-tabs {
  :deep(.el-tabs__content) {
    padding-top: 10px;
    transition: opacity 0.2s ease;
  }
}

.chart-error {
  color: var(--el-color-danger);

  .el-icon {
    font-size: 18px;
  }
}

.memory-large {
  color: var(--el-color-danger);
  font-weight: 600;

  .el-icon {
    margin-right: 4px;
    vertical-align: -2px;
  }
}
</style>
