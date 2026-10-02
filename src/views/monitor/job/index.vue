<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('job.search.jobName')" prop="jobName">
          <el-input
            v-model="queryParams.jobName"
            :placeholder="t('job.search.phJobName')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('job.search.jobGroup')" prop="jobGroup">
          <el-select
            v-model="queryParams.jobGroup"
            :placeholder="t('job.search.phJobGroup')"
            clearable
            class="w-[200px]"
          >
            <el-option v-for="dict in sys_job_group" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('job.search.status')" prop="status">
          <el-select v-model="queryParams.status" :placeholder="t('job.search.phStatus')" clearable class="w-[200px]">
            <el-option v-for="dict in sys_job_status" :key="dict.value" :label="dict.label" :value="dict.value" />
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['monitor:job:add']">
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
          v-hasPermi="['monitor:job:edit']"
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
          v-hasPermi="['monitor:job:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['monitor:job:export']">
          {{ t('common.export') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="info" plain icon="Operation" @click="handleJobLog()" v-hasPermi="['monitor:job:list']">
          {{ t('job.btn.log') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysJob) => row.jobId"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column :label="t('job.column.id')" width="100" align="center" prop="jobId" />
      <el-table-column :label="t('job.column.name')" align="center" show-overflow-tooltip min-width="140">
        <template #default="scope">
          <el-link type="primary" underline="never" @click="handleView(scope.row)">
            {{ scope.row.jobName }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column :label="t('job.column.group')" align="center" prop="jobGroup">
        <template #default="scope">
          <dict-tag :options="sys_job_group" :value="scope.row.jobGroup" />
        </template>
      </el-table-column>
      <el-table-column :label="t('job.column.target')" align="center" prop="invokeTarget" show-overflow-tooltip />
      <el-table-column :label="t('job.column.cron')" align="center" prop="cronExpression" show-overflow-tooltip />
      <el-table-column :label="t('job.column.status')" align="center">
        <template #default="scope">
          <el-switch
            v-hasPermi="['monitor:job:changeStatus']"
            v-model="scope.row.status"
            active-value="0"
            inactive-value="1"
            @change="handleStatusChange(scope.row)"
          ></el-switch>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="200"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-tooltip :content="t('common.edit')" placement="top">
            <el-button
              link
              type="primary"
              icon="Edit"
              :aria-label="t('common.edit')"
              @click="handleUpdate(scope.row)"
              v-hasPermi="['monitor:job:edit']"
            ></el-button>
          </el-tooltip>
          <el-tooltip :content="t('common.delete')" placement="top">
            <el-button
              link
              type="primary"
              icon="Delete"
              :aria-label="t('common.delete')"
              @click="handleDelete(scope.row)"
              v-hasPermi="['monitor:job:remove']"
            ></el-button>
          </el-tooltip>
          <el-tooltip :content="t('job.tip.executeOnce')" placement="top">
            <el-button
              link
              type="primary"
              icon="CaretRight"
              :aria-label="t('job.runOnce')"
              @click="handleRun(scope.row)"
              v-hasPermi="['monitor:job:changeStatus']"
            ></el-button>
          </el-tooltip>
          <el-tooltip :content="t('jobLog.title')" placement="top">
            <el-button
              link
              type="primary"
              icon="Operation"
              :aria-label="t('job.jobLog')"
              @click="handleJobLog(scope.row)"
              v-hasPermi="['monitor:job:list']"
            ></el-button>
          </el-tooltip>
        </template>
      </el-table-column>
    </el-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />

    <!-- 添加或修改定时任务对话框 -->
    <el-dialog :title="title"  :before-close="beforeDialogClose" v-model="open" width="min(80%, 820px)" append-to-body destroy-on-close>
      <el-form ref="jobRef" :model="form" :rules="rules" label-width="120px">
        <el-row>
          <el-col :span="12">
            <el-form-item :label="t('job.form.jobName')" prop="jobName">
              <el-input v-model="form.jobName" :placeholder="t('job.form.phJobName')" :maxlength="64" show-word-limit />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('job.form.jobGroup')" prop="jobGroup">
              <el-select v-model="form.jobGroup" :placeholder="t('common.form.selectPlaceholder')">
                <el-option
                  v-for="dict in sys_job_group"
                  :key="dict.value"
                  :label="dict.label"
                  :value="dict.value"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item prop="invokeTarget">
              <template #label>
                <span>
                  {{ t('job.form.invokeTargetLabel') }}
                  <el-tooltip placement="top">
                    <template #content>
                      <div v-html="t('job.form.invokeTargetTip')"></div>
                    </template>
                    <el-icon><question-filled /></el-icon>
                  </el-tooltip>
                </span>
              </template>
              <el-input v-model="form.invokeTarget" :placeholder="t('job.form.phInvokeTarget')" />
            </el-form-item>
          </el-col>
          <el-col :span="24">
            <el-form-item :label="t('job.form.cronExpressionLabel')" prop="cronExpression">
              <el-input v-model="form.cronExpression" :placeholder="t('job.form.phCronExpression')">
                <template #append>
                  <el-button type="primary" @click="handleShowCron">
                    {{ t('job.form.genExpression') }}
                    <el-icon class="el-icon--right"><Clock /></el-icon>
                  </el-button>
                </template>
              </el-input>
            </el-form-item>
          </el-col>
          <Transition name="expand-fade">
            <el-col :span="24" v-if="form.jobId !== undefined">
              <el-form-item :label="t('job.form.status')">
                <el-radio-group v-model="form.status">
                  <el-radio v-for="dict in sys_job_status" :key="dict.value" :value="dict.value">
                    {{ dict.label }}
                  </el-radio>
                </el-radio-group>
              </el-form-item>
            </el-col>
          </Transition>
          <el-col :span="12">
            <el-form-item :label="t('job.form.misfirePolicy')" prop="misfirePolicy">
              <el-radio-group v-model="form.misfirePolicy">
                <el-radio-button value="1">{{ t('job.tip.executeImmediate') }}</el-radio-button>
                <el-radio-button value="2">{{ t('job.tip.executeOnce') }}</el-radio-button>
                <el-radio-button value="3">{{ t('job.tip.abandon') }}</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('job.form.concurrent')" prop="concurrent">
              <el-radio-group v-model="form.concurrent">
                <el-radio-button value="0">{{ t('job.tip.allowConcurrent') }}</el-radio-button>
                <el-radio-button value="1">{{ t('job.tip.forbidConcurrent') }}</el-radio-button>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">{{ t('common.confirm') }}</el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <el-dialog :title="t('job.cronTitle')" v-model="openCron" append-to-body destroy-on-close>
      <crontab ref="crontabRef" @hide="openCron = false" @fill="crontabFill" :expression="expression"></crontab>
    </el-dialog>

    <!-- 任务日志详细 -->
    <job-detail v-model:visible="openView" :row="form" type="job" />
  </div>
</template>

<script setup lang="ts" name="Job">
import JobDetail from './detail.vue'
import Crontab from '@/components/Crontab/index.vue'
import { Clock } from '@element-plus/icons-vue'
import { listJob, getJob, delJob, addJob, updateJob, runJob, changeJobStatus } from '@/api/monitor/job'
import { useCrudTable } from '@/composables/useCrudTable'
import modal from '@/plugins/modal'
import type { JobQueryParams, SysJob } from '@/types/api/monitor/job'

const { t } = useI18n()
const router = useRouter()
const queryRef = useTemplateRef('queryRef')
const jobRef = useTemplateRef('jobRef')
const { sys_job_group, sys_job_status } = useDict('sys_job_group', 'sys_job_status')

const openView = ref<boolean>(false)
const openCron = ref<boolean>(false)
const expression = ref<string>('')

const data = reactive({
  form: {} as SysJob,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    jobName: undefined,
    jobGroup: undefined,
    status: undefined
  } as JobQueryParams,
  rules: {
    jobName: [{ required: true, message: t('job.validate.jobNameRequired'), trigger: 'blur' }],
    invokeTarget: [{ required: true, message: t('job.validate.invokeTargetRequired'), trigger: 'blur' }],
    cronExpression: [{ required: true, message: t('job.validate.cronExpressionRequired'), trigger: 'change' }]
  }
})

const { queryParams, form, rules } = toRefs(data)

const {
  dataList,
  open,
  loading,
  submitLoading,
  showSearch,
  ids,
  single,
  multiple,
  total,
  title,
  getList,
  beforeDialogClose,
  cancel,
  reset,
  handleQuery,
  resetQuery,
  handleSelectionChange,
  handleExport
} = useCrudTable<SysJob, JobQueryParams>({
  listApi: listJob,
  getApi: getJob,
  addApi: addJob,
  updateApi: updateJob,
  deleteApi: delJob,
  idField: 'jobId',
  exportUrl: '/monitor/job/export',
  defaultForm: () => ({
    jobId: undefined,
    jobName: undefined,
    jobGroup: undefined,
    invokeTarget: undefined,
    cronExpression: undefined,
    misfirePolicy: '1',
    concurrent: '1',
    status: '0'
  }),
  titleKey: 'job.title',
  deleteTipKey: 'job.tip.confirmDelete',
  queryParams,
  form,
  formRef: jobRef,
  queryRef: queryRef
})

// 任务状态修改
function handleStatusChange(row: SysJob) {
  const text = row.status === '0' ? t('common.enabled') : t('common.disabled')
  modal
    .confirm(t('job.tip.confirmChange', { text: text, name: row.jobName }))
    .then(function () {
      return changeJobStatus(row.jobId!, row.status!)
    })
    .then(() => {
      modal.msgSuccess(text + t('common.success'))
    })
    .catch(function () {
      row.status = row.status === '0' ? '1' : '0'
    })
}

/* 立即执行一次 */
function handleRun(row: SysJob) {
  modal
    .confirm(t('job.tip.confirmRunOnce', { name: row.jobName }))
    .then(function () {
      return runJob(row.jobId!, row.jobGroup!)
    })
    .then(() => {
      modal.msgSuccess(t('job.tip.runOnceSuccess'))
    })
    .catch(() => {})
}

/** 任务详细信息 */
function handleView(row: SysJob) {
  getJob(row.jobId!)
    .then((response) => {
      form.value = response.data!
      openView.value = true
    })
    .catch(() => {})
}

/** cron表达式按钮操作 */
function handleShowCron() {
  expression.value = form.value.cronExpression || ''
  openCron.value = true
}

/** 确定后回传值 */
function crontabFill(value: string) {
  form.value.cronExpression = value
}

/** 任务日志列表查询 */
function handleJobLog(row?: SysJob) {
  const jobId = row?.jobId || 0
  router.push('/monitor/job-log/index/' + jobId)
}

/** 新增按钮操作 - 覆盖以使用 job.titleAdd */
function handleAdd() {
  reset()
  open.value = true
  title.value = t('job.titleAdd')
}

/** 修改按钮操作 - 覆盖以使用 job.titleEdit */
function handleUpdate(row?: SysJob) {
  reset()
  const jobId = row?.jobId || ids.value[0]
  if (!jobId) {
    modal.msgWarning(t('common.selectToEdit'))
    return
  }
  getJob(jobId)
    .then((response) => {
      form.value = response.data!
      open.value = true
      title.value = t('job.titleEdit')
    })
    .catch(() => {})
}

/** 提交按钮 */
function submitForm() {
  jobRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      if (form.value.jobId != undefined) {
        updateJob(form.value)
          .then(() => {
            modal.msgSuccess(t('common.editSuccess'))
            open.value = false
            getList()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      } else {
        addJob(form.value)
          .then(() => {
            modal.msgSuccess(t('common.addSuccess'))
            open.value = false
            getList()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      }
    }
  })
}

/** 删除按钮操作 */
function handleDelete(row?: SysJob) {
  const jobIds = row?.jobId || ids.value
  modal
    .confirm(t('job.tip.confirmDelete', { ids: jobIds }))
    .then(function () {
      return delJob(jobIds)
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}

getList()
</script>

<style scoped lang="scss">
:deep(.el-table__row) {
  transition: background-color 0.2s ease;
}
</style>
