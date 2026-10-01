<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('operlog.search.operIp')" prop="operIp">
          <el-input
            v-model="queryParams.operIp"
            :placeholder="t('operlog.search.phOperIp')"
            :maxlength="50"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('operlog.search.title')" prop="title">
          <el-input
            v-model="queryParams.title"
            :placeholder="t('operlog.search.phTitle')"
            :maxlength="50"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('operlog.search.operName')" prop="operName">
          <el-input
            v-model="queryParams.operName"
            :placeholder="t('operlog.search.phOperName')"
            :maxlength="30"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('common.column.type')" prop="businessType">
          <el-select
            v-model="queryParams.businessType"
            :placeholder="t('operlog.search.phBusinessType')"
            clearable
            class="w-[240px]"
          >
            <el-option v-for="dict in sys_oper_type" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.column.status')" prop="status">
          <el-select
            v-model="queryParams.status"
            :placeholder="t('operlog.search.phStatus')"
            clearable
            class="w-[240px]"
          >
            <el-option v-for="dict in sys_common_status" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('operlog.search.operTime')" class="w-[308px]">
          <el-date-picker
            v-model="dateRange"
            value-format="YYYY-MM-DD HH:mm:ss"
            type="daterange"
            range-separator="-"
            :start-placeholder="t('common.form.startDate')"
            :end-placeholder="t('common.form.endDate')"
            :default-time="[new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 1, 1, 23, 59, 59)]"
          ></el-date-picker>
        </el-form-item>
        <el-form-item>
          <TenantFilter v-model="queryParams.tenantId" @search="handleQuery" />
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
          v-hasPermi="['monitor:operlog:remove']"
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
          v-hasPermi="['monitor:operlog:remove']"
        >
          {{ t('common.clear') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['monitor:operlog:export']">
          {{ t('common.export') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="info"
          plain
          icon="Printer"
          :loading="printLoading"
          @click="handlePrintPdf"
          v-hasPermi="['monitor:operlog:export']"
        >
          PDF
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="10" :rows="8" />
      <el-table
        v-else
        ref="operlogRef"
        class="operlog-table"
        v-loading="loading"
        :data="operlogList"
        :row-key="(row: SysOperLog) => row.operId"
        @selection-change="handleSelectionChange"
        :default-sort="defaultSort"
        @sort-change="handleSortChange"
      >
        <el-table-column type="selection" width="50" align="center" />
        <el-table-column :label="t('operlog.column.operId')" align="center" prop="operId" />
        <TenantColumn />
        <el-table-column :label="t('operlog.column.title')" align="center" prop="title" show-overflow-tooltip>
          <template #default="scope">
            <!-- T-11：title 新数据存 i18n key（module.*），旧数据为中文原文；te() 回退兼容 -->
            <span>{{ formatModuleTitle(scope.row.title) }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('operlog.column.businessType')" align="center" prop="businessType">
          <template #default="scope">
            <dict-tag :options="sys_oper_type" :value="scope.row.businessType" />
          </template>
        </el-table-column>
        <el-table-column
          :label="t('operlog.column.operName')"
          align="center"
          width="110"
          prop="operName"
          show-overflow-tooltip
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('operlog.column.operIp')"
          align="center"
          prop="operIp"
          width="130"
          show-overflow-tooltip
        />
        <el-table-column :label="t('operlog.column.status')" align="center" prop="status">
          <template #default="scope">
            <dict-tag :options="sys_common_status" :value="scope.row.status" />
          </template>
        </el-table-column>
        <el-table-column
          :label="t('operlog.column.operTime')"
          align="center"
          prop="operTime"
          width="180"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <span>{{ parseTime(scope.row.operTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('common.column.duration')"
          align="center"
          prop="costTime"
          width="110"
          show-overflow-tooltip
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <span>{{ scope.row.costTime }}{{ t('operlog.column.millisecond') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.operation')" align="center" class-name="small-padding fixed-width">
          <template #default="scope">
            <el-button
              link
              type="primary"
              icon="View"
              @click="handleDetail(scope.row, scope.index)"
              v-hasPermi="['monitor:operlog:query']"
            >
              {{ t('operlog.btn.detail') }}
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

    <operlog-detail v-model:visible="detailVisible" :row="detailRow" />

    <!-- 导出字段选择对话框 -->
    <ExportDialog
      v-model="exportDialogVisible"
      :columns="exportColumns"
      :title="t('operlog.btn.exportFieldSelect')"
      @export="handleExportWithFields"
    />
  </div>
</template>

<script setup lang="ts" name="Operlog">
import OperlogDetail from './detail.vue'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import TenantColumn from '@/components/TenantColumn/index.vue'
import TenantFilter from '@/components/TenantFilter/index.vue'
import ExportDialog from '@/components/ExportDialog/index.vue'
import type { ExportField } from '@/components/ExportDialog/index.vue'
import { list, delOperlog, cleanOperlog } from '@/api/monitor/operlog'
import type { FormInstance } from 'element-plus'
import modal from '@/plugins/modal'
import { download } from '@/utils/request'
import { addDateRange } from '@/utils/stepby'
import { formatModuleTitle as resolveModuleTitle } from '@/utils/operModuleTitle'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useCrudTable } from '@/composables/useCrudTable'
import type { SysOperLog, OperlogQueryParams } from '@/types/api/monitor/operlog'

const { t, te } = useI18n()

/** T-11：模块标题展示——委托共享 util，剥离后端存储前缀并 te() 回退（详见 utils/operModuleTitle） */
function formatModuleTitle(title: string | undefined): string {
  return resolveModuleTitle(title, t, te)
}
const queryRef = useTemplateRef('queryRef')
const operlogRef = useTemplateRef('operlogRef')
const { sys_oper_type, sys_common_status } = useDict('sys_oper_type', 'sys_common_status')

const detailVisible = ref<boolean>(false)
const detailRow = ref<SysOperLog>({})
const cleanLoading = ref(false)
const printLoading = ref(false)
const dateRange = ref<string[]>([])
const defaultSort = ref({ prop: 'operTime', order: 'descending' })

const data = reactive({
  form: {} as SysOperLog,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    operIp: undefined,
    title: undefined,
    operName: undefined,
    businessType: undefined,
    status: undefined
  } as OperlogQueryParams
})

const { queryParams, form } = toRefs(data)
const formRef = ref<FormInstance | null>(null)

// P1-3：支持从 audit-dashboard 通过 query 跳转过来预筛选业务类型
const route = useRoute()
function applyRouteQuery() {
  const q = route.query
  if (q.businessType !== undefined && q.businessType !== '') {
    queryParams.value.businessType = String(q.businessType)
  }
  if (q.status !== undefined && q.status !== '') {
    queryParams.value.status = String(q.status)
  }
}
applyRouteQuery()

const {
  dataList: operlogList,
  loading,
  showSearch,
  multiple,
  total,
  getList,
  handleQuery,
  handleSelectionChange,
  handleDelete
} = useCrudTable<SysOperLog, OperlogQueryParams>({
  listApi: (params) => list(addDateRange(params as Record<string, unknown>, dateRange.value) as OperlogQueryParams),
  getApi: () => Promise.resolve({}),
  addApi: () => Promise.resolve({}),
  updateApi: () => Promise.resolve({}),
  deleteApi: (ids) => delOperlog(ids as unknown as number | number[]),
  idField: 'operId',
  defaultForm: () => ({}) as SysOperLog,
  titleKey: 'operlog.title',
  deleteTipKey: 'operlog.tip.confirmDelete',
  queryParams,
  form,
  formRef,
  queryRef
})

/** 重置按钮操作（审计 2.5 修复：重置后必须刷新列表）
 * 清除日期范围、重置排序参数并重新触发查询；与原始行为一致（重置后重新应用默认排序）。
 */
function resetQuery() {
  dateRange.value = []
  queryParams.value.orderByColumn = undefined
  queryParams.value.isAsc = undefined
  queryParams.value.tenantId = undefined
  queryRef.value?.resetFields()
  handleQuery()
  operlogRef.value?.sort(defaultSort.value.prop, defaultSort.value.order)
}

/** 排序触发事件 */
function handleSortChange(column: { prop: string | null; order: string | null }) {
  // 排序被清除时（column.order === null），重置排序参数
  if (column.order === null) {
    queryParams.value.orderByColumn = undefined
    queryParams.value.isAsc = undefined
  } else {
    queryParams.value.orderByColumn = column.prop || undefined
    queryParams.value.isAsc = column.order === 'ascending' ? 'asc' : 'desc'
  }
  getList()
}

/** 详细按钮操作 */
function handleDetail(row: SysOperLog) {
  detailRow.value = row
  detailVisible.value = true
}

/** 清空按钮操作 */
function handleClean() {
  cleanLoading.value = true
  modal
    .confirm(t('operlog.tip.confirmClear'))
    .then(function () {
      return cleanOperlog()
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

/** 导出按钮操作：弹字段选择对话框 */
const exportDialogVisible = ref(false)
const exportColumns: ExportField[] = [
  // T-09：field 使用与后端 JSON 序列化名一致的稳定 key（serde camelCase），
  // 后端按 key 匹配列并依据请求 Accept-Language 输出双语表头
  { field: 'operId', label: t('operlog.exportField.logId') },
  { field: 'title', label: t('operlog.exportField.moduleTitle') },
  { field: 'businessType', label: t('operlog.exportField.businessType') },
  { field: 'requestMethod', label: t('operlog.exportField.requestMethod') },
  { field: 'operName', label: t('operlog.exportField.operName') },
  { field: 'operUrl', label: t('operlog.exportField.requestUrl') },
  { field: 'operIp', label: t('operlog.exportField.operIp') },
  { field: 'status', label: t('operlog.exportField.status') },
  { field: 'errorMsg', label: t('operlog.exportField.errorMsg') },
  { field: 'operTime', label: t('operlog.exportField.operTime') },
  { field: 'costTime', label: t('operlog.exportField.costTime') }
]

function handleExport() {
  exportDialogVisible.value = true
}

/** 实际下载逻辑 */
function handleExportWithFields(fields: string[] | null) {
  const params: Record<string, unknown> = { ...addDateRange(queryParams.value, dateRange.value) }
  if (fields && fields.length > 0) {
    params.fields = fields.join(',')
  }
  // download() 返回 Promise，成功后关闭对话框；失败时保留对话框以便用户重试（R12 修复）
  download('/monitor/operlog/export', params, `operlog_${new Date().getTime()}.xlsx`)
    .then(() => {
      exportDialogVisible.value = false
    })
    .catch(() => {
      // 导出失败时不关闭对话框，保留用户选择的导出字段
    })
}

/** PDF 打印当前表格 */
async function handlePrintPdf() {
  printLoading.value = true
  try {
    const { exportTableToPdf } = await import('@/utils/pdf')
    await exportTableToPdf('.operlog-table', `${t('operlog.pdfFilename')}_${new Date().getTime()}`)
    modal.msgSuccess(t('operlog.tip.pdfExportSuccess'))
  } catch {
    modal.msgError(t('operlog.tip.pdfExportFail'))
  } finally {
    printLoading.value = false
  }
}

getList()
// TierS-7: 接入自动刷新（读取 userPrefs.autoRefreshInterval，0 表示禁用）
useAutoRefresh(() => getList())
</script>
