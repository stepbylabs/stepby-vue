<template>
  <div class="app-container">
    <!-- 顶部统计卡片：慢请求 + 错误 + Redis -->
    <el-alert
      v-if="statsErrorBar"
      class="observability-error-bar mb-2"
      type="error"
      :closable="false"
      show-icon
      :title="t('common.loadFailed')"
    >
      <el-button link type="primary" @click="loadStats()">{{ t('common.retry') }}</el-button>
    </el-alert>
    <el-row :gutter="10" class="mb8" v-loading="statsLoading" :element-loading-text="t('observability.loading')">
      <el-col :xs="12" :sm="8" :md="4" v-for="card in statCards" :key="card.label" class="stat-col">
        <el-card shadow="hover" class="stat-card">
          <div class="stat-label">{{ card.label }}</div>
          <div class="stat-value" :class="card.tone">{{ card.value }}</div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 共享态存储档位提示：local 档无 Redis，上方 Redis 专属指标显示「—」（服务端下发 storeKind 判定） -->
    <el-alert
      v-if="redis && !isRedisStore"
      :title="t('observability.storeKind.localHint')"
      type="info"
      :closable="false"
      show-icon
      class="mb8"
    />

    <el-tabs v-model="activeTab" class="observability-tabs">
      <!-- ===== 慢请求 / 慢 SQL ===== -->
      <el-tab-pane :label="t('observability.tab.slow')" name="slow">
        <el-row :gutter="10" class="mb8">
          <el-col :span="24">
            <el-button type="primary" plain icon="Refresh" @click="handleRefresh">
              {{ t('observability.refresh') }}
            </el-button>
            <el-button
              type="danger"
              plain
              icon="Delete"
              v-hasPermi="['monitor:slowSql:remove']"
              :loading="slowClearing"
              @click="handleClearSlow"
            >
              {{ t('observability.slow.clear') }}
            </el-button>
          </el-col>
        </el-row>

        <el-alert
          v-if="slowListErrorBar"
          class="observability-error-bar mb-2"
          type="error"
          :closable="false"
          show-icon
          :title="t('common.loadFailed')"
        >
          <el-button link type="primary" @click="getSlowList()">{{ t('common.retry') }}</el-button>
        </el-alert>
        <el-table v-loading="slowLoading" :data="slowList" class="mb8">
          <el-table-column :label="t('observability.slow.column.method')" align="center" prop="method" width="100">
            <template #default="scope">
              <el-tag :type="methodTagType(scope.row.method)" size="small">{{ scope.row.method }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('observability.slow.column.path')"
            align="center"
            prop="path"
            show-overflow-tooltip
          />
          <el-table-column :label="t('observability.slow.column.status')" align="center" prop="status" width="90" />
          <el-table-column :label="t('observability.slow.column.duration')" align="center" width="110">
            <template #default="scope">
              <span :class="{ 'text-danger': scope.row.durationMs >= 1000 }">
                {{ scope.row.durationMs }}{{ t('observability.slow.ms') }}
              </span>
            </template>
          </el-table-column>
          <el-table-column :label="t('observability.slow.column.at')" align="center" prop="at" width="210" />
          <template #empty>
            <list-empty :load-error="slowListError" @retry="getSlowList" />
          </template>
        </el-table>

        <pagination
          v-show="slowTotal > 0"
          :total="slowTotal"
          v-model:page="slowQuery.pageNum"
          v-model:limit="slowQuery.pageSize"
          @pagination="getSlowList"
        />

        <!-- Top 慢接口 -->
        <el-card shadow="never" class="mt8">
          <template #header>
            {{ t('observability.slow.topTitle') }}
          </template>
          <el-alert
            v-if="slowStatsErrorBar"
            class="observability-error-bar mb-2"
            type="error"
            :closable="false"
            show-icon
            :title="t('common.loadFailed')"
          >
            <el-button link type="primary" @click="getSlowStats()">{{ t('common.retry') }}</el-button>
          </el-alert>
          <el-table v-loading="slowStatsLoading" :data="slowStats?.topPaths ?? []">
            <el-table-column
              :label="t('observability.slow.column.path')"
              align="center"
              prop="path"
              show-overflow-tooltip
            />
            <el-table-column :label="t('observability.slow.column.count')" align="center" prop="count" width="110" />
            <el-table-column :label="t('observability.slow.column.avg')" align="center" width="130">
              <template #default="scope">{{ scope.row.avgMs.toFixed(1) }}{{ t('observability.slow.ms') }}</template>
            </el-table-column>
            <el-table-column :label="t('observability.slow.column.max')" align="center" width="130">
              <template #default="scope">{{ scope.row.maxMs }}{{ t('observability.slow.ms') }}</template>
            </el-table-column>
            <template #empty>
              <list-empty :load-error="slowStatsError" @retry="getSlowStats" />
            </template>
          </el-table>
        </el-card>
      </el-tab-pane>

      <!-- ===== 错误聚合 ===== -->
      <el-tab-pane :label="t('observability.tab.error')" name="error">
        <el-form :model="errorQuery" :inline="true" class="mb8" @submit.prevent>
          <el-form-item :label="t('observability.error.searchModule')">
            <el-input
              v-model="errorQuery.module"
              :placeholder="t('observability.error.phModule')"
              clearable
              class="w-[220px]"
              @keyup.enter="handleErrorQuery"
              :aria-label="t('observability.error.phModule')"
            />
          </el-form-item>
          <el-form-item :label="t('observability.error.level')">
            <el-select
              :aria-label="t('observability.error.level')"
              v-model="errorQuery.level"
              :placeholder="t('observability.error.phLevel')"
              clearable
              class="w-[160px]"
            >
              <el-option label="ERROR" value="ERROR" />
            </el-select>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleErrorQuery">
              {{ t('observability.search') }}
            </el-button>
            <el-button icon="Refresh" @click="handleErrorReset">{{ t('observability.reset') }}</el-button>
          </el-form-item>
          <el-form-item class="ml-auto">
            <el-button
              type="danger"
              plain
              icon="Delete"
              v-hasPermi="['monitor:slowSql:remove']"
              :loading="errorClearing"
              @click="handleClearError"
            >
              {{ t('observability.error.clear') }}
            </el-button>
          </el-form-item>
        </el-form>

        <el-alert
          v-if="errorListErrorBar"
          class="observability-error-bar mb-2"
          type="error"
          :closable="false"
          show-icon
          :title="t('common.loadFailed')"
        >
          <el-button link type="primary" @click="getErrorList()">{{ t('common.retry') }}</el-button>
        </el-alert>
        <el-table v-loading="errorLoading" :data="errorList" class="mb8">
          <el-table-column :label="t('observability.error.column.at')" align="center" prop="at" width="210" />
          <el-table-column :label="t('observability.error.column.level')" align="center" prop="level" width="100">
            <template #default="scope">
              <el-tag type="danger" size="small">{{ scope.row.level }}</el-tag>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('observability.error.column.module')"
            align="center"
            prop="module"
            width="220"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('observability.error.column.requestId')"
            align="center"
            prop="requestId"
            width="200"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('observability.error.column.path')"
            align="center"
            prop="path"
            width="200"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('observability.error.column.message')"
            align="center"
            prop="message"
            show-overflow-tooltip
          />
          <template #empty>
            <list-empty :load-error="errorListError" @retry="getErrorList" />
          </template>
        </el-table>

        <pagination
          v-show="errorTotal > 0"
          :total="errorTotal"
          v-model:page="errorQuery.pageNum"
          v-model:limit="errorQuery.pageSize"
          @pagination="getErrorList"
        />

        <!-- 聚合汇总 -->
        <el-alert
          v-if="errorStatsErrorBar"
          class="observability-error-bar mb-2"
          type="error"
          :closable="false"
          show-icon
          :title="t('common.loadFailed')"
        >
          <el-button link type="primary" @click="getErrorStats()">{{ t('common.retry') }}</el-button>
        </el-alert>
        <el-row :gutter="10" class="mt8" v-loading="errorStatsLoading">
          <el-col :xs="24" :md="12">
            <el-card shadow="never" class="summary-card">
              <template #header>{{ t('observability.error.byModuleTitle') }}</template>
              <div v-for="bucket in errorStats?.byModule ?? []" :key="bucket.name" class="progress-row">
                <span class="progress-name" :title="bucket.name">{{ bucket.name }}</span>
                <el-progress :percentage="bucketPercent(bucket.count)" :stroke-width="10" class="progress-bar">
                  <span class="progress-count">{{ bucket.count }}</span>
                </el-progress>
              </div>
              <list-empty v-if="!errorStats?.byModule?.length" :load-error="errorStatsError" @retry="getErrorStats" />
            </el-card>
          </el-col>
          <el-col :xs="24" :md="12">
            <el-card shadow="never" class="summary-card">
              <template #header>{{ t('observability.error.byLevelTitle') }}</template>
              <div v-for="bucket in errorStats?.byLevel ?? []" :key="bucket.name" class="progress-row">
                <span class="progress-name">{{ bucket.name }}</span>
                <el-progress :percentage="bucketPercent(bucket.count)" :stroke-width="10" class="progress-bar">
                  <span class="progress-count">{{ bucket.count }}</span>
                </el-progress>
              </div>
              <list-empty v-if="!errorStats?.byLevel?.length" :load-error="errorStatsError" @retry="getErrorStats" />
            </el-card>
          </el-col>
        </el-row>
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts" name="Observability">
import { computed, onMounted, reactive, ref } from 'vue'
import modal from '@/plugins/modal'
import {
  listSlowSql,
  slowSqlStats,
  clearSlowSql,
  listErrorLog,
  errorLogStats,
  clearErrorLog,
  redisStats,
  type ErrorEntry,
  type ErrorLogQueryParams,
  type ErrorStats,
  type RedisStats,
  type SlowQueryParams,
  type SlowRequestRecord,
  type SlowStats
} from '@/api/monitor/observability'

const { t } = useI18n()

// ====== Tab 切换 ======
const activeTab = ref<'slow' | 'error'>('slow')

// ====== 慢请求 ======
const slowList = ref<SlowRequestRecord[]>([])
const slowTotal = ref(0)
const slowLoading = ref(false)
const slowClearing = ref(false)
const slowListError = ref(false)
const slowStats = ref<SlowStats | null>(null)
const slowStatsLoading = ref(false)
const slowStatsError = ref(false)
const slowQuery = reactive<SlowQueryParams>({ pageNum: 1, pageSize: 10 })

function getSlowList(): Promise<boolean> {
  slowLoading.value = true
  return listSlowSql({ ...slowQuery })
    .then((response) => {
      slowList.value = response.rows
      slowTotal.value = response.total
      slowListError.value = false
      return true
    })
    .catch(() => {
      // 保留旧数据；空列表由 ListEmpty 显示「加载失败 + 重试」，非空由顶部错误条说明
      slowListError.value = true
      return false
    })
    .finally(() => {
      slowLoading.value = false
    })
}

function getSlowStats(): Promise<boolean> {
  slowStatsLoading.value = true
  return slowSqlStats()
    .then((response) => {
      slowStats.value = response.data
      slowStatsError.value = false
      return true
    })
    .catch(() => {
      slowStatsError.value = true
      return false
    })
    .finally(() => {
      slowStatsLoading.value = false
    })
}

function methodTagType(method: string): 'success' | 'primary' | 'warning' | 'danger' | 'info' {
  switch (method.toUpperCase()) {
    case 'GET':
      return 'success'
    case 'POST':
      return 'primary'
    case 'PUT':
    case 'PATCH':
      return 'warning'
    case 'DELETE':
      return 'danger'
    default:
      return 'info'
  }
}

async function handleClearSlow(): Promise<void> {
  try {
    await modal.confirm(t('observability.slow.confirmClear'))
  } catch {
    return // 用户取消
  }
  slowClearing.value = true
  try {
    await clearSlowSql()
    // 清空成功必须等取数也有结局：刷新失败时页面留旧数据 + 错误条，不得再弹“清空成功”
    const results = await Promise.all([getSlowList(), getSlowStats()])
    if (results.every(Boolean)) {
      modal.msgSuccess(t('observability.clearSuccess'))
    }
  } catch {
    // 清空失败：错误提示由请求拦截器统一负责；这里不弹“清空成功”
  } finally {
    slowClearing.value = false
  }
}

// ====== 错误聚合 ======
const errorList = ref<ErrorEntry[]>([])
const errorTotal = ref(0)
const errorLoading = ref(false)
const errorClearing = ref(false)
const errorListError = ref(false)
const errorStats = ref<ErrorStats | null>(null)
const errorStatsLoading = ref(false)
const errorStatsError = ref(false)
const errorQuery = reactive<ErrorLogQueryParams>({ module: undefined, level: undefined, pageNum: 1, pageSize: 10 })

function getErrorList(): Promise<boolean> {
  errorLoading.value = true
  return listErrorLog({ ...errorQuery })
    .then((response) => {
      errorList.value = response.rows
      errorTotal.value = response.total
      errorListError.value = false
      return true
    })
    .catch(() => {
      errorListError.value = true
      return false
    })
    .finally(() => {
      errorLoading.value = false
    })
}

function getErrorStats(): Promise<boolean> {
  errorStatsLoading.value = true
  return errorLogStats()
    .then((response) => {
      errorStats.value = response.data
      errorStatsError.value = false
      return true
    })
    .catch(() => {
      errorStatsError.value = true
      return false
    })
    .finally(() => {
      errorStatsLoading.value = false
    })
}

function handleErrorQuery(): void {
  errorQuery.pageNum = 1
  getErrorList()
}

function handleErrorReset(): void {
  errorQuery.module = undefined
  errorQuery.level = undefined
  errorQuery.pageNum = 1
  getErrorList()
}

async function handleClearError(): Promise<void> {
  try {
    await modal.confirm(t('observability.error.confirmClear'))
  } catch {
    return // 用户取消
  }
  errorClearing.value = true
  try {
    await clearErrorLog()
    const results = await Promise.all([getErrorList(), getErrorStats()])
    if (results.every(Boolean)) {
      modal.msgSuccess(t('observability.clearSuccess'))
    }
  } catch {
    // 清空失败：错误提示由请求拦截器统一负责；这里不弹“清空成功”
  } finally {
    errorClearing.value = false
  }
}

/** 聚合桶百分比（相对该列表最大值），最小值给 2 以便空桶可见 */
function bucketPercent(count: number): number {
  const buckets = [...(errorStats.value?.byModule ?? []), ...(errorStats.value?.byLevel ?? [])]
  const max = Math.max(...buckets.map((b) => b.count), 0)
  if (max <= 0) return 0
  return Math.max(Math.round((count / max) * 100), 2)
}

// ====== Redis 指标 ======
const redis = ref<RedisStats | null>(null)
const redisLoading = ref(false)
const redisError = ref(false)

function getRedisStats(): Promise<boolean> {
  redisLoading.value = true
  return redisStats()
    .then((response) => {
      redis.value = response.data
      redisError.value = false
      return true
    })
    .catch(() => {
      redisError.value = true
      return false
    })
    .finally(() => {
      redisLoading.value = false
    })
}

/** 格式化字节数为可读容量 */
function formatBytes(bytes: string): string {
  const n = Number(bytes) || 0
  if (n <= 0) return '0 B'
  const units = ['B', 'KB', 'MB', 'GB', 'TB']
  let v = n
  let i = 0
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024
    i++
  }
  return `${v.toFixed(1)} ${units[i]}`
}

/** 格式化运行秒数为可读时长 */
function formatUptime(seconds: string): string {
  const s = Number(seconds) || 0
  if (s <= 0) return '0s'
  const d = Math.floor(s / 86400)
  const h = Math.floor((s % 86400) / 3600)
  const m = Math.floor((s % 3600) / 60)
  if (d > 0) return `${d}d ${h}h`
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

/** 键命中率（%） */
const hitRate = computed(() => {
  const hits = Number(redis.value?.keyspaceHits) || 0
  const misses = Number(redis.value?.keyspaceMisses) || 0
  const total = hits + misses
  if (total <= 0) return '0%'
  return `${((hits / total) * 100).toFixed(1)}%`
})

/** 共享态存储档位是否为 redis（服务端单点判定下发 storeKind；local 档无 Redis 指标） */
const isRedisStore = computed(() => redis.value?.storeKind === 'redis')

const statCards = computed(() => [
  { label: t('observability.stat.slowCount'), value: String(slowStats.value?.count ?? 0), tone: '' },
  {
    label: t('observability.stat.avgMs'),
    value: `${(slowStats.value?.avgMs ?? 0).toFixed(1)}${t('observability.slow.ms')}`,
    tone: ''
  },
  {
    label: t('observability.stat.maxMs'),
    value: `${slowStats.value?.maxMs ?? 0}${t('observability.slow.ms')}`,
    tone: ''
  },
  { label: t('observability.stat.over1s'), value: String(slowStats.value?.over1s ?? 0), tone: 'danger' },
  {
    label: t('observability.stat.thresholdMs'),
    value: `${slowStats.value?.thresholdMs ?? 0}${t('observability.slow.ms')}`,
    tone: ''
  },
  { label: t('observability.stat.errorTotal'), value: String(errorStats.value?.total ?? 0), tone: 'danger' },
  // Redis 专属指标：local 档（无 Redis）显示「—」而非误导性的 0s/0 B/0
  {
    label: t('observability.stat.uptime'),
    value: isRedisStore.value ? formatUptime(redis.value?.uptimeSeconds ?? '') : '—',
    tone: ''
  },
  {
    label: t('observability.stat.usedMemory'),
    value: isRedisStore.value ? formatBytes(redis.value?.usedMemoryBytes ?? '') : '—',
    tone: ''
  },
  {
    label: t('observability.stat.connectedClients'),
    value: isRedisStore.value ? redis.value?.connectedClients || '0' : '—',
    tone: ''
  },
  { label: t('observability.stat.hitRate'), value: isRedisStore.value ? hitRate.value : '—', tone: '' }
])

// ====== 失败态（保留旧数据 + 持续可见的错误条；空列表走 ListEmpty 的重试） ======
const statsErrorBar = computed(() => slowStatsError.value || errorStatsError.value || redisError.value)
const statsLoading = computed(() => slowStatsLoading.value || errorStatsLoading.value || redisLoading.value)
const slowStatsErrorBar = computed(() => slowStatsError.value && (slowStats.value?.topPaths?.length ?? 0) > 0)
const errorStatsErrorBar = computed(
  () =>
    errorStatsError.value &&
    ((errorStats.value?.byModule?.length ?? 0) > 0 || (errorStats.value?.byLevel?.length ?? 0) > 0)
)
const slowListErrorBar = computed(() => slowListError.value && slowList.value.length > 0)
const errorListErrorBar = computed(() => errorListError.value && errorList.value.length > 0)

// ====== 刷新 ======
function loadAll(): Promise<boolean[]> {
  return Promise.all([getSlowList(), getSlowStats(), getErrorList(), getErrorStats(), getRedisStats()])
}

function loadStats(): Promise<boolean[]> {
  return Promise.all([getSlowStats(), getErrorStats(), getRedisStats()])
}

async function handleRefresh(): Promise<void> {
  // 提示必须跟着请求结局：先弹"刷新成功"再发请求，失败时用户会以为数据已更新
  const results = await loadAll()
  if (results.every(Boolean)) {
    modal.msgSuccess(t('observability.refreshSuccess'))
  }
}

onMounted(() => {
  loadAll()
})
</script>

<style scoped lang="scss">
.stat-card {
  margin-bottom: 8px;

  .stat-label {
    color: var(--el-text-color-secondary);
    font-size: 12px;
    margin-bottom: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .stat-value {
    font-size: 22px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    line-height: 1.2;

    &.danger {
      color: var(--el-color-danger);
    }
  }
}

.text-danger {
  color: var(--el-color-danger);
  font-weight: 600;
}

.progress-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 12px;

  .progress-name {
    flex: 0 0 220px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 13px;
  }

  .progress-bar {
    flex: 1;
  }

  .progress-count {
    font-size: 12px;
    color: var(--el-text-color-secondary);
  }
}

.summary-card {
  margin-bottom: 8px;
}

:deep(.el-progress-bar__outer) {
  display: flex;
  align-items: center;
}

.el-tooltip__popper {
  max-width: 400px;
}
</style>
