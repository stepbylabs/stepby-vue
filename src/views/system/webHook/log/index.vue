<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="90px">
        <el-form-item :label="t('webHook.log.search.eventType')" prop="eventType">
          <el-input
            v-model="queryParams.eventType"
            :placeholder="t('webHook.log.search.phEventType')"
            clearable
            class="w-[220px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('webHook.log.search.status')" prop="status">
          <el-select
            v-model="queryParams.status"
            :placeholder="t('webHook.log.search.phStatus')"
            clearable
            class="w-[200px]"
          >
            <el-option v-for="dict in sys_common_status" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
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
          v-hasPermi="['system:webHook:log:remove']"
        >
          {{ t('webHook.log.btn.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :loading="cleanLoading"
          @click="handleClean"
          v-hasPermi="['system:webHook:log:clean']"
        >
          {{ t('webHook.log.btn.clean') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="RefreshRight"
          :disabled="multiple"
          @click="handleRetry"
          v-hasPermi="['system:webHook:log:retry']"
        >
          {{ t('webHook.log.btn.retry') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['system:webHook:log:query']">
          {{ t('webHook.log.btn.export') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Close" @click="handleClose">{{ t('common.close') }}</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="8" :rows="8" />
      <el-table
        v-else
        v-loading="loading"
        :data="logList"
        :row-key="(row: SysWebHookLog) => row.id"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column :label="t('webHook.log.column.id')" width="90" align="center" prop="id" />
        <el-table-column
          :label="t('webHook.log.column.hookName')"
          align="center"
          prop="hookName"
          show-overflow-tooltip
        />
        <el-table-column
          :label="t('webHook.log.column.eventType')"
          align="center"
          prop="eventType"
          show-overflow-tooltip
        />
        <el-table-column
          :label="t('webHook.log.column.targetUrl')"
          align="center"
          prop="targetUrl"
          min-width="220"
          show-overflow-tooltip
        />
        <el-table-column :label="t('webHook.log.column.statusCode')" align="center" prop="statusCode" width="90" />
        <el-table-column :label="t('webHook.log.column.costMs')" align="center" prop="costMs" width="100" />
        <el-table-column :label="t('webHook.log.column.status')" align="center" width="90">
          <template #default="scope">
            <el-tag :type="scope.row.status === '0' ? 'success' : 'danger'" size="small">
              {{ statusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('webHook.log.column.createTime')" align="center" prop="createTime" width="180">
          <template #default="scope">
            <span>{{ scope.row.createTime }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.operation')" align="center" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="View" @click="handleView(scope.row)">
              {{ t('webHook.log.btn.view') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="t('common.empty')" />
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

    <!-- 推送记录详情对话框 -->
    <el-dialog
      :title="t('webHook.log.detail.title')"
      v-model="detailOpen"
      width="min(90%, 720px)"
      append-to-body
      destroy-on-close
    >
      <el-descriptions :column="2" border class="mb15">
        <el-descriptions-item :label="t('webHook.log.column.id')">{{ currentLog?.id }}</el-descriptions-item>
        <el-descriptions-item :label="t('webHook.log.column.hookName')">
          {{ currentLog?.hookName || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('webHook.log.column.eventType')">
          {{ currentLog?.eventType }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('webHook.log.column.status')">
          <el-tag :type="currentLog?.status === '0' ? 'success' : 'danger'" size="small">
            {{ statusLabel(currentLog?.status || '1') }}
          </el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('webHook.log.column.targetUrl')" :span="2">
          {{ currentLog?.targetUrl }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('webHook.log.column.statusCode')">
          {{ currentLog?.statusCode ?? '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('webHook.log.column.costMs')">{{ currentLog?.costMs }}</el-descriptions-item>
        <el-descriptions-item :label="t('webHook.log.column.createTime')" :span="2">
          {{ currentLog?.createTime || '-' }}
        </el-descriptions-item>
        <el-descriptions-item :label="t('webHook.log.detail.payload')" :span="2">
          <pre class="detail-pre">{{ formatPayload(currentLog?.payload) }}</pre>
        </el-descriptions-item>
        <el-descriptions-item v-if="currentLog?.response" :label="t('webHook.log.detail.response')" :span="2">
          <pre class="detail-pre">{{ currentLog.response }}</pre>
        </el-descriptions-item>
        <el-descriptions-item v-if="currentLog?.errorMsg" :label="t('webHook.log.detail.errorMsg')" :span="2">
          <pre class="detail-pre text-danger">{{ currentLog.errorMsg }}</pre>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" @click="detailOpen = false">{{ t('common.confirm') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="SysWebHookLog">
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import { listWebHookLog, delWebHookLog, cleanWebHookLog, retryWebHookLog, exportWebHookLog } from '@/api/system/webHook'
import type { SysWebHookLog } from '@/types/api/system/webHook'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'
import type { WebHookLogQueryParams } from '@/types/api/system/webHook'

const { t } = useI18n()
const queryRef = useTemplateRef('queryRef')
const { sys_common_status } = useDict('sys_common_status')

const logList = shallowRef<SysWebHookLog[]>([])
const loading = ref<boolean>(true)
const showSearch = ref<boolean>(true)
const ids = ref<number[]>([])
const cleanLoading = ref(false)
const multiple = ref<boolean>(true)
const total = ref<number>(0)
const detailOpen = ref(false)
const currentLog = ref<SysWebHookLog | null>(null)

const data = reactive({
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    eventType: undefined,
    status: undefined
  } as WebHookLogQueryParams & { pageNum: number; pageSize: number }
})

const { queryParams } = toRefs(data)

function statusLabel(status?: string): string {
  return status === '0' ? t('webHook.log.status.success') : t('webHook.log.status.fail')
}

function formatPayload(payload: string | null | undefined): string {
  if (!payload) return '-'
  try {
    return JSON.stringify(JSON.parse(payload), null, 2)
  } catch {
    return payload
  }
}

/** 查询推送记录列表 */
function getList() {
  loading.value = true
  listWebHookLog(queryParams.value)
    .then((response) => {
      logList.value = response.rows
      total.value = response.total
    })
    .catch((e) => {
      if (import.meta.env.DEV) console.error(e)
      modal.msgError(t('common.requestFailed'))
    })
    .finally(() => {
      loading.value = false
    })
}

// 返回按钮
function handleClose() {
  tab.closeOpenPage({ path: '/system/webHook' })
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

/** 重置按钮操作 */
function resetQuery() {
  queryRef.value?.resetFields()
  handleQuery()
}

// 多选框选中数据
function handleSelectionChange(selection: SysWebHookLog[]) {
  ids.value = selection.map((item) => item.id!)
  multiple.value = !selection.length
}

/** 详情按钮操作 */
function handleView(row: SysWebHookLog) {
  currentLog.value = { ...row }
  detailOpen.value = true
}

/** 删除按钮操作 */
function handleDelete() {
  modal
    .confirm(t('webHook.log.tip.confirmDelete', { ids: ids.value }))
    .then(() => delWebHookLog(ids.value))
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}

/** 清空按钮操作 */
function handleClean() {
  cleanLoading.value = true
  modal
    .confirm(t('webHook.log.tip.confirmClean'))
    .then(() => cleanWebHookLog())
    .then(() => {
      getList()
      modal.msgSuccess(t('webHook.log.cleanSuccess'))
    })
    .catch(() => {})
    .finally(() => {
      cleanLoading.value = false
    })
}

/** 重试按钮操作 */
function handleRetry() {
  modal
    .confirm(t('webHook.log.tip.confirmRetry', { ids: ids.value }))
    .then(() => retryWebHookLog(ids.value))
    .then(() => {
      modal.msgSuccess(t('webHook.log.retrySuccess'))
      getList()
    })
    .catch(() => {})
}

/** 导出按钮操作 */
function handleExport() {
  exportWebHookLog({ ...queryParams.value })
}

getList()
</script>

<style lang="scss" scoped>
.detail-pre {
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 260px;
  overflow: auto;
}
.text-danger {
  color: var(--el-color-danger);
}
</style>
