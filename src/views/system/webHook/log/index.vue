<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="90px">
        <el-form-item :label="t('webHook.log.search.eventType')" prop="eventType">
          <el-input
            v-model="queryParams.eventType"
            :placeholder="t('webHook.log.search.phEventType')"
            :aria-label="t('webHook.log.search.eventType')"
            clearable
            class="w-[220px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('webHook.log.search.status')" prop="status">
          <el-select
            :aria-label="t('webHook.log.search.status')"
            v-model="queryParams.status"
            :placeholder="t('webHook.log.search.phStatus')"
            clearable
            class="w-[200px]"
          >
            <el-option v-for="dict in sys_common_status" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('webHook.log.search.createTime')" class="w-[308px]">
          <el-date-picker
            v-model="dateRange"
            value-format="YYYY-MM-DD HH:mm:ss"
            type="daterange"
            range-separator="-"
            :start-placeholder="t('common.form.startDate')"
            :end-placeholder="t('common.form.endDate')"
            :default-time="[new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 1, 1, 23, 59, 59)]"
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
        ref="logTableRef"
        v-loading="loading"
        :data="logList"
        :row-key="(row: SysWebHookLog) => row.id"
        @selection-change="handleSelectionChange"
        :default-sort="sortArrow"
        @sort-change="handleSortChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column
          :label="t('webHook.log.column.id')"
          width="90"
          align="center"
          prop="id"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('webHook.log.column.hookName')"
          align="center"
          prop="hookName"
          show-overflow-tooltip
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('webHook.log.column.eventType')"
          align="center"
          prop="eventType"
          show-overflow-tooltip
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="{ row }">{{ formatEventType(row.eventType) }}</template>
        </el-table-column>
        <el-table-column
          :label="t('webHook.log.column.targetUrl')"
          align="center"
          prop="targetUrl"
          min-width="220"
          show-overflow-tooltip
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('webHook.log.column.statusCode')"
          align="center"
          prop="statusCode"
          width="90"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('webHook.log.column.costMs')"
          align="center"
          prop="costMs"
          width="100"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('webHook.log.column.status')"
          align="center"
          prop="status"
          width="90"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <el-tag :type="scope.row.status === '0' ? 'success' : 'danger'" size="small">
              {{ statusLabel(scope.row.status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('webHook.log.column.createTime')"
          align="center"
          prop="createTime"
          width="180"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
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
          <list-empty :load-error="loadError" @retry="retryLoad" />
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
          {{ currentLog ? formatEventType(currentLog.eventType) : '' }}
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
          <pre
            class="m-0 max-h-[260px] overflow-auto rounded-md bg-[var(--el-fill-color-light)] p-2.5 text-xs leading-[1.6] whitespace-pre-wrap break-all"
            >{{ formatPayload(currentLog?.payload) }}</pre>
        </el-descriptions-item>
        <el-descriptions-item v-if="currentLog?.response" :label="t('webHook.log.detail.response')" :span="2">
          <pre
            class="m-0 max-h-[260px] overflow-auto rounded-md bg-[var(--el-fill-color-light)] p-2.5 text-xs leading-[1.6] whitespace-pre-wrap break-all"
            >{{ currentLog.response }}</pre>
        </el-descriptions-item>
        <el-descriptions-item v-if="currentLog?.errorMsg" :label="t('webHook.log.detail.errorMsg')" :span="2">
          <pre
            class="m-0 max-h-[260px] overflow-auto rounded-md bg-[var(--el-fill-color-light)] p-2.5 text-xs leading-[1.6] whitespace-pre-wrap break-all text-[var(--el-color-danger)]"
            >{{ currentLog.errorMsg }}</pre>
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
import { applySortChange } from '@/utils/sortDirection'
import { useSortArrow } from '@/composables/useSortArrow'
import { useMobileFilter } from '@/composables/useMobileFilter'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import { listWebHookLog, delWebHookLog, cleanWebHookLog, retryWebHookLog, exportWebHookLog } from '@/api/system/webHook'
import type { SysWebHookLog } from '@/types/api/system/webHook'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'
import { addDateRange } from '@/utils/stepby'
import type { WebHookLogQueryParams } from '@/types/api/system/webHook'
import type { FormInstance } from 'element-plus'
import { resetQueryDefaults, useCrudTable } from '@/composables/useCrudTable'

const { t, te } = useI18n()

/**
 * 事件键显示翻译（批次十九收尾：collect-warnings 实证 eventType 原始值如
 * `login.success` 形如 i18n 键被误判泄漏——本质是展示层未翻译）。
 * 约定：目录键 `a.b` → i18n `webHook.eventType.a_b`（点转下划线）；
 * te() 不存在的键（自定义事件名）如实显示原值，符合"目录外事件原样"语义。
 */
function formatEventType(key: string | null | undefined): string {
  if (!key) return ''
  const i18nKey = `webHook.eventType.${key.replaceAll('.', '_')}`
  return te(i18nKey) ? t(i18nKey) : key
}
const queryRef = useTemplateRef('queryRef')
const logTableRef = useTemplateRef('logTableRef')
const { sys_common_status } = useDict('sys_common_status')

const dateRange = ref<string[]>([])
const defaultSort = ref({ prop: 'createTime', order: 'descending' })

const queryParams = ref<WebHookLogQueryParams & { pageNum: number; pageSize: number }>({
  pageNum: 1,
  pageSize: 10,
  eventType: undefined,
  status: undefined,
  orderByColumn: undefined,
  isAsc: undefined
})

// 只读接入（仅 listApi + deleteApi）：列表/查询/多选/删除走 useCrudTable，
// 清空/重试/导出/关闭/详情保留手写；form 相关为契约占位（只读模式不暴露表单流程）
const {
  dataList: logList,
  loading,
  showSearch,
  ids,
  multiple,
  total,
  getList,
  loadError,
  retryLoad,
  handleQuery,
  handleDelete,
  handleSelectionChange
} = useCrudTable<SysWebHookLog, WebHookLogQueryParams & { pageNum: number; pageSize: number }>({
  listApi: (params) =>
    listWebHookLog(addDateRange({ ...params } as Record<string, unknown>, dateRange.value) as WebHookLogQueryParams),
  deleteApi: delWebHookLog,
  idField: 'id',
  defaultForm: () => ({}) as SysWebHookLog,
  titleKey: 'webHook.log.title',
  deleteTipKey: 'webHook.log.tip.confirmDelete',
  queryParams,
  form: ref<SysWebHookLog>({} as SysWebHookLog),
  formRef: ref<FormInstance | null>(null),
  queryRef,
  // 迁移等价性：原页面无 URL 查询同步，关闭以保持行为零变化
  syncQueryToUrl: false
})

// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter

const cleanLoading = ref(false)
const detailOpen = ref(false)
const currentLog = ref<SysWebHookLog | null>(null)

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

// 返回按钮
function handleClose() {
  tab.closeOpenPage({ path: '/system/webHook' })
}

/** 重置按钮操作（含时间范围与排序状态，保留手写：需恢复表格默认排序） */
function resetQuery() {
  dateRange.value = []
  queryParams.value.orderByColumn = undefined
  queryParams.value.isAsc = undefined
  queryRef.value?.resetFields()
  // 批六十四修复（F137⑤ 实证）：EP form-item initialValue 被「URL 同步 + fullPath 重挂载」
  // 污染为搜索值，resetFields 只会“重置回搜索值”——必须显式恢复页面定义的干净默认快照
  resetQueryDefaults(queryParams)
  handleQuery()
  logTableRef.value?.sort(defaultSort.value.prop, defaultSort.value.order)
}

/** 箭头由页面实际下发的排序参数派生（成因见 composables/useSortArrow） */
const sortArrow = useSortArrow(queryParams, () => defaultSort.value)

/** 排序触发事件（服务端排序：透传 orderByColumn/isAsc，保留手写以维持既有参数语义） */
function handleSortChange(column: { prop: string | null; order: string | null }) {
  applySortChange(queryParams.value, column)
  getList()
}

/** 详情按钮操作 */
function handleView(row: SysWebHookLog) {
  currentLog.value = { ...row }
  detailOpen.value = true
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
  exportWebHookLog(
    addDateRange({ ...queryParams.value } as Record<string, unknown>, dateRange.value) as WebHookLogQueryParams
  )
}

getList()
</script>
