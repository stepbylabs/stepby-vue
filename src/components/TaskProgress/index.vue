<template>
  <Transition name="fade-slide">
    <div v-if="visibleTasks.length > 0" class="task-progress-float">
      <div class="task-progress-header">
        <span class="title">
          <el-icon>
            <Loading v-if="hasRunning" class="is-loading" />
            <Finished v-else />
          </el-icon>
          {{ t('taskProgress.title') }}
        </span>
        <span class="count">{{ visibleTasks.length }}</span>
        <el-button link size="small" @click="toggleCollapse">
          <el-icon>
            <ArrowUp v-if="!collapsed" />
            <ArrowDown v-else />
          </el-icon>
        </el-button>
        <el-button link size="small" @click="clearCompleted">
          {{ t('taskProgress.clearCompleted') }}
        </el-button>
      </div>
      <TransitionGroup name="list" tag="div" v-show="!collapsed" class="task-progress-list overflow-y-auto py-2 px-3">
        <div v-for="task in visibleTasks" :key="task.taskId" class="task-progress-item">
          <div class="task-row">
            <span class="task-name" :title="task.taskName">{{ task.taskName }}</span>
            <el-tag size="small" :type="statusTagType(task.status)" effect="light">
              {{ statusText(task.status) }}
            </el-tag>
            <el-button
              v-if="task.status === 'success' || task.status === 'failed'"
              link
              size="small"
              @click="dismiss(task.taskId)"
            >
              <el-icon><Close /></el-icon>
            </el-button>
          </div>
          <el-progress
            :percentage="task.progress"
            :status="progressStatus(task.status)"
            :stroke-width="6"
            :show-text="true"
          />
          <div v-if="task.resultMsg" class="task-result" :class="{ failed: task.status === 'failed' }">
            {{ task.resultMsg }}
          </div>
        </div>
      </TransitionGroup>
    </div>
  </Transition>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Loading, Finished, ArrowUp, ArrowDown, Close } from '@element-plus/icons-vue'
import { wsService, type WsMessage } from '@/utils/websocket'
import useUserStore from '@/store/modules/user'

const { t } = useI18n()

interface TaskInfo {
  taskId: number
  taskType: string
  taskName: string
  status: string // pending / running / success / failed
  progress: number
  total: number
  current: number
  resultMsg?: string
}

const tasks = ref<TaskInfo[]>([])
const collapsed = ref(false)
const dismissedIds = ref<Set<number>>(new Set())

const visibleTasks = computed(() => tasks.value.filter((t: TaskInfo) => !dismissedIds.value.has(t.taskId)))

const hasRunning = computed(() =>
  visibleTasks.value.some((t: TaskInfo) => t.status === 'pending' || t.status === 'running')
)

function statusText(s: string): string {
  switch (s) {
    case 'pending':
      return t('taskProgress.statusWaiting')
    case 'running':
      return t('taskProgress.statusRunning')
    case 'success':
      return t('taskProgress.statusCompleted')
    case 'failed':
      return t('taskProgress.statusFailed')
    default:
      return s
  }
}

function statusTagType(s: string): 'info' | 'warning' | 'success' | 'danger' {
  switch (s) {
    case 'pending':
      return 'info'
    case 'running':
      return 'warning'
    case 'success':
      return 'success'
    case 'failed':
      return 'danger'
    default:
      return 'info'
  }
}

function progressStatus(s: string): '' | 'success' | 'exception' | 'warning' {
  switch (s) {
    case 'success':
      return 'success'
    case 'failed':
      return 'exception'
    case 'pending':
      return 'warning'
    default:
      return ''
  }
}

function handleTaskProgress(msg: WsMessage) {
  const data = msg.data as unknown as TaskInfo
  if (!data || !data.taskId) return
  const idx = tasks.value.findIndex((t: TaskInfo) => t.taskId === data.taskId)
  if (idx >= 0) {
    tasks.value[idx] = { ...tasks.value[idx], ...data }
  } else {
    tasks.value.unshift(data)
  }
  // 限制最大显示数量
  if (tasks.value.length > 20) {
    // P2 修复: 被截断的任务若其 ID 已在 dismissedIds 中，同步清理避免 Set 无界增长
    const removed = tasks.value.slice(20)
    for (const t of removed) {
      dismissedIds.value.delete(t.taskId)
    }
    tasks.value = tasks.value.slice(0, 20)
  }
}

function dismiss(taskId: number) {
  dismissedIds.value.add(taskId)
  // P2 修复: 限制 dismissedIds Set 大小，避免长期运行后无界增长
  // 当 Set 超过 100 时，清理已不在 tasks 列表中的无效 ID
  if (dismissedIds.value.size > 100) {
    const activeIds = new Set(tasks.value.map((t: TaskInfo) => t.taskId))
    for (const id of dismissedIds.value) {
      if (!activeIds.has(id)) {
        dismissedIds.value.delete(id)
      }
    }
  }
}

function clearCompleted() {
  tasks.value = tasks.value.filter((t: TaskInfo) => t.status === 'pending' || t.status === 'running')
  // P2 修复: 同步清理 dismissedIds 中已不在 tasks 列表的 ID
  const activeIds = new Set(tasks.value.map((t: TaskInfo) => t.taskId))
  for (const id of dismissedIds.value) {
    if (!activeIds.has(id)) {
      dismissedIds.value.delete(id)
    }
  }
}

function toggleCollapse() {
  collapsed.value = !collapsed.value
}

onMounted(() => {
  // 仅登录用户监听
  if (useUserStore().token) {
    wsService.on('taskProgress', handleTaskProgress)
  }
})

onBeforeUnmount(() => {
  wsService.off('taskProgress', handleTaskProgress)
})
</script>

<style lang="scss" scoped>
.task-progress-float {
  position: fixed;
  right: 24px;
  bottom: 24px;
  width: 360px;
  max-height: 60vh;
  background: var(--el-bg-color, #fff);
  border-radius: 8px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
  z-index: 2000;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  border: 1px solid var(--el-border-color-light, #ebeef5);
}

.task-progress-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  background: var(--el-fill-color-light, #f5f7fa);
  border-bottom: 1px solid var(--el-border-color-light, #ebeef5);
  font-size: 13px;
  font-weight: 500;

  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    flex: 1;
  }

  .count {
    background: var(--el-color-primary, #409eff);
    color: var(--el-color-white);
    border-radius: 10px;
    padding: 0 8px;
    font-size: 11px;
    line-height: 16px;
    min-width: 18px;
    text-align: center;
  }
}

.task-progress-item {
  padding: 8px 0;
  border-bottom: 1px dashed var(--el-border-color-lighter, #f0f0f0);
  &:last-child {
    border-bottom: none;
  }
}

.task-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
  .task-name {
    flex: 1;
    font-size: 13px;
    color: var(--el-text-color-primary, #303133);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.task-result {
  margin-top: 4px;
  font-size: 12px;
  color: var(--el-text-color-secondary, #909399);
  &.failed {
    color: var(--el-color-danger, #f56c6c);
  }
}
</style>
