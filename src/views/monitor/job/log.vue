<template>
  <div class="app-container">
    <!-- G-09：定时任务运行统计报表（成功率趋势 / 耗时分布 / 失败 TOP） -->
    <JobStatsPanel class="mb-3" />
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
            :aria-label="t('jobLog.search.phJobName')"
          />
        </el-form-item>
        <el-form-item :label="t('job.search.jobGroup')" prop="jobGroup">
          <el-select
            :aria-label="t('job.search.jobGroup')"
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
            :aria-label="t('jobLog.search.execStatus')"
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
            :aria-label="t('common.form.startDate')"
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
        ref="jobLogTableRef"
        v-loading="loading"
        :data="jobLogList"
        :row-key="(row: SysJobLog) => row.jobLogId"
        @selection-change="handleSelectionChange"
        :default-sort="defaultSort"
        @sort-change="handleSortChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column
          :label="t('jobLog.column.jobLogId')"
          width="80"
          align="center"
          prop="jobLogId"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('job.column.name')"
          align="center"
          prop="jobName"
          show-overflow-tooltip
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('job.column.group')"
          align="center"
          prop="jobGroup"
          show-overflow-tooltip
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <dict-tag :options="sys_job_group" :value="scope.row.jobGroup" />
          </template>
        </el-table-column>
        <el-table-column
          :label="t('job.column.target')"
          align="center"
          prop="invokeTarget"
          show-overflow-tooltip
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('jobLog.column.jobMessage')"
          align="center"
          prop="jobMessage"
          show-overflow-tooltip
        />
        <el-table-column
          :label="t('jobLog.column.status')"
          align="center"
          prop="status"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <dict-tag :options="sys_common_status" :value="scope.row.status" />
          </template>
        </el-table-column>
        <el-table-column
          :label="t('jobLog.column.createTime')"
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
        <el-table-column :label="t('common.column.operation')" align="center" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button link type="primary" icon="View" @click="handleView(scope.row)" v-hasPermi="['monitor:job:list']">
              {{ t('common.detail') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <!-- 失败/空态分形（ListEmpty 单一实现）：本页手写 getList，用本地 loadError 接同一组件 -->
          <list-empty :load-error="loadError" @retry="initPage" />
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
import { useMobileFilter } from '@/composables/useMobileFilter'
import JobDetail from './detail.vue'
import JobStatsPanel from './JobStatsPanel.vue'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import { getJob } from '@/api/monitor/job'
import { listJobLog, delJobLog, cleanJobLog } from '@/api/monitor/jobLog'
import modal from '@/plugins/modal'
import { pageAfterEmptyResult } from '@/composables/useCrudTable'
import { createLatestGuard } from '@/composables/latestRequest'
import tab from '@/plugins/tab'
import { download } from '@/utils/request'
import { addDateRange } from '@/utils/stepby'
import { toPositiveInt } from '@/utils/validate'
import type { SysJobLog, JobLogQueryParams } from '@/types/api/monitor/jobLog'

const { t } = useI18n()
const queryRef = useTemplateRef('queryRef')
const jobLogTableRef = useTemplateRef('jobLogTableRef')
const { sys_common_status, sys_job_group } = useDict('sys_common_status', 'sys_job_group')

const jobLogList = shallowRef<SysJobLog[]>([])
const open = ref<boolean>(false)
const loading = ref<boolean>(true)
/** 列表请求守卫：连点刷新/翻页时只让最后一次请求的结局生效（b119） */
const listGuard = createLatestGuard()
const showSearch = ref<boolean>(true)
// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter
const ids = ref<number[]>([])
const cleanLoading = ref(false)
const multiple = ref<boolean>(true)
const total = ref<number>(0)
// 列表失败态（与 useCrudTable.loadError 同语义，本页手写取数故为本地 ref）
const loadError = ref(false)
const dateRange = ref<string[]>([])
const route = useRoute()
const defaultSort = ref({ prop: 'createTime', order: 'descending' })

const data = reactive({
  form: {} as SysJobLog,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    jobName: undefined,
    jobGroup: undefined,
    status: undefined,
    orderByColumn: undefined,
    isAsc: undefined
  } as JobLogQueryParams
})

const { queryParams, form } = toRefs(data)

/** 查询调度日志列表 */
function getList() {
  const ticket = listGuard.begin()
  loading.value = true
  listJobLog(addDateRange(queryParams.value, dateRange.value))
    .then((response) => {
      if (!listGuard.isCurrent(ticket)) return
      loadError.value = false
      const nextPage = pageAfterEmptyResult(queryParams.value.pageNum, response.rows.length, response.total)
      if (nextPage !== queryParams.value.pageNum) {
        queryParams.value.pageNum = nextPage
        getList()
        return
      }
      jobLogList.value = response.rows
      total.value = response.total
    })
    .catch((e) => {
      if (!listGuard.isCurrent(ticket)) return
      if (import.meta.env.DEV) console.error(e)
      modal.msgError(t('common.requestFailed'))
      // 失败不再静默吞成"暂无数据"：置位后空态显示「加载失败 + 重试」
      loadError.value = true
    })
    .finally(() => {
      if (listGuard.isCurrent(ticket)) loading.value = false
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
  queryParams.value.orderByColumn = undefined
  queryParams.value.isAsc = undefined
  queryRef.value?.resetFields()
  handleQuery()
  jobLogTableRef.value?.sort(defaultSort.value.prop, defaultSort.value.order)
}

/** 排序触发事件（服务端排序：透传 orderByColumn/isAsc） */
function handleSortChange(column: { prop: string | null; order: string | null }) {
  queryParams.value.orderByColumn = column.prop ?? undefined
  queryParams.value.isAsc = column.order ?? undefined
  getList()
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
      // 清空后页码回到第一页：停在旧页会看到"暂无数据"而实际还有日志
      queryParams.value.pageNum = 1
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

/** 页面初始化（重试入口同源）：深链带 jobId 时先取任务信息再查日志 */
function initPage() {
  // 深链参数必须过闸门：裸 Number() 会把 100 位数字串折成 1.11e+99 并照常出网（b73 轮 16 取证）
  const jobId = toPositiveInt(route.params?.jobId)
  if (jobId === 0) {
    getList()
    return
  }
  getJob(jobId)
    .then((response) => {
      queryParams.value.jobName = response.data!.jobName
      queryParams.value.jobGroup = response.data!.jobGroup
      getList()
    })
    .catch(() => {
      // 取不到任务信息时不能拿"无过滤的日志列表"冒充它的执行日志：
      // 落失败态 + 重试（重试会重跑本函数），页面上不再出现一份看起来正常的空表（b110）
      loadError.value = true
      jobLogList.value = []
      total.value = 0
    })
}

initPage()
</script>
