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
            @keyup.enter="handleQuery" :aria-label="t('operlog.search.phOperIp')" />
        </el-form-item>
        <el-form-item :label="t('operlog.search.title')" prop="title">
          <el-input
            v-model="queryParams.title"
            :placeholder="t('operlog.search.phTitle')"
            :maxlength="50"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery" :aria-label="t('operlog.search.phTitle')" />
        </el-form-item>
        <el-form-item :label="t('operlog.search.operName')" prop="operName">
          <el-input
            v-model="queryParams.operName"
            :placeholder="t('operlog.search.phOperName')"
            :maxlength="30"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery" :aria-label="t('operlog.search.phOperName')" />
        </el-form-item>
        <el-form-item :label="t('common.column.type')" prop="businessType">
          <el-select
            :aria-label="t('common.column.type')"
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
            :aria-label="t('common.column.status')"
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
            :default-time="[new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 1, 1, 23, 59, 59)]" :aria-label="t('common.form.startDate')"></el-date-picker>
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
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Lock"
          :loading="verifyLoading"
          @click="handleVerifyChain"
          v-hasPermi="['monitor:operlogArchive:verify']"
        >
          {{ t('operlog.btn.verifyChain') }}
        </el-button>
      </el-col>
      <!-- 批次十九收尾（E-06）：compliance-report 接口前端消费闭环 -->
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Document"
          :loading="complianceLoading"
          @click="handleComplianceReport"
          v-hasPermi="['monitor:operlog:query']"
        >
          {{ t('operlog.btn.complianceReport') }}
        </el-button>
      </el-col>
      <!-- 批次十九收尾：归档锚点列表+下载（平台专属 UI 留白闭环） -->
      <el-col :span="1.5">
        <el-button
          type="primary"
          plain
          icon="FolderOpened"
          :loading="archiveLoading"
          @click="handleArchiveList"
          v-hasPermi="['monitor:operlogArchive:download']"
        >
          {{ t('operlog.btn.archiveList') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" :columns="columns" @queryTable="getList"></right-toolbar>
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
        <el-table-column
          v-if="columns.operId.visible"
          :label="t('operlog.column.operId')"
          align="center"
          prop="operId"
        />
        <TenantColumn />
        <el-table-column
          v-if="columns.title.visible"
          :label="t('operlog.column.title')"
          align="center"
          prop="title"
          show-overflow-tooltip
        >
          <template #default="scope">
            <!-- T-11：title 新数据存 i18n key（module.*），旧数据为中文原文；te() 回退兼容 -->
            <span>{{ formatModuleTitle(scope.row.title) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          v-if="columns.businessType.visible"
          :label="t('operlog.column.businessType')"
          align="center"
          prop="businessType"
        >
          <template #default="scope">
            <dict-tag :options="sys_oper_type" :value="scope.row.businessType" />
          </template>
        </el-table-column>
        <el-table-column
          v-if="columns.operName.visible"
          :label="t('operlog.column.operName')"
          align="center"
          width="110"
          prop="operName"
          show-overflow-tooltip
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          v-if="columns.operIp.visible"
          :label="t('operlog.column.operIp')"
          align="center"
          prop="operIp"
          width="130"
          show-overflow-tooltip
        />
        <el-table-column v-if="columns.status.visible" :label="t('operlog.column.status')" align="center" prop="status">
          <template #default="scope">
            <dict-tag :options="sys_common_status" :value="scope.row.status" />
          </template>
        </el-table-column>
        <el-table-column
          v-if="columns.operTime.visible"
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
          v-if="columns.costTime.visible"
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

    <!-- 链完整性校验结果对话框 -->
    <el-dialog
      :title="t('operlog.verify.title')"
      v-model="verifyVisible"
      width="min(90%, 480px)"
      append-to-body
      destroy-on-close
    >
      <el-result v-if="verifyResult?.valid" icon="success" :title="t('operlog.verify.validTitle')">
        <template #sub-title>
          <div class="flex flex-col items-center gap-2">
            <span>{{ t('operlog.verify.checkedCount', { count: verifyResult.checked }) }}</span>
            <!-- 批次十九链感知保留：gapCount > 0 = 存在保留期清理缺口（锚点续接校验通过） -->
            <el-alert
              v-if="verifyResult.gapCount != null && verifyResult.gapCount > 0"
              :title="t('operlog.verify.gapTip', { count: verifyResult.gapCount })"
              type="info"
              :closable="false"
              show-icon
            />
          </div>
        </template>
      </el-result>
      <el-result v-else-if="verifyResult" icon="error" :title="t('operlog.verify.brokenTitle')">
        <template #sub-title>
          <div class="flex flex-col items-center gap-2">
            <span>{{ t('operlog.verify.checkedCount', { count: verifyResult.checked }) }}</span>
            <el-alert
              v-if="verifyResult.brokenAtOperId != null"
              :title="t('operlog.verify.brokenAt', { operId: verifyResult.brokenAtOperId })"
              type="error"
              :closable="false"
              show-icon
            />
          </div>
        </template>
      </el-result>
      <template #footer>
        <el-button type="primary" @click="verifyVisible = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 批次十九收尾（E-06）：审计合规报告（GET /monitor/operlog/compliance-report） -->
    <el-dialog
      :title="t('operlog.compliance.title')"
      v-model="complianceVisible"
      width="min(94%, 860px)"
      append-to-body
      destroy-on-close
    >
      <template v-if="complianceReport">
        <el-descriptions :column="3" border size="small" class="mb-3">
          <el-descriptions-item :label="t('operlog.compliance.period')">
            {{ complianceReport.periodFrom }} ~ {{ complianceReport.periodTo }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('operlog.compliance.total')">
            {{ complianceReport.summary.total }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('operlog.compliance.generatedAt')">
            {{ complianceReport.generatedAt }}
          </el-descriptions-item>
        </el-descriptions>
        <el-alert
          :title="t('operlog.compliance.anomalyCount', { count: complianceReport.anomalies.length })"
          :type="complianceReport.anomalies.length > 0 ? 'warning' : 'success'"
          :closable="false"
          show-icon
          class="mb-3"
        />
        <el-table :data="complianceReport.anomalies" size="small" max-height="360" border>
          <el-table-column prop="operTime" :label="t('operlog.compliance.colTime')" width="170" />
          <el-table-column prop="title" :label="t('operlog.compliance.colModule')" min-width="120" />
          <el-table-column prop="operName" :label="t('operlog.compliance.colOperator')" width="110" />
          <el-table-column prop="operUrl" :label="t('operlog.compliance.colUrl')" min-width="150" show-overflow-tooltip />
          <el-table-column prop="operIp" :label="t('operlog.compliance.colIp')" width="130" show-overflow-tooltip />
          <el-table-column prop="errorMsg" :label="t('operlog.compliance.colError')" min-width="160" show-overflow-tooltip />
        </el-table>
      </template>
      <template #footer>
        <el-button @click="loadComplianceReport" :loading="complianceLoading">
          {{ t('operlog.compliance.refresh') }}
        </el-button>
        <el-button type="primary" @click="complianceVisible = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>

    <!-- 批次十九收尾：归档锚点列表 + 下载（平台专属，monitor:operlogArchive:） -->
    <el-dialog
      :title="t('operlog.archive.title')"
      v-model="archiveVisible"
      width="min(94%, 860px)"
      append-to-body
      destroy-on-close
    >
      <el-table v-loading="archiveLoading" :data="archiveRows" size="small" border>
        <el-table-column prop="deletedAt" :label="t('operlog.archive.colDeletedAt')" width="170" />
        <el-table-column :label="t('operlog.archive.colRange')" min-width="150">
          <template #default="{ row }">
            #{{ row.firstOperId }} ~ #{{ row.lastOperId }}
          </template>
        </el-table-column>
        <el-table-column prop="deletedCount" :label="t('operlog.archive.colCount')" width="100" />
        <el-table-column :label="t('operlog.archive.colMode')" width="90">
          <template #default="{ row }">
            <el-tag :type="row.mode === 'archive' ? 'success' : 'info'" size="small">{{ row.mode }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('operlog.archive.colAction')" width="110">
          <template #default="{ row }">
            <el-button
              v-if="row.archiveObjectKey"
              type="primary"
              size="small"
              link
              @click="downloadArchive(row)"
            >
              {{ t('operlog.archive.download') }}
            </el-button>
            <span v-else class="text-[var(--el-text-color-placeholder)]">—</span>
          </template>
        </el-table-column>
      </el-table>
      <el-pagination
        v-model:current-page="archivePage"
        :page-size="20"
        :total="archiveTotal"
        layout="total, prev, pager, next"
        :total-label="t('operlog.archive.totalLabel')"
        class="mt-3 justify-end"
        @current-change="loadArchiveList"
      />
      <template #footer>
        <el-button type="primary" @click="archiveVisible = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="Operlog">
import OperlogDetail from './detail.vue'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import TenantColumn from '@/components/TenantColumn/index.vue'
import TenantFilter from '@/components/TenantFilter/index.vue'
import ExportDialog from '@/components/ExportDialog/index.vue'
import type { ExportField } from '@/components/ExportDialog/index.vue'
import {
  list,
  delOperlog,
  cleanOperlog,
  verifyChain,
  getComplianceReport,
  listArchiveAnchors,
  downloadArchiveFile,
  type ChainVerifyResult,
  type LogArchiveAnchor
} from '@/api/monitor/operlog'
import type { FormInstance } from 'element-plus'
import modal from '@/plugins/modal'
import { download } from '@/utils/request'
import { addDateRange } from '@/utils/stepby'
import { formatModuleTitle as resolveModuleTitle } from '@/utils/operModuleTitle'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { resetQueryDefaults, useCrudTable } from '@/composables/useCrudTable'
import { useMobileFilter } from '@/composables/useMobileFilter'
import { useColumnPreferences } from '@/composables/useColumnPreferences'
import { useTableColumns } from '@/composables/useTableColumns'
import type { TableColumnDef } from '@/utils/userPrefs'
import type { TableShowColumns } from '@/types/api/common'
import type { SysOperLog, OperlogQueryParams } from '@/types/api/monitor/operlog'

const { t, te } = useI18n()

/** T-11：模块标题展示——委托共享 util，剥离后端存储前缀并 te() 回退（详见 utils/operModuleTitle） */
function formatModuleTitle(title: string | undefined): string {
  return resolveModuleTitle(title, t, te)
}
const queryRef = useTemplateRef('queryRef')
const operlogRef = useTemplateRef('operlogRef')
const { sys_oper_type, sys_common_status } = useDict('sys_oper_type', 'sys_common_status')

// UX-7：列显隐偏好持久化 —— 接入 useTableColumns（用户偏好持久化单一数据源）：
// 偏好恢复 → columns ref；RightToolbar 直改 visible → 回写偏好（刷新/换设备保持一致）
const columnPrefs = useColumnPreferences('monitor:operlog')
const OPERLOG_TABLE_KEY = 'monitor:operlog'
// 列定义顺序即设置面板展示顺序；多选列/租户列/操作列不参与显隐偏好（常驻）
const OPERLOG_COLUMN_DEFS: TableColumnDef[] = [
  { key: 'operId' },
  { key: 'title' },
  { key: 'businessType' },
  { key: 'operName' },
  { key: 'operIp' },
  { key: 'status' },
  { key: 'operTime' },
  { key: 'costTime' }
]
// P2a：label 工厂——locale 切换时由 composable 重建 columns label（visible 偏好保留）
const OPERLOG_COLUMN_LABELS = () => ({
  operId: t('operlog.column.operId'),
  title: t('operlog.column.title'),
  businessType: t('operlog.column.businessType'),
  operName: t('operlog.column.operName'),
  operIp: t('operlog.column.operIp'),
  status: t('operlog.column.status'),
  operTime: t('operlog.column.operTime'),
  costTime: t('common.column.duration')
})
const {
  visibleKeys: operlogVisibleKeys,
  toggle: toggleOperlogColumn,
  bindLabels: bindOperlogLabels
} = useTableColumns({
  pageKey: OPERLOG_TABLE_KEY,
  columns: OPERLOG_COLUMN_DEFS,
  labels: OPERLOG_COLUMN_LABELS,
  getSaved: () => columnPrefs.saved(),
  save: columnPrefs.save
})

// M1: columns 保持 ref（非 computed），因为 RightToolbar 通过 props 直接 mutate visible 属性来切换列显隐；
// 若改 computed，语言切换时 computed 重新求值会返回新对象，丢失用户已切换的 visible 状态。
const columns = ref<Record<string, TableShowColumns>>({
  operId: { label: t('operlog.column.operId'), visible: true },
  title: { label: t('operlog.column.title'), visible: true },
  businessType: { label: t('operlog.column.businessType'), visible: true },
  operName: { label: t('operlog.column.operName'), visible: true },
  operIp: { label: t('operlog.column.operIp'), visible: true },
  status: { label: t('operlog.column.status'), visible: true },
  operTime: { label: t('operlog.column.operTime'), visible: true },
  costTime: { label: t('common.column.duration'), visible: true }
})
// P2a：locale 切换 → columns label 自动更新（labelMap immediate 应用 + watch 跟随）
bindOperlogLabels(columns)

// 偏好 → columns ref（immediate：setup 内同步应用，先于深 watch 注册避免回写回环）
watch(
  operlogVisibleKeys,
  (keys: string[]) => {
    for (const key of Object.keys(columns.value)) {
      columns.value[key].visible = keys.includes(key)
    }
  },
  { immediate: true }
)
// RightToolbar 直改 columns.visible → 回写 useTableColumns（内部仅在真正变化时持久化）
// columns 为原地逐键修改（非整体替换），浅监听不触发；改用 computed 签名仅跟踪 visible 位，
// label 更新（bindLabels）不再触发 deep 全量遍历。
const columnsVisibleSig = computed(() =>
  (Object.values(columns.value) as TableShowColumns[])
    .map((c) => (c.visible ? 1 : 0))
    .join('')
)
watch(columnsVisibleSig, () => {
  const v = columns.value
  for (const key of Object.keys(v)) {
    if (operlogVisibleKeys.value.includes(key) !== v[key].visible) {
      toggleOperlogColumn(key, v[key].visible)
    }
  }
})

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
    status: undefined,
    // 排序键必须在初始对象上**显式声明**：AppMain 用 `:key="route.fullPath"`（含 query）缓存页面，
    // getList 的 syncUrlQuery 把排序写进 URL 后路由变化会重建组件，新实例用
    // restoreQueryFromUrl 回填——它只接受「初始查询对象里已存在的键」。缺这两键时
    // 用户点排序 → 带排序的请求发出 → URL 变化 → 页面重建 → 排序被丢弃并重新按默认序查询
    // （实证：operlog 点「操作日期」后连发 3 个请求，最后渲染的仍是倒序，b73 轮 14）。
    orderByColumn: undefined,
    isAsc: undefined
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

// URL 恢复出的排序必须回灌表头箭头：EP 以自身 sortState 为基线轮转方向，
// 箭头与数据不一致时用户再点一次仍落在同一方向（b73 轮 14 实测：第二次点击依旧 asc，
// 降序点不出来）。回灌后箭头与已恢复的数据一致，后续点击从正确基线轮转。
if (queryParams.value.orderByColumn) {
  defaultSort.value = {
    prop: String(queryParams.value.orderByColumn),
    order: /^asc/i.test(String(queryParams.value.isAsc ?? '')) ? 'ascending' : 'descending'
  }
}

// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter

/** 重置按钮操作（审计 2.5 修复：重置后必须刷新列表）
 * 清除日期范围、重置排序参数并重新触发查询；与原始行为一致（重置后重新应用默认排序）。
 */
function resetQuery() {
  dateRange.value = []
  queryParams.value.orderByColumn = undefined
  queryParams.value.isAsc = undefined
  queryParams.value.tenantId = undefined
  queryRef.value?.resetFields()
  // 批六十四修复（F137⑤ 实证）：EP form-item initialValue 被「URL 同步 + fullPath 重挂载」
  // 污染为搜索值，resetFields 只会“重置回搜索值”——必须显式恢复页面定义的干净默认快照
  resetQueryDefaults(queryParams)
  // defaultSort 可能被 URL 恢复的排序回灌过（见上方），重置必须把它也拉回页面默认，
  // 否则"清空排序"后箭头仍指着用户上一次的排序列、sort() 还会把它重新种回去
  defaultSort.value = { prop: 'operTime', order: 'descending' }
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

// ----- 链完整性校验（GET /monitor/operlog/verify-chain） -----
const verifyLoading = ref(false)
const verifyVisible = ref(false)
const verifyResult = ref<ChainVerifyResult | null>(null)

/** 校验操作日志防篡改 HMAC 链完整性，弹窗展示结果 */
function handleVerifyChain() {
  verifyLoading.value = true
  verifyChain()
    .then((res) => {
      verifyResult.value = res.data ?? null
      verifyVisible.value = true
    })
    .catch(() => {})
    .finally(() => {
      verifyLoading.value = false
    })
}

// ----- 审计合规报告（GET /monitor/operlog/compliance-report，批次十九收尾 E-06） -----
interface ComplianceAnomaly {
  operId: number
  title: string
  operName: string
  operUrl: string
  operIp: string
  errorMsg: string
  operTime: string
}
interface ComplianceReport {
  summary: { total: number; success: number; fail: number }
  anomalies: ComplianceAnomaly[]
  generatedAt: string
  periodFrom: string
  periodTo: string
}
const complianceLoading = ref(false)
const complianceVisible = ref(false)
const complianceReport = ref<ComplianceReport | null>(null)

function loadComplianceReport() {
  complianceLoading.value = true
  getComplianceReport(30)
    .then((res) => {
      complianceReport.value = (res.data ?? null) as ComplianceReport | null
      complianceVisible.value = true
    })
    .catch(() => {})
    .finally(() => {
      complianceLoading.value = false
    })
}

function handleComplianceReport() {
  loadComplianceReport()
}

// ----- 归档锚点列表 + 下载（批次十九收尾，平台专属 monitor:operlogArchive:） -----
const archiveLoading = ref(false)
const archiveVisible = ref(false)
const archiveRows = ref<LogArchiveAnchor[]>([])
const archiveTotal = ref(0)
const archivePage = ref(1)

function loadArchiveList() {
  archiveLoading.value = true
  listArchiveAnchors({ pageNum: archivePage.value, pageSize: 20 })
    .then((res) => {
      archiveRows.value = res.rows ?? []
      archiveTotal.value = res.total ?? 0
      archiveVisible.value = true
    })
    .catch(() => {})
    .finally(() => {
      archiveLoading.value = false
    })
}

function handleArchiveList() {
  archivePage.value = 1
  loadArchiveList()
}

/** 下载归档 JSONL：带 Bearer 的 blob 下载（fetch + a[download]） */
function downloadArchive(row: LogArchiveAnchor) {
  // b72：原链无 catch ⇒ 下载失败时抛 unhandledrejection（前端错误遥测被这类
  // "已被拦截器提示过"的噪声污染）。这里显式收敛：失败提示由全局响应拦截器负责，
  // 本处只保证不再产生未捕获拒绝，并把原因留在 DEV。
  downloadArchiveFile(row.anchorId)
    .then((blob) => {
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `anchor_${row.firstOperId}_${row.lastOperId}.jsonl`
      a.click()
      URL.revokeObjectURL(url)
    })
    .catch((e: unknown) => {
      if (import.meta.env.DEV) console.error('[operlog] 归档下载失败:', e)
    })
}

getList()
// TierS-7: 接入自动刷新（读取 userPrefs.autoRefreshInterval，0 表示禁用）
useAutoRefresh(() => getList())
</script>
