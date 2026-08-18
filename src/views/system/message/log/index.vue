<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('msg.log.search.toAddr')" prop="toAddr">
          <el-input
            v-model="queryParams.toAddr"
            :placeholder="t('msg.log.search.phToAddr')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('msg.log.search.templateCode')" prop="templateCode">
          <el-input
            v-model="queryParams.templateCode"
            :placeholder="t('msg.log.search.phTemplateCode')"
            clearable
            class="w-[160px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('msg.log.search.channelCode')" prop="channelCode">
          <el-input
            v-model="queryParams.channelCode"
            :placeholder="t('msg.log.search.phChannelCode')"
            clearable
            class="w-[140px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('common.column.status')" prop="status">
          <el-select
            v-model="queryParams.status"
            :placeholder="t('msg.log.search.phStatus')"
            clearable
            class="w-[140px]"
          >
            <el-option v-for="opt in logStatusOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
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
          v-hasPermi="['system:msg:log:remove']"
        >
          {{ t('common.delete') }}
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
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysMsgSendLog) => row.logId"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column
        :label="t('msg.log.column.templateCode')"
        align="center"
        prop="templateCode"
        width="120"
        show-overflow-tooltip
      />
      <el-table-column :label="t('msg.log.column.channelCode')" align="center" prop="channelCode" width="100">
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
      />
      <el-table-column
        :label="t('msg.log.column.subject')"
        align="center"
        prop="subject"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column :label="t('msg.log.column.status')" align="center" prop="status" width="90">
        <template #default="scope">
          <dict-tag :options="logStatusOptions" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column :label="t('msg.log.column.retry')" align="center" width="110">
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
      <el-table-column :label="t('msg.log.column.sendTime')" align="center" prop="sendTime" width="170" />
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
        <el-empty :description="t('common.empty')" />
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
import { listSendLog, delSendLog, cleanSendLog, retrySendLog } from '@/api/system/msg'
import type { SysMsgSendLog, SendLogQueryParams } from '@/types/api/system/msg'
import modal from '@/plugins/modal'

const { t } = useI18n()
const queryRefRef = useTemplateRef('queryRef')

const dataList = shallowRef<SysMsgSendLog[]>([])
const loading = ref(true)
const showSearch = ref(true)
const total = ref(0)
const ids = ref<Array<string | number>>([])
const multiple = ref(true)

const queryParams = reactive<SendLogQueryParams>({
  pageNum: 1,
  pageSize: 10,
  toAddr: undefined,
  templateCode: undefined,
  channelCode: undefined,
  status: undefined
})

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

/** 查询列表 */
function getList(): void {
  loading.value = true
  listSendLog(queryParams)
    .then((resp) => {
      dataList.value = resp.rows
      total.value = resp.total
    })
    .finally(() => {
      loading.value = false
    })
}

/** 搜索 */
function handleQuery(): void {
  queryParams.pageNum = 1
  getList()
}

/** 重置 */
function resetQuery(): void {
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 多选 */
function handleSelectionChange(selection: SysMsgSendLog[]): void {
  ids.value = selection.map((item) => item.logId as string | number)
  multiple.value = !selection.length
}

/** 删除（批量） */
function handleDelete(): void {
  if (!ids.value.length) return
  modal
    .confirm(t('msg.log.tip.confirmDelete', { ids: ids.value }))
    .then(() => delSendLog(ids.value))
    .then(() => {
      getList()
      ids.value = []
      multiple.value = true
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch((e: unknown) => {
      if (import.meta.env.DEV && e instanceof Error) console.error('[MsgLog] delete:', e)
    })
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

getList()
</script>
