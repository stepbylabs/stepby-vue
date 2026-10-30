<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('report.sub.search.subName')" prop="subName">
          <el-input
            v-model="queryParams.subName"
            :placeholder="t('report.sub.search.phSubName')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
            :aria-label="t('report.sub.search.phSubName')"
          />
        </el-form-item>
        <el-form-item :label="t('common.column.status')" prop="status">
          <el-select
            :aria-label="t('common.column.status')"
            v-model="queryParams.status"
            :placeholder="t('report.sub.search.phStatus')"
            clearable
            class="w-[200px]"
          >
            <el-option v-for="dict in sys_normal_disable" :key="dict.value" :label="dict.label" :value="dict.value" />
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:report:sub:add']">
          {{ t('common.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate"
          v-hasPermi="['system:report:sub:edit']"
        >
          {{ t('common.edit') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :disabled="multiple"
          @click="handleDelete"
          v-hasPermi="['system:report:sub:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysReportSub) => row.subId"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column
        :label="t('report.sub.column.subName')"
        align="center"
        prop="subName"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column :label="t('report.sub.column.reportId')" align="center" prop="reportId" width="90" />
      <el-table-column
        :label="t('report.sub.column.cron')"
        align="center"
        prop="cron"
        width="170"
        show-overflow-tooltip
      />
      <el-table-column :label="t('report.sub.column.receivers')" align="center" min-width="180">
        <template #default="scope">
          <span class="text-text-secondary">
            <template v-if="scope.row.pushEmail === '1'">{{ scope.row.receiveEmail || '-' }}</template>
            <template v-if="scope.row.pushEmail === '1' && scope.row.pushSysMsg === '1'">/</template>
            <template v-if="scope.row.pushSysMsg === '1'">{{ scope.row.receiveUserIds || '-' }}</template>
            <template v-if="scope.row.pushEmail !== '1' && scope.row.pushSysMsg !== '1'">-</template>
          </span>
        </template>
      </el-table-column>
      <el-table-column :label="t('report.sub.column.status')" align="center" width="90">
        <template #default="scope">
          <el-switch
            v-model="scope.row.status"
            :loading="statusLoadingIds.includes(scope.row.subId!)"
            active-value="0"
            inactive-value="1"
            @change="handleStatusChange(scope.row)"
            v-hasPermi="['system:report:sub:status']"
          ></el-switch>
        </template>
      </el-table-column>
      <el-table-column :label="t('report.sub.column.lastRunTime')" align="center" prop="lastRunTime" width="170" />
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="210"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Promotion"
            :loading="runningIds.includes(scope.row.subId)"
            :disabled="runningIds.includes(scope.row.subId)"
            @click="handleRun(scope.row)"
            v-hasPermi="['system:report:sub:run']"
          >
            {{ t('report.sub.btn.run') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row)"
            v-hasPermi="['system:report:sub:edit']"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['system:report:sub:remove']"
          >
            {{ t('common.delete') }}
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

    <!-- 添加或修改订阅对话框 -->
    <el-dialog
      :title="title"
      :before-close="beforeDialogClose"
      v-model="open"
      width="min(90%, 620px)"
      append-to-body
      destroy-on-close
    >
      <el-form ref="subRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item :label="t('report.sub.form.subName')" prop="subName">
          <el-input
            v-model.trim="form.subName"
            :placeholder="t('report.sub.form.phSubName')"
            :maxlength="64"
            :aria-label="t('report.sub.form.phSubName')"
          />
        </el-form-item>
        <el-form-item :label="t('report.sub.form.report')" prop="reportId">
          <div class="w-full">
            <el-select
              :aria-label="t('report.sub.form.report')"
              v-model="form.reportId"
              :placeholder="t('common.form.selectPlaceholder')"
              :loading="reportOptionsLoading"
              filterable
              remote
              :remote-method="searchReports"
              class="w-full"
            >
              <el-option
                v-for="opt in reportOptions"
                :key="opt.reportId"
                :label="opt.reportName"
                :value="opt.reportId"
              />
            </el-select>
            <div
              v-if="reportOptionsError"
              class="mt-1 text-xs leading-snug text-[var(--el-color-danger)]"
              data-test="report-options-error"
            >
              {{ t('report.sub.reportOptionsFailed') }}
              <el-button link type="primary" size="small" @click="retryReportOptions">
                {{ t('common.retry') }}
              </el-button>
            </div>
            <div
              v-else-if="reportOptionsTruncated"
              class="mt-1 text-xs leading-snug text-[var(--el-color-warning)]"
              data-test="report-options-truncated"
            >
              {{ t('common.optionsTruncated', { count: reportOptions.length, total: reportTotal }) }}
            </div>
          </div>
        </el-form-item>
        <el-form-item :label="t('report.sub.form.cron')" prop="cron">
          <div class="w-full">
            <el-input
              v-model.trim="form.cron"
              :placeholder="t('report.sub.form.phCron')"
              class="font-mono"
              :aria-label="t('report.sub.form.phCron')"
            />
            <div class="mt-1 text-xs text-text-secondary">{{ t('report.sub.form.cronTip') }}</div>
          </div>
        </el-form-item>
        <el-form-item :label="t('report.sub.form.channels')" prop="channels">
          <el-checkbox-group v-model="channels">
            <el-checkbox value="email">{{ t('report.sub.channel.email') }}</el-checkbox>
            <el-checkbox value="site">{{ t('report.sub.channel.site') }}</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
        <el-form-item v-if="channels.includes('email')" :label="t('report.sub.form.receiveEmail')" prop="receiveEmail">
          <el-input
            v-model="form.receiveEmail"
            type="textarea"
            :rows="3"
            :placeholder="t('report.sub.form.phReceiveEmail')"
            :aria-label="t('report.sub.form.phReceiveEmail')"
          />
        </el-form-item>
        <el-form-item
          v-if="channels.includes('site')"
          :label="t('report.sub.form.receiveUserIds')"
          prop="receiveUserIds"
        >
          <el-input
            v-model="form.receiveUserIds"
            type="textarea"
            :rows="3"
            :placeholder="t('report.sub.form.phReceiveUserIds')"
            :aria-label="t('report.sub.form.phReceiveUserIds')"
          />
        </el-form-item>
        <el-form-item :label="t('report.sub.form.status')">
          <el-switch
            v-model="form.status"
            active-value="0"
            inactive-value="1"
            :active-text="t('common.enabled')"
            :inactive-text="t('common.disabled')"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">{{ t('common.confirm') }}</el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="SysReportSub">
import {
  listSub,
  getSub,
  getReport,
  delSub,
  addSub,
  updateSub,
  changeSubStatus,
  runSub,
  listReport
} from '@/api/system/report'
import type { SysReportSub, SysReport } from '@/types/api/system/report'
import { useCrudTable } from '@/composables/useCrudTable'
import { useMobileFilter } from '@/composables/useMobileFilter'
import { useRowActionGuard } from '@/composables/useRowActionGuard'
import { useRemoteOptions } from '@/composables/useRemoteOptions'
import modal from '@/plugins/modal'

const { t } = useI18n()
const subRefRef = useTemplateRef('subRef')
const queryRefRef = useTemplateRef('queryRef')
const { sys_normal_disable } = useDict('sys_normal_disable')

// 可用报表选项（用于订阅表单选择报表）
// b134：失败/截断/后发先回统一由 useRemoteOptions 收口。此前 pageSize=200 被服务端钳到 100，
// catch 静默后下拉为空，用户以为"没有可选报表"；截断也无人提示。
const {
  options: reportOptions,
  loading: reportOptionsLoading,
  loadError: reportOptionsError,
  total: reportTotal,
  truncated: reportOptionsTruncated,
  search: searchReports,
  retry: retryReportOptions
} = useRemoteOptions<SysReport>((keyword, pageNum, pageSize) =>
  listReport({ pageNum, pageSize, reportName: keyword || undefined })
)

/**
 * 打开对话框时刷新候选，并为"编辑一条不在第一页的报表"补上它自己的标签：
 * 只靠首屏 100 条会让 v-model 的 reportId 显示成裸 ID（数据没错，但用户看不出选的是哪条）。
 */
async function ensureReportOption(): Promise<void> {
  await searchReports('')
  const id = form.value.reportId
  if (!id || reportOptions.value.some((o: SysReport) => o.reportId === id)) return
  try {
    const res = await getReport(id)
    const hit = res.data
    if (hit?.reportId) reportOptions.value = [hit, ...reportOptions.value]
  } catch {
    // 拦截器已提示；标签回落成 ID，不影响提交
  }
}

const channels = ref<string[]>([])

const data = reactive({
  form: {} as SysReportSub,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    subName: undefined,
    status: undefined
  },
  rules: {
    subName: [{ required: true, message: t('report.sub.validate.subNameRequired'), trigger: 'blur' }],
    reportId: [{ required: true, message: t('report.sub.validate.reportRequired'), trigger: 'change' }],
    cron: [{ required: true, message: t('report.sub.validate.cronRequired'), trigger: 'blur' }]
  }
})

const { queryParams, form, rules } = toRefs(data)

const {
  dataList,
  open,
  loading,
  submitLoading,
  showSearch,
  single,
  multiple,
  total,
  title,
  getList,
  loadError,
  retryLoad,
  beforeDialogClose,
  cancel,
  handleQuery,
  resetQuery,
  handleSelectionChange,
  handleAdd,
  handleUpdate,
  submitForm: crudSubmitForm,
  handleDelete
} = useCrudTable<SysReportSub, { pageNum: number; pageSize: number; [key: string]: unknown }>({
  listApi: listSub,
  getApi: getSub,
  addApi: addSub,
  updateApi: updateSub,
  deleteApi: delSub,
  idField: 'subId',
  defaultForm: () => ({
    subId: undefined,
    reportId: undefined,
    subName: undefined,
    cron: '0 0 9 * * *',
    pushEmail: '1',
    receiveEmail: undefined,
    pushSysMsg: '0',
    receiveUserIds: undefined,
    status: '0',
    remark: undefined
  }),
  titleKey: 'report.sub.title',
  deleteTipKey: 'report.sub.tip.confirmDeleteBatch',
  queryParams,
  form,
  formRef: subRefRef,
  queryRef: queryRefRef
})

// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter

// 打开对话框（新增/编辑）时刷新报表候选，并确保当前选中项有可见标签
watch(open, (val: boolean) => {
  if (val) void ensureReportOption()
})

// 表单数据与渠道勾选同步：打开新增时默认邮件；修改时按提交内容回填
watch(
  () => form.value,
  (val: SysReportSub) => {
    channels.value = [
      ...(val.pushEmail === '1' ? ['email' as const] : []),
      ...(val.pushSysMsg === '1' ? ['site' as const] : [])
    ]
  },
  { deep: true, immediate: true }
)

// 提交前将渠道勾选同步到表单字段
function submitForm() {
  form.value.pushEmail = channels.value.includes('email') ? '1' : '0'
  form.value.pushSysMsg = channels.value.includes('site') ? '1' : '0'
  if (form.value.pushEmail !== '1') form.value.receiveEmail = undefined
  if (form.value.pushSysMsg !== '1') form.value.receiveUserIds = undefined
  crudSubmitForm()
}

// 状态切换
/**
 * 启停切换（**行级**互斥 + 在途态 + 确认，b106）
 *
 * 原实现三缺：无确认框（误触即改订阅的推送状态）、无在途态（连点发两次方向相反的请求）、
 * 取消与失败同形（都只是翻回去，看不出到底发生了什么）。订阅停用会真的停掉定时投递。
 */
const { runningIds: statusLoadingIds, guarded: statusGuarded } = useRowActionGuard<number>()

async function handleStatusChange(row: SysReportSub): Promise<void> {
  const oldVal = row.status === '0' ? '1' : '0'
  const text = row.status === '0' ? t('common.enabled') : t('common.disabled')
  const executed = await statusGuarded(
    row.subId!,
    () => modal.confirm(t('report.sub.tip.confirmStatusChange', { text, name: row.subName })),
    async () => {
      try {
        await changeSubStatus(row.subId!, row.status!)
        modal.msgSuccess(t('common.success'))
      } catch (e) {
        row.status = oldVal
        throw e
      }
    }
  )
  if (!executed) row.status = oldVal
}

// 立即推送
/** 立即推送的互斥与 loading（连点不得重复投递，见 useRowActionGuard） */
const { runningIds, guarded } = useRowActionGuard<number>((id, e) => {
  if (import.meta.env.DEV) console.error('[report] run sub failed:', id, e)
})
async function handleRun(row: SysReportSub) {
  await guarded(
    row.subId!,
    () => modal.confirm(t('report.sub.tip.confirmRun', { name: row.subName })),
    async () => {
      await runSub(row.subId!)
      modal.msgSuccess(t('report.sub.tip.runSuccess'))
    }
  )
}

void searchReports('')
getList()
</script>

<style lang="scss" scoped>
.font-mono :deep(textarea),
.font-mono :deep(.el-textarea__inner),
.font-mono :deep(.el-input__inner) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}
</style>
