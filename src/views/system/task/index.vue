<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('task.search.taskType')" prop="taskType">
          <el-select
            :aria-label="t('task.search.taskType')"
            v-model="queryParams.taskType"
            :placeholder="t('task.search.phTaskType')"
            clearable
            class="w-[160px]"
          >
            <el-option :label="t('task.form.taskTypeOperLog')" value="operlog_export" />
            <el-option :label="t('task.form.taskTypeBackup')" value="backup" />
            <el-option :label="t('task.form.taskTypeOther')" value="other" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('task.search.status')" prop="status">
          <el-select
            :aria-label="t('task.search.status')"
            v-model="queryParams.status"
            :placeholder="t('task.search.phStatus')"
            clearable
            class="w-[140px]"
          >
            <el-option :label="t('task.form.statusWaiting')" value="pending" />
            <el-option :label="t('task.form.statusRunning')" value="running" />
            <el-option :label="t('task.form.statusCompleted')" value="success" />
            <el-option :label="t('task.form.statusFailed')" value="failed" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('task.search.operator')" prop="operator">
          <el-input
            v-model="queryParams.operator"
            :placeholder="t('task.search.phOperator')"
            :aria-label="t('task.search.operator')"
            :maxlength="30"
            clearable
            class="w-[160px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('task.search.createTime')" prop="createTime">
          <el-date-picker
            v-model="dateRange"
            value-format="YYYY-MM-DD"
            type="daterange"
            range-separator="-"
            :start-placeholder="t('common.form.startDate')"
            :end-placeholder="t('common.form.endDate')"
            class="w-[240px]"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['system:task:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" :columns="columns" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="9" :rows="8" />
      <el-table
        v-else
        ref="taskTableRef"
        v-loading="loading"
        :data="taskList"
        :row-key="(row: SysTask) => row.taskId"
        @selection-change="handleSelectionChange"
        @sort-change="handleSortChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column
          v-if="columns.taskId.visible"
          :label="t('task.column.id')"
          align="center"
          prop="taskId"
          width="80"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          v-if="columns.taskName.visible"
          :label="t('task.column.name')"
          align="center"
          prop="taskName"
          show-overflow-tooltip
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          v-if="columns.taskType.visible"
          :label="t('task.column.type')"
          align="center"
          prop="taskType"
          width="140"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <el-tag size="small">{{ scope.row.taskType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column
          v-if="columns.status.visible"
          :label="t('task.column.status')"
          align="center"
          prop="status"
          width="100"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <el-tag :type="statusTagType(scope.row.status)" size="small">
              {{ statusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          v-if="columns.progress.visible"
          :label="t('task.column.progress')"
          align="center"
          prop="progress"
          width="180"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <el-progress
              :percentage="scope.row.progress"
              :status="progressStatus(scope.row.status)"
              :stroke-width="8"
            />
          </template>
        </el-table-column>
        <el-table-column
          v-if="columns.currentTotal.visible"
          :label="t('task.column.currentTotal')"
          align="center"
          width="120"
        >
          <template #default="scope">
            <span>{{ scope.row.current }} / {{ scope.row.total }}</span>
          </template>
        </el-table-column>
        <el-table-column
          v-if="columns.operator.visible"
          :label="t('task.column.operator')"
          align="center"
          prop="operator"
          width="120"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          v-if="columns.resultMsg.visible"
          :label="t('task.column.resultMsg')"
          align="center"
          prop="resultMsg"
          show-overflow-tooltip
        />
        <el-table-column
          v-if="columns.createTime.visible"
          :label="t('task.column.createTime')"
          align="center"
          prop="createTime"
          width="180"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('common.column.operation')"
          align="center"
          width="160"
          class-name="small-padding fixed-width"
        >
          <template #default="scope">
            <el-button
              v-if="scope.row.taskType === 'backup'"
              link
              type="primary"
              icon="Coin"
              @click="handleViewBackups"
              v-hasPermi="['system:backup:list']"
            >
              {{ t('task.btn.viewBackups') }}
            </el-button>
            <el-button
              link
              type="danger"
              icon="Delete"
              @click="handleDelete(scope.row)"
              v-hasPermi="['system:task:remove']"
            >
              {{ t('common.delete') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <!-- 失败/空态分形（ListEmpty 单一实现）：加载失败显示「重试」，成功无数据保留原 CTA 空态 -->
          <list-empty :load-error="loadError" @retry="retryLoad">
            <EmptyState
              :description="t('common.noData')"
              :action-text="hasQueryFilter ? t('common.emptyActionReset') : undefined"
              :action-icon="hasQueryFilter ? 'RefreshLeft' : undefined"
              :show-reset="hasQueryFilter"
              :reset-text="hasQueryFilter ? t('common.emptyActionReset') : undefined"
              @action="resetQuery"
              @reset="resetQuery"
            />
          </list-empty>
        </template>
      </el-table>
    </Transition>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />
  </div>
</template>

<script setup lang="ts" name="Task">
import { listTask, delTask } from '@/api/system/task'
import type { SysTask, TaskQueryParams } from '@/api/system/task'
import { addDateRange } from '@/utils/stepby'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import EmptyState from '@/components/EmptyState/index.vue'
import useSettingsStore from '@/store/modules/settings'
import { useMobileFilter } from '@/composables/useMobileFilter'
import { useTableColumns } from '@/composables/useTableColumns'
import { resetQueryDefaults, useCrudTable } from '@/composables/useCrudTable'
import type { TableColumnDef } from '@/utils/userPrefs'
import type { TableShowColumns } from '@/types/api/common'
import type { FormInstance } from 'element-plus'

const { t } = useI18n()
const router = useRouter()
const queryRef = useTemplateRef('queryRef')
const taskTableRef = useTemplateRef('taskTableRef')

// UX-7：列显隐偏好持久化 —— 接入 useTableColumns（用户偏好持久化单一数据源）：
// 偏好恢复 → columns ref；RightToolbar 直改 visible → 回写偏好（刷新/换设备保持一致）
const settingsStore = useSettingsStore()
const TASK_TABLE_KEY = 'monitor:task'
// 列定义顺序即设置面板展示顺序；多选列/操作列不参与显隐偏好（常驻）
const TASK_COLUMN_DEFS: TableColumnDef[] = [
  { key: 'taskId' },
  { key: 'taskName' },
  { key: 'taskType' },
  { key: 'status' },
  { key: 'progress' },
  { key: 'currentTotal' },
  { key: 'operator' },
  { key: 'resultMsg' },
  { key: 'createTime' }
]
// P2a：label 工厂——locale 切换时由 composable 重建 columns label（visible 偏好保留）
const TASK_COLUMN_LABELS = () => ({
  taskId: t('task.column.id'),
  taskName: t('task.column.name'),
  taskType: t('task.column.type'),
  status: t('task.column.status'),
  progress: t('task.column.progress'),
  currentTotal: t('task.column.currentTotal'),
  operator: t('task.column.operator'),
  resultMsg: t('task.column.resultMsg'),
  createTime: t('task.column.createTime')
})
const {
  visibleKeys: taskVisibleKeys,
  toggle: toggleTaskColumn,
  bindLabels: bindTaskLabels
} = useTableColumns({
  pageKey: TASK_TABLE_KEY,
  columns: TASK_COLUMN_DEFS,
  labels: TASK_COLUMN_LABELS,
  getSaved: () => settingsStore.userPrefs.tableColumns?.[TASK_TABLE_KEY],
  save: (visible) =>
    settingsStore.updateUserPrefs({
      tableColumns: { ...settingsStore.userPrefs.tableColumns, [TASK_TABLE_KEY]: visible }
    })
})

// M1: columns 保持 ref（非 computed），因为 RightToolbar 通过 props 直接 mutate visible 属性来切换列显隐；
// 若改 computed，语言切换时 computed 重新求值会返回新对象，丢失用户已切换的 visible 状态。
const columns = ref<Record<string, TableShowColumns>>({
  taskId: { label: t('task.column.id'), visible: true },
  taskName: { label: t('task.column.name'), visible: true },
  taskType: { label: t('task.column.type'), visible: true },
  status: { label: t('task.column.status'), visible: true },
  progress: { label: t('task.column.progress'), visible: true },
  currentTotal: { label: t('task.column.currentTotal'), visible: true },
  operator: { label: t('task.column.operator'), visible: true },
  resultMsg: { label: t('task.column.resultMsg'), visible: true },
  createTime: { label: t('task.column.createTime'), visible: true }
})
// P2a：locale 切换 → columns label 自动更新（labelMap immediate 应用 + watch 跟随）
bindTaskLabels(columns)

// 偏好 → columns ref（immediate：setup 内同步应用，先于深 watch 注册避免回写回环）
watch(
  taskVisibleKeys,
  (keys: string[]) => {
    for (const key of Object.keys(columns.value)) {
      columns.value[key].visible = keys.includes(key)
    }
  },
  { immediate: true }
)
// RightToolbar 直改 columns.visible → 回写 useTableColumns（内部仅在真正变化时持久化）
// columns 为原地逐键修改（非整体替换），浅监听不触发；改用 computed 签名仅跟踪 visible 位，
// label 更新（bindLabels）不再触发 deep 全量遍历。
const columnsVisibleSig = computed(() =>
  (Object.values(columns.value) as TableShowColumns[]).map((c) => (c.visible ? 1 : 0)).join('')
)
watch(columnsVisibleSig, () => {
  const v = columns.value
  for (const key of Object.keys(v)) {
    if (taskVisibleKeys.value.includes(key) !== v[key].visible) {
      toggleTaskColumn(key, v[key].visible)
    }
  }
})

const dateRange = ref<string[]>([])

const queryParams = ref<TaskQueryParams>({
  pageNum: 1,
  pageSize: 10,
  taskType: undefined,
  status: undefined,
  operator: undefined,
  orderByColumn: undefined,
  isAsc: undefined
})

// 只读接入（仅 listApi + deleteApi）：列表/查询/多选/删除走 useCrudTable；
// 轮询/启停/排序/时间范围过滤保留手写。删除确认文案为 {count} 契约，经 deleteTipParams 等价表达，
// delTask 后端接受逗号串，经 deleteApi 包装等价表达。
const {
  dataList: taskList,
  loading,
  showSearch,
  multiple,
  total,
  getList,
  loadError,
  retryLoad,
  handleQuery,
  handleDelete,
  handleSelectionChange
} = useCrudTable<SysTask, TaskQueryParams>({
  listApi: (params) =>
    listTask(addDateRange({ ...params } as Record<string, unknown>, dateRange.value) as TaskQueryParams),
  deleteApi: (targetIds) => delTask(Array.isArray(targetIds) ? (targetIds.map(Number) as number[]) : Number(targetIds)),
  deleteTipParams: (targetIds) => ({ count: targetIds.length }),
  idField: 'taskId',
  defaultForm: () => ({}) as SysTask,
  titleKey: 'task.title',
  deleteTipKey: 'task.tip.confirmDelete',
  queryParams,
  form: ref<SysTask>({} as SysTask),
  formRef: ref<FormInstance | null>(null),
  queryRef,
  // 迁移等价性：原页面无 URL 查询同步，关闭以保持行为零变化
  syncQueryToUrl: false
})

// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
useMobileFilter(showSearch)

const hasQueryFilter = computed(() => {
  const q = queryParams.value
  return !!(q.taskType || q.status || q.operator)
})

function statusText(s: string): string {
  switch (s) {
    case 'pending':
      return t('task.form.statusWaiting')
    case 'running':
      return t('task.form.statusRunning')
    case 'success':
      return t('task.form.statusCompleted')
    case 'failed':
      return t('task.form.statusFailed')
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

/** 重置（含排序状态清除，保留手写：需 clearSort 恢复后端默认排序） */
function resetQuery() {
  dateRange.value = []
  queryParams.value.orderByColumn = undefined
  queryParams.value.isAsc = undefined
  queryRef.value?.resetFields()
  // 批六十四修复（F137⑤ 实证）：EP form-item initialValue 被「URL 同步 + fullPath 重挂载」
  // 污染为搜索值，resetFields 只会“重置回搜索值”——必须显式恢复页面定义的干净默认快照
  resetQueryDefaults(queryParams)
  handleQuery()
  taskTableRef.value?.clearSort()
}

/** 排序触发事件（服务端排序：透传 orderByColumn/isAsc，仅白名单列可触发；保留手写以维持既有参数语义） */
function handleSortChange(column: { prop: string | null; order: string | null }) {
  queryParams.value.orderByColumn = column.prop ?? undefined
  queryParams.value.isAsc = column.order ?? undefined
  getList()
}

/** P2-1: 备份类型任务跳转到备份管理页面
 *  路由为 /monitor/backup（getRouters 动态注册，组件 system/backup/index）
 */
function handleViewBackups() {
  router.push('/monitor/backup')
}

// ==================== running 任务自动刷新 ====================
// 存在 running 状态任务时以 5s 间隔静默轮询（不闪 loading），任务结束自动停止；
// onBeforeUnmount 清理定时器，避免内存泄漏。
const RUNNING_POLL_INTERVAL = 5000
let runningPollTimer: ReturnType<typeof setInterval> | null = null

const hasRunningTask = computed(() => taskList.value.some((t: SysTask) => t.status === 'running'))

// 列表更新（含 useCrudTable 的 getList/删除刷新）后同步轮询启停
watch(taskList, () => syncRunningPoll())

/** 静默刷新：仅更新数据，不触发全页 loading（避免轮询闪烁） */
function silentRefresh() {
  const params = addDateRange({ ...queryParams.value } as Record<string, unknown>, dateRange.value) as TaskQueryParams
  listTask(params)
    .then((res) => {
      taskList.value = res.rows
      total.value = res.total
      syncRunningPoll()
    })
    .catch(() => {})
}

/** 按列表中是否存在 running 任务启停轮询 */
function syncRunningPoll() {
  if (hasRunningTask.value) {
    if (!runningPollTimer) {
      runningPollTimer = setInterval(() => {
        // 标签页隐藏时跳过请求，回到前台后下一个周期恢复
        if (document.hidden) return
        silentRefresh()
      }, RUNNING_POLL_INTERVAL)
    }
  } else if (runningPollTimer) {
    clearInterval(runningPollTimer)
    runningPollTimer = null
  }
}

onBeforeUnmount(() => {
  if (runningPollTimer) {
    clearInterval(runningPollTimer)
    runningPollTimer = null
  }
})

getList()
</script>

<style scoped>
:deep(.el-table__row) {
  transition: background-color 0.2s ease;
}

:deep(.el-tag) {
  transition: all 0.2s ease;
}

:deep(.el-progress-bar__outer) {
  transition: width 0.3s ease;
}
</style>
