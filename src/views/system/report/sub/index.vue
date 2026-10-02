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
          />
        </el-form-item>
        <el-form-item :label="t('common.column.status')" prop="status">
          <el-select
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

    <!-- 添加或修改订阅对话框 -->
    <el-dialog :title="title"  :before-close="beforeDialogClose" v-model="open" width="min(90%, 620px)" append-to-body destroy-on-close>
      <el-form ref="subRef" :model="form" :rules="rules" label-width="120px">
        <el-form-item :label="t('report.sub.form.subName')" prop="subName">
          <el-input v-model.trim="form.subName" :placeholder="t('report.sub.form.phSubName')" :maxlength="64" />
        </el-form-item>
        <el-form-item :label="t('report.sub.form.report')" prop="reportId">
          <el-select v-model="form.reportId" :placeholder="t('common.form.selectPlaceholder')" filterable>
            <el-option v-for="opt in reportOptions" :key="opt.reportId" :label="opt.reportName" :value="opt.reportId" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('report.sub.form.cron')" prop="cron">
          <div class="w-full">
            <el-input v-model.trim="form.cron" :placeholder="t('report.sub.form.phCron')" class="font-mono" />
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
import { listSub, getSub, delSub, addSub, updateSub, changeSubStatus, runSub, listReport } from '@/api/system/report'
import type { SysReportSub, SysReport } from '@/types/api/system/report'
import { useCrudTable } from '@/composables/useCrudTable'
import modal from '@/plugins/modal'

const { t } = useI18n()
const subRefRef = useTemplateRef('subRef')
const queryRefRef = useTemplateRef('queryRef')
const { sys_normal_disable } = useDict('sys_normal_disable')

// 可用报表选项（用于订阅表单选择报表）
const reportOptions = ref<SysReport[]>([])
function loadReportOptions() {
  listReport({ pageNum: 1, pageSize: 200 })
    .then((res) => {
      reportOptions.value = res.rows ?? []
    })
    .catch(() => {})
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
function handleStatusChange(row: SysReportSub) {
  changeSubStatus(row.subId!, row.status!)
    .then(() => modal.msgSuccess(t('common.success')))
    .catch(() => {
      row.status = row.status === '0' ? '1' : '0'
    })
}

// 立即推送
function handleRun(row: SysReportSub) {
  modal
    .confirm(t('report.sub.tip.confirmRun', { name: row.subName }))
    .then(() => runSub(row.subId!))
    .then(() => modal.msgSuccess(t('report.sub.tip.runSuccess')))
    .catch(() => {})
}

loadReportOptions()
getList()
</script>

<style lang="scss" scoped>
.font-mono :deep(textarea),
.font-mono :deep(.el-textarea__inner),
.font-mono :deep(.el-input__inner) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}
</style>
