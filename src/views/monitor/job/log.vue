<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('job.search.jobName')" prop="jobName">
          <el-input
            v-model="queryParams.jobName"
            :placeholder="t('jobLog.search.phJobName')"
            :maxlength="64"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('job.search.jobGroup')" prop="jobGroup">
          <el-select
            v-model="queryParams.jobGroup"
            :placeholder="t('jobLog.search.phJobGroup')"
            clearable
            class="w-[240px]"
          >
            <el-option v-for="dict in sys_job_group" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('jobLog.search.execStatus')" prop="status">
          <el-select
            v-model="queryParams.status"
            :placeholder="t('jobLog.search.phExecStatus')"
            clearable
            class="w-[240px]"
          >
            <el-option v-for="dict in sys_common_status" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('jobLog.search.execTime')" class="w-[308px]">
          <el-date-picker
            v-model="dateRange"
            value-format="YYYY-MM-DD"
            type="daterange"
            range-separator="-"
            :start-placeholder="t('common.form.startDate')"
            :end-placeholder="t('common.form.endDate')"
          ></el-date-picker>
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
          v-hasPermi="['monitor:job:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="Delete"
          :loading="cleanLoading"
          @click="handleClean"
          v-hasPermi="['monitor:job:remove']"
        >
          {{ t('common.clear') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['monitor:job:export']">
          {{ t('common.export') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Close" @click="handleClose">{{ t('common.close') }}</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="9" :rows="8" />
      <el-table
        v-else
        v-loading="loading"
        :data="jobLogList"
        :row-key="(row: SysJobLog) => row.jobLogId"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column :label="t('jobLog.column.jobLogId')" width="80" align="center" prop="jobLogId" />
        <el-table-column :label="t('job.column.name')" align="center" prop="jobName" show-overflow-tooltip />
        <el-table-column :label="t('job.column.group')" align="center" prop="jobGroup" show-overflow-tooltip>
          <template #default="scope">
            <dict-tag :options="sys_job_group" :value="scope.row.jobGroup" />
          </template>
        </el-table-column>
        <el-table-column :label="t('job.column.target')" align="center" prop="invokeTarget" show-overflow-tooltip />
        <el-table-column
          :label="t('jobLog.column.jobMessage')"
          align="center"
          prop="jobMessage"
          show-overflow-tooltip
        />
        <el-table-column :label="t('jobLog.column.status')" align="center" prop="status">
          <template #default="scope">
            <dict-tag :options="sys_common_status" :value="scope.row.status" />
          </template>
        </el-table-column>
        <el-table-column :label="t('jobLog.column.createTime')" align="center" prop="createTime" width="180">
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.operation')" align="center" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button
              link
              type="primary"
              icon="View"
              @click="handleView(scope.row)"
              v-hasPermi="['monitor:job:list']"
            >
              {{ t('common.detail') }}
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

    <!-- 调度日志详细 -->
    <job-detail v-model:visible="open" :row="form" type="log" />
  </div>
</template>

<script setup lang="ts" name="JobLog">
import JobDetail from './detail.vue'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import { getJob } from '@/api/monitor/job'
import { listJobLog, delJobLog, cleanJobLog } from '@/api/monitor/jobLog'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'
import { download } from '@/utils/request'
import { addDateRange } from '@/utils/stepby'
import type { SysJobLog, JobLogQueryParams } from '@/types/api/monitor/jobLog'

const { t } = useI18n()
const queryRef = useTemplateRef('queryRef')
const { sys_common_status, sys_job_group } = useDict('sys_common_status', 'sys_job_group')

const jobLogList = shallowRef<SysJobLog[]>([])
const open = ref<boolean>(false)
const loading = ref<boolean>(true)
const showSearch = ref<boolean>(true)
const ids = ref<number[]>([])
const cleanLoading = ref(false)
const multiple = ref<boolean>(true)
const total = ref<number>(0)
const dateRange = ref<string[]>([])
const route = useRoute()

const data = reactive({
  form: {} as SysJobLog,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    jobName: undefined,
    jobGroup: undefined,
    status: undefined
  } as JobLogQueryParams
})

const { queryParams, form } = toRefs(data)

/** 查询调度日志列表 */
function getList() {
  loading.value = true
  listJobLog(addDateRange(queryParams.value, dateRange.value))
    .then((response) => {
      jobLogList.value = response.rows
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
  const obj = { path: '/monitor/job' }
  tab.closeOpenPage(obj)
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1
  getList()
}

/** 重置按钮操作 */
function resetQuery() {
  dateRange.value = []
  queryRef.value?.resetFields()
  handleQuery()
}

// 多选框选中数据
function handleSelectionChange(selection: SysJobLog[]) {
  ids.value = selection.map((item) => item.jobLogId!)
  multiple.value = !selection.length
}

/** 详细按钮操作 */
function handleView(row: SysJobLog) {
  open.value = true
  form.value = { ...row }
}

/** 删除按钮操作 */
function handleDelete() {
  modal
    .confirm(t('jobLog.tip.confirmDelete', { ids: ids.value }))
    .then(function () {
      return delJobLog(ids.value)
    })
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
    .confirm(t('jobLog.tip.confirmClear'))
    .then(function () {
      return cleanJobLog()
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('common.clearSuccess'))
    })
    .catch(() => {})
    .finally(() => {
      cleanLoading.value = false
    })
}

/** 导出按钮操作 */
function handleExport() {
  download(
    '/monitor/jobLog/export',
    addDateRange({ ...queryParams.value }, dateRange.value),
    `job_log_${new Date().getTime()}.xlsx`
  )
}

;(() => {
  const rawJobId = route.params?.jobId
  const jobId = rawJobId !== undefined ? Number(rawJobId) : NaN
  if (!Number.isNaN(jobId) && jobId !== 0) {
    getJob(jobId)
      .then((response) => {
        queryParams.value.jobName = response.data!.jobName
        queryParams.value.jobGroup = response.data!.jobGroup
        getList()
      })
      .catch(() => {})
  } else {
    getList()
  }
})()
</script>
