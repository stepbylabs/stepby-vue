<template>
  <div class="app-container" v-loading="loading">
    <!-- 整体状态卡片 -->
    <el-row :gutter="20" class="mb-5">
      <el-col v-motion="fadeInUp" :span="24">
        <el-card shadow="hover">
          <template #header>
            <div class="header-flex flex justify-between items-center">
              <span>
                <el-icon><Monitor /></el-icon>
                {{ t('health.title') }}
              </span>
              <el-button type="primary" link icon="Refresh" @click="loadHealth">
                {{ t('health.btn.refresh') }}
              </el-button>
            </div>
          </template>
          <div class="overall-status flex items-center gap-4 p-6 rounded-lg" :class="statusClass">
            <el-icon class="status-icon text-5xl"><component :is="statusIcon" /></el-icon>
            <span class="status-label text-xl font-semibold flex-1">{{ statusText }}</span>
            <el-tag :type="statusTagType" size="large">{{ healthData.status || t('health.loading') }}</el-tag>
            <span class="version text-text-regular">{{ t('health.version') }}{{ healthData.version || '-' }}</span>
            <span class="uptime text-text-regular">{{ t('health.uptime') }}{{ formattedUptime }}</span>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 各依赖状态卡片 -->
    <el-row :gutter="20" class="mb-5">
      <el-col v-motion="staggerChildren(0)" :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="check-card transition-all duration-200 hover:-translate-y-1">
          <div class="check-item flex items-center gap-4">
            <el-icon class="check-icon" :class="healthData.db === 'UP' ? 'up' : 'down'">
              <Coin />
            </el-icon>
            <div class="check-info flex-1">
              <div class="check-name text-sm text-text-secondary">{{ t('health.database') }}</div>
              <div class="check-status font-bold my-1" :class="healthData.db === 'UP' ? 'up' : 'down'">
                {{ healthData.db || t('health.unknown') }}
              </div>
              <div class="check-desc text-xs text-text-secondary">{{ dbDesc }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(1)" :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="check-card transition-all duration-200 hover:-translate-y-1">
          <div class="check-item flex items-center gap-4">
            <el-icon class="check-icon" :class="healthData.redis === 'UP' ? 'up' : 'down'">
              <Lightning />
            </el-icon>
            <div class="check-info flex-1">
              <div class="check-name text-sm text-text-secondary">{{ t('health.redis') }}</div>
              <div class="check-status font-bold my-1" :class="healthData.redis === 'UP' ? 'up' : 'down'">
                {{ healthData.redis || t('health.unknown') }}
              </div>
              <div class="check-desc text-xs text-text-secondary">{{ redisDesc }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(2)" :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="check-card transition-all duration-200 hover:-translate-y-1">
          <div class="check-item flex items-center gap-4">
            <el-icon class="check-icon up"><Cpu /></el-icon>
            <div class="check-info flex-1">
              <div class="check-name text-sm text-text-secondary">{{ t('health.cpuUsage') }}</div>
              <div class="check-status up font-bold my-1">{{ serverData.cpuUsage || '-' }}%</div>
              <div class="check-desc text-xs text-text-secondary">
                {{ t('health.cpuNum') }}{{ serverData.cpuNum || '-' }}
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(3)" :xs="24" :sm="12" :lg="6">
        <el-card shadow="hover" class="check-card transition-all duration-200 hover:-translate-y-1">
          <div class="check-item flex items-center gap-4">
            <el-icon class="check-icon" :class="memStatusClass"><Histogram /></el-icon>
            <div class="check-info flex-1">
              <div class="check-name text-sm text-text-secondary">{{ t('health.memUsage') }}</div>
              <div class="check-status font-bold my-1" :class="memStatusClass">{{ serverData.memUsage || '-' }}%</div>
              <div class="check-desc text-xs text-text-secondary">
                {{ serverData.usedMem || '-' }} / {{ serverData.totalMem || '-' }}
              </div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- CPU 详情 / 内存详情 -->
    <el-row :gutter="20" class="mb-5">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <span>
              <el-icon><Cpu /></el-icon>
              {{ t('health.column.cpu') }}
            </span>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item :label="t('health.column.cpuNum')">
              {{ serverData.cpuNum || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('health.column.cpuUsage')">
              {{ serverData.cpuUsage || '-' }}%
            </el-descriptions-item>
            <el-descriptions-item :label="t('health.column.sysUsage')">
              {{ serverData.cpuSys || '-' }}%
            </el-descriptions-item>
            <el-descriptions-item :label="t('health.column.freeUsage')">
              {{ serverData.cpuFree || '-' }}%
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <span>
              <el-icon><DataLine /></el-icon>
              {{ t('health.memDetail') }}
            </span>
          </template>
          <el-descriptions :column="1" border>
            <el-descriptions-item :label="t('health.column.totalMemory')">
              {{ serverData.totalMem || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('health.column.usedMemory')">
              {{ serverData.usedMem || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('health.column.freeMemory')">
              {{ serverData.freeMem || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('health.column.memoryUsage')">
              <el-progress :percentage="Number(serverData.memUsage || 0)" :color="progressColor" />
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
    </el-row>

    <!-- 运行环境 + 磁盘信息 -->
    <el-row :gutter="20">
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <span>
              <el-icon><Monitor /></el-icon>
              {{ t('health.serverInfo') }}
            </span>
          </template>
          <el-descriptions :column="2" border>
            <el-descriptions-item :label="t('health.column.serverName')">
              {{ sysData.computerName || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('health.column.os')">{{ sysData.osName || '-' }}</el-descriptions-item>
            <el-descriptions-item :label="t('health.column.serverIp')">
              {{ sysData.computerIp || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('health.column.osArch')">{{ sysData.osArch || '-' }}</el-descriptions-item>
            <el-descriptions-item :label="t('health.column.startTime')">
              {{ runtimeData.startTime || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('health.column.runTime')">
              {{ runtimeData.runTime || '-' }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('health.column.projectPath')" :span="2">
              {{ sysData.userDir || '-' }}
            </el-descriptions-item>
          </el-descriptions>
        </el-card>
      </el-col>
      <el-col :xs="24" :lg="12">
        <el-card shadow="hover">
          <template #header>
            <span>
              <el-icon><Coin /></el-icon>
              {{ t('health.diskInfo') }}
            </span>
          </template>
          <el-table :data="diskList" stripe size="small">
            <el-table-column prop="dirName" :label="t('health.column.drivePath')" min-width="120" />
            <el-table-column prop="sysTypeName" :label="t('health.column.fileSystem')" min-width="100" />
            <el-table-column prop="typeName" :label="t('health.column.type')" width="80" />
            <el-table-column prop="total" :label="t('health.column.total')" width="100" />
            <el-table-column prop="used" :label="t('health.column.used')" width="100" />
            <el-table-column prop="free" :label="t('health.column.free')" width="100" />
            <el-table-column :label="t('health.column.usage')" width="180">
              <template #default="{ row }">
                <el-progress :percentage="Number(row.usage)" :color="progressColor" :stroke-width="14" />
              </template>
            </el-table-column>
          </el-table>
        </el-card>
      </el-col>
    </el-row>

    <!-- 自动刷新 -->
    <div class="auto-refresh mt-5 flex items-center gap-5 justify-end">
      <el-switch v-model="autoRefresh" :active-text="t('health.form.autoRefresh')" @change="toggleAutoRefresh" />
      <span v-if="lastUpdate" class="last-update text-text-secondary text-xs">
        {{ t('health.form.lastUpdate') }}{{ lastUpdate }}
      </span>
    </div>
  </div>
</template>

<script setup lang="ts" name="MonitorHealth">
import {
  Monitor,
  Coin,
  Cpu,
  Histogram,
  DataLine,
  CircleCheckFilled,
  CircleCloseFilled,
  WarningFilled
} from '@element-plus/icons-vue'
import request from '@/utils/request'
import { useMotionPresets } from '@/composables/useMotion'
import type { AjaxResult } from '@/types/api/common'

const { t } = useI18n()
const { fadeInUp, staggerChildren } = useMotionPresets()

interface HealthStatus {
  status: string
  version: string
  db: string
  redis: string
}

interface ServerInfo {
  cpuUsage?: string
  cpuNum?: number
  cpuSys?: string
  cpuFree?: string
  memUsage?: string
  totalMem?: string
  usedMem?: string
  freeMem?: string
}

interface SysInfo {
  computerName?: string
  osName?: string
  computerIp?: string
  osArch?: string
  userDir?: string
}

interface RuntimeInfo {
  startTime?: string
  runTime?: string
}

interface DiskItem {
  dirName: string
  sysTypeName: string
  typeName: string
  total: string
  used: string
  free: string
  usage: string
}

interface ServerRawData {
  cpu?: { cpuUsage?: string; used?: string; cpuNum?: number; sys?: string; free?: string }
  mem?: { usage?: string; total?: string; used?: string; free?: string }
  sys?: { computerName?: string; osName?: string; computerIp?: string; osArch?: string; userDir?: string }
  jvm?: { startTime?: string; runTime?: string }
  sysFiles?: DiskItem[]
}

const loading = ref(false)
const healthData = ref<HealthStatus>({} as HealthStatus)
const serverData = ref<ServerInfo>({})
const sysData = ref<SysInfo>({})
const runtimeData = ref<RuntimeInfo>({})
const diskList = ref<DiskItem[]>([])
const autoRefresh = ref(false)
const lastUpdate = ref('')
const uptimeSeconds = ref(0)
let refreshTimer: ReturnType<typeof setTimeout> | null = null
let uptimeTimer: ReturnType<typeof setInterval> | null = null

const statusClass = computed(() => ({
  'status-up': healthData.value.status === 'UP',
  'status-degraded': healthData.value.status === 'DEGRADED',
  'status-down': healthData.value.status === 'DOWN'
}))

const statusIcon = computed(() => {
  const s = healthData.value.status
  if (s === 'UP') return CircleCheckFilled
  if (s === 'DEGRADED') return WarningFilled
  if (s === 'DOWN') return CircleCloseFilled
  return Monitor
})

const statusText = computed(() => {
  const s = healthData.value.status
  if (s === 'UP') return t('health.systemNormal')
  if (s === 'DEGRADED') return t('health.systemDegraded')
  if (s === 'DOWN') return t('health.systemDown')
  return t('common.loading')
})

const statusTagType = computed<'success' | 'warning' | 'danger' | 'info'>(() => {
  const s = healthData.value.status
  if (s === 'UP') return 'success'
  if (s === 'DEGRADED') return 'warning'
  if (s === 'DOWN') return 'danger'
  return 'info'
})

const dbDesc = computed(() => (healthData.value.db === 'UP' ? t('health.dbOk') : t('health.dbFail')))
const redisDesc = computed(() => (healthData.value.redis === 'UP' ? t('health.redisOk') : t('health.redisFail')))
const memStatusClass = computed(() => {
  const usage = Number(serverData.value.memUsage || 0)
  if (usage > 90) return 'down'
  if (usage > 70) return 'warn'
  return 'up'
})

const progressColor = computed(() => {
  return [
    { color: 'var(--el-color-success)', percentage: 60 },
    { color: 'var(--el-color-warning)', percentage: 80 },
    { color: 'var(--el-color-danger)', percentage: 100 }
  ]
})

const formattedUptime = computed(() => {
  const s = uptimeSeconds.value
  if (s <= 0) return '-'
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  const secs = Math.floor(s % 60)
  return t('health.uptimeFormat', { days, hours, minutes, secs })
})

async function loadHealth(): Promise<void> {
  loading.value = true
  try {
    const [healthRes, serverRes] = (await Promise.all([
      request({ url: '/health', method: 'get' }),
      request({ url: '/monitor/server', method: 'get' })
    ])) as unknown as [AjaxResult<HealthStatus>, AjaxResult<ServerRawData>]
    healthData.value = (healthRes.data ?? (healthRes as unknown as HealthStatus)) as HealthStatus
    if (serverRes.data) {
      const cpu = serverRes.data.cpu || {}
      const mem = serverRes.data.mem || {}
      const sys = serverRes.data.sys || {}
      const jvm = serverRes.data.jvm || {}
      const sysFiles = serverRes.data.sysFiles || []
      // CPU 详情（合并自 server 页面）
      serverData.value = {
        cpuUsage: cpu.cpuUsage ?? cpu.used,
        cpuNum: cpu.cpuNum,
        cpuSys: cpu.sys,
        cpuFree: cpu.free,
        memUsage: mem.usage,
        totalMem: mem.total,
        usedMem: mem.used,
        freeMem: mem.free
      }
      // 运行环境（仅保留本项目需要的字段：服务器名/IP/OS/架构/项目路径/启动时间/运行时长）
      sysData.value = {
        computerName: sys.computerName,
        osName: sys.osName,
        computerIp: sys.computerIp,
        osArch: sys.osArch,
        userDir: sys.userDir
      }
      runtimeData.value = {
        startTime: jvm.startTime,
        runTime: jvm.runTime
      }
      diskList.value = sysFiles.map((f: DiskItem) => ({
        dirName: f.dirName,
        sysTypeName: f.sysTypeName,
        typeName: f.typeName,
        total: f.total,
        used: f.used,
        free: f.free,
        usage: f.usage
      }))
    }
    lastUpdate.value = new Date().toLocaleTimeString()
    // 不重置 uptimeSeconds：uptimeTimer 每秒自增，重置会导致运行时长永远不超过刷新间隔
  } catch (err) {
    if (import.meta.env.DEV) console.error('[HealthDashboard] Failed to load:', err)
  } finally {
    loading.value = false
  }
}

const scheduleRefresh = () => {
  refreshTimer = setTimeout(async () => {
    await loadHealth()
    scheduleRefresh()
  }, 10000)
}

function toggleAutoRefresh(val: boolean | string | number): void {
  // BUG FIX: 原代码在 onMounted 已启动 uptimeTimer，此处再次创建会导致运行时长双倍递增
  // uptimeTimer 由 onMounted 统一启动、onBeforeUnmount 统一清理，此处只管理 refreshTimer
  if (val) {
    if (refreshTimer) clearTimeout(refreshTimer)
    scheduleRefresh()
  } else {
    if (refreshTimer) {
      clearTimeout(refreshTimer)
      refreshTimer = null
    }
  }
}

onMounted(() => {
  loadHealth()
  uptimeTimer = setInterval(() => {
    uptimeSeconds.value += 1
  }, 1000)
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  if (uptimeTimer) {
    clearInterval(uptimeTimer)
    uptimeTimer = null
  }
})
</script>

<style lang="scss" scoped>
.overall-status {
  background: linear-gradient(135deg, var(--el-bg-color-page) 0%, var(--el-border-color-light) 100%);
  transition: background 0.3s;

  &.status-up {
    background: linear-gradient(135deg, var(--el-color-success-light-9) 0%, var(--el-color-success-light-7) 100%);
  }
  &.status-degraded {
    background: linear-gradient(135deg, var(--el-color-warning-light-9) 0%, var(--el-color-warning-light-7) 100%);
  }
  &.status-down {
    background: linear-gradient(135deg, var(--el-color-danger-light-9) 0%, var(--el-color-danger-light-7) 100%);
  }

  .version,
  .uptime {
    font-size: 13px;
  }
}

.check-card {
  .check-icon {
    font-size: 42px;
    transition: color 0.3s ease;
    &.up {
      color: var(--el-color-success);
    }
    &.down {
      color: var(--el-color-danger);
    }
    &.warn {
      color: var(--el-color-warning);
    }
  }
  .check-status {
    font-size: 22px;
    transition: color 0.3s ease;
    &.up {
      color: var(--el-color-success);
    }
    &.down {
      color: var(--el-color-danger);
    }
    &.warn {
      color: var(--el-color-warning);
    }
  }
}

/* 进度条填充动画 */
:deep(.el-progress-bar__outer) {
  transition: width 0.6s ease;
}

/* 状态标签过渡 */
:deep(.el-tag) {
  transition: all 0.2s ease;
}
</style>
