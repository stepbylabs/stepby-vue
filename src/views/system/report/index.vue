<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('report.search.reportName')" prop="reportName">
          <el-input
            v-model="queryParams.reportName"
            :placeholder="t('report.search.phReportName')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
            :aria-label="t('report.search.phReportName')"
          />
        </el-form-item>
        <el-form-item :label="t('report.column.reportType')" prop="reportType">
          <el-select
            :aria-label="t('report.column.reportType')"
            v-model="queryParams.reportType"
            :placeholder="t('report.search.phReportType')"
            clearable
            class="w-[200px]"
          >
            <el-option v-for="opt in reportTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('common.column.status')" prop="status">
          <el-select
            :aria-label="t('common.column.status')"
            v-model="queryParams.status"
            :placeholder="t('report.search.phStatus')"
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:report:add']">
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
          v-hasPermi="['system:report:edit']"
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
          v-hasPermi="['system:report:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Bell"
          :disabled="single"
          @click="openSubDialog"
          v-hasPermi="['system:report:sub:list']"
        >
          {{ t('report.btn.subscription') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysReport) => row.reportId"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column
        :label="t('report.column.reportCode')"
        align="center"
        prop="reportCode"
        width="140"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('report.column.reportName')"
        align="center"
        prop="reportName"
        min-width="160"
        show-overflow-tooltip
      />
      <el-table-column :label="t('report.column.reportType')" align="center" prop="reportType" width="130">
        <template #default="scope">
          <el-tag :type="reportTypeTag(scope.row.reportType)" size="small">
            {{ reportTypeLabel(scope.row.reportType) }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.column.status')" align="center" width="90">
        <template #default="scope">
          <el-switch
            v-model="scope.row.status"
            :loading="statusLoadingIds.includes(scope.row.reportId!)"
            active-value="0"
            inactive-value="1"
            @change="handleStatusChange(scope.row)"
            v-hasPermi="['system:report:status']"
          ></el-switch>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('common.column.createBy')"
        align="center"
        prop="createBy"
        width="120"
        show-overflow-tooltip
      />
      <el-table-column :label="t('common.column.createTime')" align="center" prop="createTime" width="170" />
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="200"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="View"
            @click="handlePreview(scope.row)"
            v-hasPermi="['system:report:preview']"
          >
            {{ t('report.btn.preview') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row)"
            v-hasPermi="['system:report:edit']"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['system:report:remove']"
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

    <!-- 添加或修改报表定义对话框 -->
    <el-dialog
      :title="title"
      :before-close="beforeDialogClose"
      v-model="open"
      width="min(90%, 600px)"
      append-to-body
      destroy-on-close
    >
      <el-form ref="reportRef" :model="form" :rules="rules" label-width="90px">
        <el-form-item :label="t('report.form.reportCode')" prop="reportCode">
          <el-input
            v-model.trim="form.reportCode"
            :placeholder="t('report.form.phReportCode')"
            :maxlength="64"
            :aria-label="t('report.form.phReportCode')"
          />
        </el-form-item>
        <el-form-item :label="t('report.form.reportName')" prop="reportName">
          <el-input
            v-model.trim="form.reportName"
            :placeholder="t('report.form.phReportName')"
            :maxlength="64"
            :aria-label="t('report.form.phReportName')"
          />
        </el-form-item>
        <el-form-item :label="t('report.form.reportType')" prop="reportType">
          <el-select
            :aria-label="t('report.form.reportType')"
            v-model="form.reportType"
            :placeholder="t('common.form.selectPlaceholder')"
          >
            <el-option v-for="opt in reportTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('report.form.config')" prop="config">
          <div class="w-full">
            <el-input
              v-model="form.config"
              type="textarea"
              :rows="5"
              :placeholder="t('report.form.phConfig')"
              class="font-mono"
              :aria-label="t('report.form.phConfig')"
            />
            <div class="mt-1 text-xs text-text-secondary">{{ t('report.form.configTip') }}</div>
          </div>
        </el-form-item>
        <el-form-item :label="t('report.form.status')">
          <el-switch
            v-model="form.status"
            active-value="0"
            inactive-value="1"
            :active-text="t('common.enabled')"
            :inactive-text="t('common.disabled')"
          />
        </el-form-item>
        <el-form-item :label="t('report.form.remark')" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            :placeholder="t('report.form.phRemark')"
            :maxlength="500"
            show-word-limit
            :aria-label="t('report.form.phRemark')"
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

    <!-- 报表快照预览对话框 -->
    <el-dialog
      :title="t('report.preview.title')"
      v-model="previewOpen"
      width="min(90%, 720px)"
      append-to-body
      destroy-on-close
    >
      <div v-loading="previewLoading" class="preview-body">
        <template v-if="snapshot">
          <el-descriptions :column="2" border class="mb15">
            <el-descriptions-item :label="t('report.column.reportName')">
              {{ snapshot.reportName }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('report.column.reportType')">
              <el-tag :type="reportTypeTag(snapshot.reportType)" size="small">
                {{ reportTypeLabel(snapshot.reportType) }}
              </el-tag>
            </el-descriptions-item>
            <el-descriptions-item :label="t('report.preview.generatedAt')">
              {{ snapshot.generatedAt }}
            </el-descriptions-item>
            <el-descriptions-item :label="t('report.column.reportCode')">
              {{ snapshot.reportCode }}
            </el-descriptions-item>
          </el-descriptions>

          <!-- 数组型快照：通用表格 -->
          <div v-if="snapshotIsArray" class="mb15">
            <div class="mb8 section-title">{{ t('report.preview.data') }}</div>
            <el-table :data="snapshotDataArray" border size="small">
              <el-table-column
                v-for="col in snapshotArrayColumns"
                :key="col"
                :prop="col"
                :label="col"
                min-width="120"
                align="center"
              />
            </el-table>
          </div>

          <!-- 对象型快照 -->
          <template v-else-if="snapshotIsObject">
            <template v-if="snapshotScalarFields.length > 0">
              <div class="mb8 section-title">{{ t('report.preview.summary') }}</div>
              <el-descriptions :column="2" border class="mb15">
                <el-descriptions-item v-for="field in snapshotScalarFields" :key="field.key" :label="field.key">
                  {{ field.value }}
                </el-descriptions-item>
              </el-descriptions>
            </template>
            <div v-for="tableField in snapshotTableFields" :key="tableField.key" class="mb15">
              <div class="mb8 section-title">{{ tableField.key }}</div>
              <el-table :data="tableField.rows" border size="small">
                <el-table-column
                  v-for="col in tableField.columns"
                  :key="col"
                  :prop="col"
                  :label="col"
                  min-width="110"
                  align="center"
                />
              </el-table>
            </div>
            <div v-if="snapshotScalarFields.length === 0 && snapshotTableFields.length === 0" class="mt8">
              <pre class="snapshot-json">{{ snapshotRaw }}</pre>
            </div>
          </template>

          <!-- 兜底：原始 JSON -->
          <template v-else>
            <pre class="snapshot-json">{{ snapshotRaw }}</pre>
          </template>
        </template>
      </div>
    </el-dialog>

    <!-- 订阅管理对话框 + 订阅表单（独立区块，见 SubReportSection.vue） -->
    <SubReportSection v-model:open="subOpen" :report="subReport" />
  </div>
</template>

<script setup lang="ts" name="SysReport">
import {
  listReport,
  getReport,
  delReport,
  addReport,
  updateReport,
  changeReportStatus,
  previewReport
} from '@/api/system/report'
import type { SysReport, ReportSnapshot } from '@/types/api/system/report'
import { useCrudTable } from '@/composables/useCrudTable'
import { useMobileFilter } from '@/composables/useMobileFilter'
import { useRowActionGuard } from '@/composables/useRowActionGuard'
import modal from '@/plugins/modal'
import SubReportSection from './SubReportSection.vue'

const { t } = useI18n()
const reportRefRef = useTemplateRef('reportRef')
const queryRefRef = useTemplateRef('queryRef')
const { sys_normal_disable } = useDict('sys_normal_disable')

// 报表类型选项
const reportTypeOptions = computed(() => [
  { value: 'login_stats', label: t('report.type.login_stats') },
  { value: 'user_stats', label: t('report.type.user_stats') },
  { value: 'msg_stats', label: t('report.type.msg_stats') },
  { value: 'custom', label: t('report.type.custom') }
])

function reportTypeLabel(type?: string): string {
  return reportTypeOptions.value.find((o: { value: string; label: string }) => o.value === type)?.label || type || '-'
}

function reportTypeTag(type?: string): 'success' | 'primary' | 'warning' | 'info' {
  switch (type) {
    case 'login_stats':
      return 'primary'
    case 'user_stats':
      return 'success'
    case 'msg_stats':
      return 'warning'
    default:
      return 'info'
  }
}

const data = reactive({
  form: {} as SysReport,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    reportName: undefined,
    reportType: undefined,
    status: undefined
  },
  rules: {
    reportCode: [{ required: true, message: t('report.validate.reportCodeRequired'), trigger: 'blur' }],
    reportName: [{ required: true, message: t('report.validate.reportNameRequired'), trigger: 'blur' }],
    reportType: [{ required: true, message: t('report.validate.reportTypeRequired'), trigger: 'change' }],
    config: [{ required: true, message: t('report.validate.configRequired'), trigger: 'blur' }]
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
  ids,
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
  submitForm,
  handleDelete
} = useCrudTable<SysReport, { pageNum: number; pageSize: number; [key: string]: unknown }>({
  listApi: listReport,
  getApi: getReport,
  addApi: addReport,
  updateApi: updateReport,
  deleteApi: delReport,
  idField: 'reportId',
  defaultForm: () => ({
    reportId: undefined,
    reportCode: undefined,
    reportName: undefined,
    reportType: undefined,
    config: '{}',
    status: '0',
    remark: undefined
  }),
  titleKey: 'report.title',
  deleteTipKey: 'report.tip.confirmDelete',
  queryParams,
  form,
  formRef: reportRefRef,
  queryRef: queryRefRef
})
// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter

// 状态切换
/**
 * 启停切换（**行级**互斥 + 在途态，b106）：`v-model` 乐观更新，被挡掉/取消/失败三出口都回滚。
 */
const { runningIds: statusLoadingIds, guarded } = useRowActionGuard<number>()

async function handleStatusChange(row: SysReport): Promise<void> {
  const oldVal = row.status === '0' ? '1' : '0'
  const text = row.status === '0' ? t('common.enabled') : t('common.disabled')
  const executed = await guarded(
    row.reportId!,
    () => modal.confirm(t('report.tip.confirmChange', { text, name: row.reportName || '' })),
    async () => {
      try {
        await changeReportStatus(row.reportId!, row.status!)
        modal.msgSuccess(text + t('common.success'))
      } catch (e) {
        row.status = oldVal
        throw e
      }
    }
  )
  if (!executed) row.status = oldVal
}

// ----- 预览 -----
const previewOpen = ref(false)
const previewLoading = ref(false)
const snapshot = ref<ReportSnapshot | null>(null)

const snapshotIsArray = computed(() => Array.isArray(snapshot.value?.data))
const snapshotIsObject = computed(
  () =>
    !!snapshot.value &&
    typeof snapshot.value.data === 'object' &&
    snapshot.value.data !== null &&
    !Array.isArray(snapshot.value.data)
)
const snapshotDataArray = computed(() =>
  Array.isArray(snapshot.value?.data) ? (snapshot.value!.data as unknown[]) : []
)
const snapshotArrayColumns = computed(() => {
  const rows = snapshotDataArray.value
  if (rows.length === 0) return []
  const first = rows[0]
  return typeof first === 'object' && first !== null ? Object.keys(first as object) : ['value']
})
const snapshotObjectData = computed<Record<string, unknown>>(() =>
  snapshotIsObject.value && snapshot.value ? (snapshot.value.data as Record<string, unknown>) : {}
)
const snapshotScalarFields = computed(() => {
  const out: Array<{ key: string; value: string }> = []
  for (const [key, value] of Object.entries(snapshotObjectData.value)) {
    if (value === null || value === undefined) continue
    if (Array.isArray(value) || typeof value === 'object') continue
    out.push({ key, value: String(value) })
  }
  return out
})
const snapshotTableFields = computed(() => {
  const out: Array<{ key: string; rows: unknown[]; columns: string[] }> = []
  for (const [key, value] of Object.entries(snapshotObjectData.value)) {
    if (!Array.isArray(value)) continue
    const rows = value as unknown[]
    if (rows.length === 0) continue
    const first = rows[0]
    if (typeof first !== 'object' || first === null) continue
    out.push({ key, rows, columns: Object.keys(first as object) })
  }
  return out
})
const snapshotRaw = computed(() => JSON.stringify(snapshot.value?.data ?? {}, null, 2))

function handlePreview(row: SysReport) {
  snapshot.value = null
  previewOpen.value = true
  previewLoading.value = true
  previewReport(row.reportId!)
    .then((res) => {
      snapshot.value = res.data ?? null
    })
    .catch(() => {})
    .finally(() => {
      previewLoading.value = false
    })
}

// ----- 订阅管理（子组件承载订阅管理对话框/订阅表单，见 SubReportSection.vue） -----
const subOpen = ref(false)
const subReport = ref<SysReport>({})

function openSubDialog() {
  const selectedId = ids.value[0]
  const report = dataList.value.find((r: SysReport) => r.reportId === selectedId) ?? { reportId: selectedId }
  subReport.value = report
  subOpen.value = true
}

getList()
</script>

<style lang="scss" scoped>
.font-mono :deep(textarea),
.font-mono :deep(.el-textarea__inner),
.font-mono :deep(.el-input__inner) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}
.preview-body {
  max-height: 62vh;
  overflow: auto;
}
.section-title {
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.snapshot-json {
  margin: 0;
  padding: 12px;
  border-radius: 6px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-all;
}
</style>
