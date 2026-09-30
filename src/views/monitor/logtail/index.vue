<template>
  <div class="app-container log-tail" v-loading="loading">
    <!-- 顶部筛选 + 操作栏 -->
    <el-card shadow="never" class="mb-4">
      <div class="toolbar flex flex-wrap items-center gap-4">
        <div class="toolbar-item">
          <span class="label">{{ t('logTail.file') }}</span>
          <el-select
            v-model="currentFile"
            :placeholder="t('logTail.selectFile')"
            class="w-[260px]"
            clearable
            filterable
            @change="onFileChange"
          >
            <el-option v-for="f in files" :key="f.file_name" :label="f.file_name" :value="f.file_name">
              <span class="flex justify-between items-center gap-2">
                <span>{{ f.file_name }}</span>
                <span class="text-text-secondary text-xs">{{ f.file_size_str }}</span>
              </span>
            </el-option>
          </el-select>
        </div>

        <div class="toolbar-item">
          <span class="label">{{ t('logTail.level') }}</span>
          <el-select v-model="level" class="w-[130px]" @change="loadTail">
            <el-option :label="t('logTail.levels.all')" value="" />
            <el-option :label="t('logTail.levels.error')" value="ERROR" />
            <el-option :label="t('logTail.levels.warn')" value="WARN" />
            <el-option :label="t('logTail.levels.info')" value="INFO" />
            <el-option :label="t('logTail.levels.debug')" value="DEBUG" />
          </el-select>
        </div>

        <div class="toolbar-item">
          <span class="label">{{ t('logTail.keyword') }}</span>
          <el-input
            v-model="keyword"
            :placeholder="t('logTail.keyword')"
            class="w-[180px]"
            clearable
            @keyup.enter="loadTail"
            @clear="loadTail"
          />
        </div>

        <div class="toolbar-item">
          <span class="label">{{ t('logTail.lineCount') }}</span>
          <el-select v-model="lines" class="w-[90px]" @change="loadTail">
            <el-option label="500" value="500" />
            <el-option label="1000" value="1000" />
            <el-option label="2000" value="2000" />
          </el-select>
        </div>

        <el-button type="primary" icon="Filter" @click="loadTail">{{ t('logTail.filter') }}</el-button>
        <el-button icon="Refresh" @click="loadTail">{{ t('logTail.refresh') }}</el-button>

        <div class="flex-1" />

        <el-switch v-model="autoRefresh" :active-text="t('logTail.autoRefresh')" />
        <span v-if="total" class="total text-text-secondary text-xs">{{ t('logTail.total', { total }) }}</span>
      </div>
    </el-card>

    <!-- 日志正文 -->
    <el-card shadow="never" body-class="log-body">
      <div v-if="!currentFile" class="no-file flex flex-col items-center justify-center py-16 text-text-secondary">
        <el-icon :size="56"><Document /></el-icon>
        <p class="mt-3">{{ t('logTail.noFile') }}</p>
      </div>
      <div
        v-else-if="rows.length === 0"
        class="no-file flex flex-col items-center justify-center py-16 text-text-secondary"
      >
        <el-icon :size="56"><Document /></el-icon>
        <p class="mt-3">{{ t('logTail.empty') }}</p>
      </div>
      <div v-else ref="logArea" class="log-area">
        <div v-for="row in rows" :key="row.no" class="log-line" :class="'level-' + row.level.toLowerCase()">
          <span class="line-no">{{ row.no }}</span>
          <span class="level-badge" :class="'level-' + row.level.toLowerCase()">{{ row.level }}</span>
          <span class="line-text">{{ row.text }}</span>
        </div>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts" name="MonitorLogTail">
import { Document } from '@element-plus/icons-vue'
import { listLogFiles, tailLogFile } from '@/api/monitor/logtail'
import type { LogFileInfo, LogLine } from '@/api/monitor/logtail'
import type { AjaxResult } from '@/types'

const { t } = useI18n()

const loading = ref(false)
const files = ref<LogFileInfo[]>([])
const currentFile = ref('')
const level = ref('')
const keyword = ref('')
const lines = ref('500')
const rows = ref<LogLine[]>([])
const total = ref(0)
const autoRefresh = ref(false)
const logArea = ref<HTMLElement | null>(null)
let refreshTimer: ReturnType<typeof setTimeout> | null = null

/** 加载日志文件列表 */
async function loadFiles(): Promise<void> {
  try {
    const res = (await listLogFiles()) as unknown as AjaxResult<{ rows: LogFileInfo[] }>
    files.value = res.data?.rows ?? []
    // 若当前选择文件已被新列表覆盖，下拉自动选中第一个（最新日志）
    if (files.value.length && !files.value.some((f: LogFileInfo) => f.file_name === currentFile.value)) {
      currentFile.value = files.value[0].file_name
      await loadTail()
    } else if (!currentFile.value && files.value.length) {
      // 首次加载：自动选中最新日志文件
      currentFile.value = files.value[0].file_name
      await loadTail()
    }
  } catch (err) {
    if (import.meta.env.DEV) console.error('[LogTail] loadFiles failed:', err)
  }
}

/** 加载当前文件的日志尾部 */
async function loadTail(): Promise<void> {
  if (!currentFile.value) return
  loading.value = true
  try {
    const res = (await tailLogFile({
      file_name: currentFile.value,
      level: level.value || undefined,
      keyword: keyword.value.trim() || undefined,
      lines: Number(lines.value) || 500
    })) as unknown as AjaxResult<{ total: number; rows: LogLine[] }>
    rows.value = res.data?.rows ?? []
    total.value = res.data?.total ?? rows.value.length
  } catch (err) {
    if (import.meta.env.DEV) console.error('[LogTail] loadTail failed:', err)
  } finally {
    loading.value = false
    nextTick(scrollToBottom)
  }
}

/** 日志正文滚动到底部 */
function scrollToBottom(): void {
  if (logArea.value) {
    logArea.value.scrollTop = logArea.value.scrollHeight
  }
}

function onFileChange(): void {
  if (!currentFile.value) {
    rows.value = []
    total.value = 0
    return
  }
  loadTail()
}

const scheduleRefresh = (): void => {
  refreshTimer = setTimeout(async () => {
    await loadTail()
    scheduleRefresh()
  }, 10000)
}

watch(autoRefresh, (val: boolean) => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
  if (val) scheduleRefresh()
})

onMounted(() => {
  loadFiles()
})

onBeforeUnmount(() => {
  if (refreshTimer) {
    clearTimeout(refreshTimer)
    refreshTimer = null
  }
})
</script>

<style lang="scss" scoped>
.toolbar {
  .toolbar-item {
    display: flex;
    align-items: center;
    gap: 8px;

    .label {
      font-size: 13px;
      color: var(--el-text-color-regular);
      white-space: nowrap;
    }
  }
}

.log-body {
  height: calc(100vh - 260px);
  min-height: 400px;
  overflow: hidden;
}

.log-area {
  height: 100%;
  overflow-y: auto;
  background: #0d1117;
  border-radius: 6px;
  padding: 12px 0;
  font-family: 'JetBrains Mono', 'Consolas', 'Courier New', monospace;
  font-size: 12.5px;
  line-height: 1.6;
}

.log-line {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 1px 14px;
  color: #c9d1d9;
  white-space: pre-wrap;
  word-break: break-all;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
  }

  .line-no {
    min-width: 40px;
    text-align: right;
    color: #484f58;
    user-select: none;
    flex-shrink: 0;
  }

  .level-badge {
    min-width: 52px;
    text-align: center;
    font-weight: 600;
    flex-shrink: 0;
    border-radius: 3px;
    padding: 0 4px;
    font-size: 11px;

    &.level-trace,
    &.level-debug {
      color: #8b949e;
    }
    &.level-info {
      color: #58a6ff;
    }
    &.level-warn {
      color: #d29922;
    }
    &.level-error {
      color: #f85149;
    }
  }

  .line-text {
    flex: 1;
  }
}

.no-file {
  height: 100%;
  color: var(--el-text-color-secondary);
}
</style>
