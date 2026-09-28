<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('task.search.taskType')" prop="taskType">
          <el-select
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
          <el-select v-model="queryParams.status" :placeholder="t('task.search.phStatus')" clearable class="w-[140px]">
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
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="9" :rows="8" />
      <el-table
        v-else
        v-loading="loading"
        :data="taskList"
        :row-key="(row: SysTask) => row.taskId"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column :label="t('task.column.id')" align="center" prop="taskId" width="80" />
        <el-table-column :label="t('task.column.name')" align="center" prop="taskName" show-overflow-tooltip />
        <el-table-column :label="t('task.column.type')" align="center" prop="taskType" width="140">
          <template #default="scope">
            <el-tag size="small">{{ scope.row.taskType }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('task.column.status')" align="center" width="100">
          <template #default="scope">
            <el-tag :type="statusTagType(scope.row.status)" size="small">
              {{ statusText(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('task.column.progress')" align="center" width="180">
          <template #default="scope">
            <el-progress
              :percentage="scope.row.progress"
              :status="progressStatus(scope.row.status)"
              :stroke-width="8"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('task.column.currentTotal')" align="center" width="120">
          <template #default="scope">
            <span>{{ scope.row.current }} / {{ scope.row.total }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('task.column.operator')" align="center" prop="operator" width="120" />
        <el-table-column :label="t('task.column.resultMsg')" align="center" prop="resultMsg" show-overflow-tooltip />
        <el-table-column :label="t('task.column.createTime')" align="center" prop="createTime" width="180">
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
          <EmptyState
            :description="t('common.noData')"
            :action-text="hasQueryFilter ? t('common.emptyActionReset') : undefined"
            :action-icon="hasQueryFilter ? 'RefreshLeft' : undefined"
            :show-reset="hasQueryFilter"
            :reset-text="hasQueryFilter ? t('common.emptyActionReset') : undefined"
            @action="resetQuery"
            @reset="resetQuery"
          />
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
import modal from '@/plugins/modal'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import EmptyState from '@/components/EmptyState/index.vue'

const { t } = useI18n()
const router = useRouter()
const queryRef = useTemplateRef('queryRef')

const taskList = shallowRef<SysTask[]>([])
const loading = ref(true)
const showSearch = ref(true)
const total = ref(0)
const ids = ref<number[]>([])
const single = ref(true)
const multiple = ref(true)
const dateRange = ref<string[]>([])

const queryParams = ref<TaskQueryParams>({
  pageNum: 1,
  pageSize: 10,
  taskType: undefined,
  status: undefined,
  operator: undefined
})

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

function getList() {
  loading.value = true
  const params = addDateRange({ ...queryParams.value } as Record<string, unknown>, dateRange.value) as TaskQueryParams
  listTask(params)
    .then((res) => {
      taskList.value = res.rows
      total.value = res.total
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

function resetQuery() {
  dateRange.value = []
  queryRef.value?.resetFields()
  handleQuery()
}

function handleSelectionChange(selection: SysTask[]) {
  ids.value = selection.map((item) => item.taskId)
  single.value = selection.length !== 1
  multiple.value = !selection.length
}

function handleDelete(row?: SysTask) {
  const deleteIds = row ? [row.taskId] : ids.value
  if (!deleteIds.length) return
  modal
    .confirm(t('task.tip.confirmDelete', { count: deleteIds.length }))
    .then(() => {
      return delTask(deleteIds.join(','))
    })
    .then(() => {
      modal.msgSuccess(t('common.deleteSuccess'))
      getList()
    })
    .catch(() => {})
}

/** P2-1: 备份类型任务跳转到备份管理页面
 *  路由为 /monitor/backup（getRouters 动态注册，组件 system/backup/index）
 */
function handleViewBackups() {
  router.push('/monitor/backup')
}

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
