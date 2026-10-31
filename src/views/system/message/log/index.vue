<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('msg.log.search.toAddr')" prop="toAddr">
          <el-input
            v-model="queryParams.toAddr"
            :placeholder="t('msg.log.search.phToAddr')"
            :aria-label="t('msg.log.search.toAddr')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('msg.log.search.templateCode')" prop="templateCode">
          <el-input
            v-model="queryParams.templateCode"
            :placeholder="t('msg.log.search.phTemplateCode')"
            :aria-label="t('msg.log.search.templateCode')"
            clearable
            class="w-[160px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('msg.log.search.channelCode')" prop="channelCode">
          <el-input
            v-model="queryParams.channelCode"
            :placeholder="t('msg.log.search.phChannelCode')"
            :aria-label="t('msg.log.search.channelCode')"
            clearable
            class="w-[140px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('common.column.status')" prop="status">
          <el-select
            :aria-label="t('common.column.status')"
            v-model="queryParams.status"
            :placeholder="t('msg.log.search.phStatus')"
            clearable
            class="w-[140px]"
          >
            <el-option v-for="opt in logStatusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('msg.log.search.sendTime')" class="w-[308px]">
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
          v-hasPermi="['system:msg:log:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <!-- 标记待重试：把选中的**失败终态**记录交回重试队列（成功记录由后端跳过，
             不会被重复投递）；与单条「重试」同权限键 system:msg:log:retry -->
        <el-button
          type="warning"
          plain
          icon="RefreshRight"
          :disabled="multiple"
          @click="handleMarkPending"
          v-hasPermi="['system:msg:log:retry']"
        >
          {{ t('msg.log.btn.markPending') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Delete" @click="handleClean" v-hasPermi="['system:msg:log:clean']">
          {{ t('msg.log.btn.clean') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      ref="tableRef"
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysMsgSendLog) => row.logId"
      @selection-change="handleSelectionChange"
      :default-sort="sortArrow"
      @sort-change="handleSortChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column
        :label="t('msg.log.column.templateCode')"
        align="center"
        prop="templateCode"
        width="120"
        show-overflow-tooltip
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      />
      <el-table-column
        :label="t('msg.log.column.channelCode')"
        align="center"
        prop="channelCode"
        width="100"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      >
        <template #default="scope">
          <dict-tag :options="channelTypeOptions" :value="scope.row.channelCode" />
        </template>
      </el-table-column>
      <el-table-column
        :label="t('msg.log.column.toAddr')"
        align="center"
        prop="toAddr"
        min-width="150"
        show-overflow-tooltip
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      />
      <el-table-column
        :label="t('msg.log.column.subject')"
        align="center"
        prop="subject"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('msg.log.column.status')"
        align="center"
        prop="status"
        width="90"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      >
        <template #default="scope">
          <dict-tag :options="logStatusOptions" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column
        :label="t('msg.log.column.retry')"
        align="center"
        prop="retryCount"
        width="110"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      >
        <template #default="scope">
          <span v-if="scope.row.status !== '0'">
            {{ scope.row.retryCount ?? 0 }} / {{ scope.row.maxRetryCount ?? '∞' }}
          </span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('msg.log.column.lastError')"
        align="center"
        prop="lastError"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('msg.log.column.sendTime')"
        align="center"
        prop="sendTime"
        width="170"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      />
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="100"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="RefreshRight"
            :disabled="scope.row.status === '0'"
            @click="handleRetry(scope.row)"
            v-hasPermi="['system:msg:log:retry']"
          >
            {{ t('msg.log.btn.retry') }}
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <list-empty :load-error="loadError" @retry="retryLoad" />
      </template>
    </el-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />
  </div>
</template>

<script setup lang="ts" name="MsgLog">
import { applySortChange } from '@/utils/sortDirection'
import { useSortArrow } from '@/composables/useSortArrow'
import { listSendLog, delSendLog, cleanSendLog, retrySendLog, markPendingSendLog } from '@/api/system/msg'
import type { SysMsgSendLog, SendLogQueryParams } from '@/types/api/system/msg'
import type { AjaxResult } from '@/types'
import type { FormInstance } from 'element-plus'
import modal from '@/plugins/modal'
import { addDateRange } from '@/utils/stepby'
import { useMobileFilter } from '@/composables/useMobileFilter'
import { resetQueryDefaults, useCrudTable } from '@/composables/useCrudTable'

const { t } = useI18n()
const queryRefRef = useTemplateRef('queryRef')
const tableRef = useTemplateRef('tableRef')

const dateRange = ref<string[]>([])
const defaultSort = ref({ prop: 'sendTime', order: 'descending' })

const queryParams = ref<SendLogQueryParams>({
  pageNum: 1,
  pageSize: 10,
  toAddr: undefined,
  templateCode: undefined,
  channelCode: undefined,
  status: undefined,
  orderByColumn: undefined,
  isAsc: undefined
})

// 只读接入（仅 listApi + deleteApi）：列表/查询/多选/删除走 useCrudTable，
// 清空/重试/排序/时间范围过滤保留手写；form 相关为契约占位（只读模式不暴露表单流程）
const {
  dataList,
  loading,
  showSearch,
  multiple,
  ids,
  total,
  getList,
  loadError,
  retryLoad,
  handleQuery,
  handleDelete,
  handleSelectionChange
} = useCrudTable<SysMsgSendLog, SendLogQueryParams>({
  listApi: (params) =>
    listSendLog(addDateRange({ ...params } as Record<string, unknown>, dateRange.value) as SendLogQueryParams),
  deleteApi: delSendLog,
  idField: 'logId',
  defaultForm: () => ({}) as SysMsgSendLog,
  titleKey: 'msg.log.title',
  deleteTipKey: 'msg.log.tip.confirmDelete',
  queryParams,
  form: ref<SysMsgSendLog>({} as SysMsgSendLog),
  formRef: ref<FormInstance | null>(null),
  queryRef: queryRefRef,
  // 迁移等价性：原页面无 URL 查询同步，关闭以保持行为零变化
  syncQueryToUrl: false
})

// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter

// 渠道类型选项（email/sms/site）
const channelTypeOptions = [
  { value: 'email', label: t('msg.channel.type.email') },
  { value: 'sms', label: t('msg.channel.type.sms') },
  { value: 'site', label: t('msg.channel.type.site') }
]

// 发送状态选项
const logStatusOptions = [
  { value: '0', label: t('msg.log.status.success'), type: 'success' },
  { value: '1', label: t('msg.log.status.fail'), type: 'danger' },
  { value: '2', label: t('msg.log.status.pending'), type: 'warning' }
]

/** 重置（含时间范围与排序状态，保留手写：需恢复表格默认排序） */
function resetQuery(): void {
  dateRange.value = []
  queryParams.value.orderByColumn = undefined
  queryParams.value.isAsc = undefined
  queryRefRef.value?.resetFields()
  // 批六十四修复（F137⑤ 实证）：EP form-item initialValue 被「URL 同步 + fullPath 重挂载」
  // 污染为搜索值，resetFields 只会“重置回搜索值”——必须显式恢复页面定义的干净默认快照
  resetQueryDefaults(queryParams)
  handleQuery()
  tableRef.value?.sort(defaultSort.value.prop, defaultSort.value.order)
}

/** 箭头由页面实际下发的排序参数派生（成因见 composables/useSortArrow） */
const sortArrow = useSortArrow(queryParams, () => defaultSort.value)

/** 排序触发事件（服务端排序：透传 orderByColumn/isAsc，保留手写以维持既有参数语义） */
function handleSortChange(column: { prop: string | null; order: string | null }): void {
  applySortChange(queryParams.value, column)
  getList()
}

/** 清空 */
function handleClean(): void {
  modal
    .confirm(t('msg.log.tip.confirmClean'))
    .then(() => cleanSendLog())
    .then(() => {
      getList()
      modal.msgSuccess(t('msg.log.cleanSuccess'))
    })
    .catch((e: unknown) => {
      if (import.meta.env.DEV && e instanceof Error) console.error('[MsgLog] clean:', e)
    })
}

/** 单条重试（仅状态 待重试/失败） */
function handleRetry(row: SysMsgSendLog): void {
  if (row.status === '0' || !row.logId) return
  modal
    .confirm(t('msg.log.tip.confirmRetry', { logId: row.logId }))
    .then(() => retrySendLog(row.logId as number))
    .then(() => {
      modal.msgSuccess(t('msg.log.retrySuccess'))
      getList()
    })
    .catch((e: unknown) => {
      if (import.meta.env.DEV && e instanceof Error) console.error('[MsgLog] retry:', e)
    })
}

/** 批量标记待重试：把选中记录交回重试队列（后端仅改判 status='1' 的失败终态行） */
function handleMarkPending(): void {
  const selected: Array<string | number> = ids.value.filter(
    (x: string | number) => x !== '' && x !== null && x !== undefined
  )
  if (!selected.length) return
  modal
    .confirm(t('msg.log.tip.confirmMarkPending', { count: selected.length }))
    .then(() => markPendingSendLog(selected.join(',')))
    .then((res: AjaxResult<number>) => {
      // data = 真正交回队列的条数：混选成功记录时该值小于选中数，必须如实提示
      modal.msgSuccess(t('msg.log.markPendingSuccess', { count: Number(res?.data ?? 0) }))
      getList()
    })
    .catch((e: unknown) => {
      if (import.meta.env.DEV && e instanceof Error) console.error('[MsgLog] markPending:', e)
    })
}

getList()
</script>
