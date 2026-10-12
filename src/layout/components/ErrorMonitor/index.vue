<template>
  <el-popover placement="bottom-end" :width="380" trigger="click">
    <template #reference>
      <div
        class="error-monitor-trigger"
        role="button"
        tabindex="0"
        :aria-label="
          total > 0
            ? t('error.monitor.ariaWithCount', { count: errorCount > 0 ? errorCount : total })
            : t('error.monitor.ariaNoIssue')
        "
        @keydown.enter.prevent
      >
        <el-icon><WarningFilled /></el-icon>
        <Transition name="fade">
          <span v-if="total > 0" class="error-monitor-badge" :class="{ 'is-error': errorCount > 0 }" aria-hidden="true">
            {{ errorCount > 0 ? errorCount : total }}
          </span>
        </Transition>
      </div>
    </template>

    <div class="error-monitor-header">
      <span class="error-monitor-title">{{ t('error.monitor.title') }}</span>
      <span
        v-if="items.length > 0"
        class="error-monitor-clear"
        role="button"
        tabindex="0"
        @click="clear"
        @keydown.enter.prevent="clear"
      >
        {{ t('error.monitor.clear') }}
      </span>
    </div>

    <Transition mode="out-in" name="fade">
      <el-empty v-if="items.length === 0" key="empty" :description="t('error.monitor.empty')" :image-size="46" />
      <div v-else key="list" class="error-monitor-list">
        <div v-for="item in items" :key="item.id" class="error-monitor-item">
          <el-tag size="small" :type="tagType(item.level)" class="error-monitor-tag">
            {{ t(`error.monitor.levels.${item.level}`) }}
          </el-tag>
          <div class="error-monitor-body">
            <span class="error-monitor-msg">
              {{ item.message }}
              <span v-if="item.count > 1" class="error-monitor-multi">(×{{ item.count }})</span>
            </span>
            <span class="error-monitor-time">
              {{ t('error.monitor.source', { source: t(`error.monitor.sources.${item.source}`) }) }} ·
              {{ formatTime(item.time) }}
            </span>
          </div>
        </div>
      </div>
    </Transition>

    <!-- 直达明细页（UX-3）：聚合窗只显示缓冲区，完整列表/筛选在前端异常页 -->
    <div class="error-monitor-footer">
      <el-button link type="primary" size="small" @click="goDetail">
        {{ t('error.monitor.viewAll') }}
      </el-button>
    </div>
  </el-popover>
</template>

<script setup lang="ts">
import { errorHub, type ErrorLevel, type MonitorIssue } from '@/utils/errorHub'

const { t } = useI18n()

const items = ref<MonitorIssue[]>([])
const errorCount = computed(() =>
  items.value.reduce((s: number, i: MonitorIssue) => (i.level === 'error' ? s + 1 : s), 0)
)
const total = computed(() => items.value.length)

let unsubscribe: (() => void) | null = null
onMounted(() => {
  unsubscribe = errorHub.subscribe((list: MonitorIssue[]) => {
    items.value = list
  })
})
onUnmounted(() => {
  unsubscribe?.()
  unsubscribe = null
})

function clear(): void {
  errorHub.clear()
}

/** UX-3：直达前端异常明细页（列表/筛选/设备分桶在该页） */
function goDetail(): void {
  void import('@/router').then(({ default: router }) => router.push('/monitor/frontendError'))
}

function tagType(level: ErrorLevel): 'danger' | 'warning' | 'info' {
  if (level === 'error') return 'danger'
  if (level === 'warning') return 'warning'
  return 'info'
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatTime(ts: number): string {
  const d = new Date(ts)
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
}
</script>

<style scoped>
.error-monitor-footer {
  border-top: 1px solid var(--el-border-color-light, #e4e7ed);
  margin-top: 8px;
  padding: 6px 4px 0;
  text-align: center;
}

.error-monitor-trigger {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.error-monitor-trigger :deep(.el-icon) {
  font-size: 19px;
}

.error-monitor-badge {
  position: absolute;
  top: 0;
  right: -2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  border-radius: 8px;
  background: var(--el-color-warning);
  color: #fff;
  font-size: 10px;
  line-height: 16px;
  text-align: center;
  box-sizing: border-box;
}

.error-monitor-badge.is-error {
  background: var(--el-color-danger);
}

.error-monitor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.error-monitor-title {
  font-weight: 600;
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.error-monitor-clear {
  font-size: 12px;
  color: var(--el-color-primary);
  cursor: pointer;
}

.error-monitor-clear:hover {
  opacity: 0.8;
}

.error-monitor-list {
  max-height: 320px;
  overflow-y: auto;
}

.error-monitor-item {
  display: flex;
  gap: 8px;
  padding: 8px 4px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.error-monitor-item:last-child {
  border-bottom: none;
}

.error-monitor-tag {
  flex-shrink: 0;
  margin-top: 1px;
}

.error-monitor-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.error-monitor-msg {
  font-size: 13px;
  color: var(--el-text-color-primary);
  word-break: break-all;
  overflow-wrap: anywhere;
}

.error-monitor-multi {
  color: var(--el-text-color-secondary);
}

.error-monitor-time {
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>
