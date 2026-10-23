<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('auditChange.search.tableName')" prop="tableName">
          <el-input
            v-model="queryParams.tableName"
            :aria-label="t('auditChange.search.tableName')"
            :placeholder="t('auditChange.search.phTableName')"
            :maxlength="64"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('auditChange.search.rowPk')" prop="rowPk">
          <el-input
            v-model="queryParams.rowPk"
            :aria-label="t('auditChange.search.rowPk')"
            :placeholder="t('auditChange.search.phRowPk')"
            :maxlength="64"
            clearable
            class="w-[160px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('auditChange.search.action')" prop="action">
          <el-select
            :aria-label="t('auditChange.search.action')"
            v-model="queryParams.action"
            :placeholder="t('auditChange.search.phAction')"
            clearable
            class="w-[140px]"
          >
            <el-option v-for="opt in actionOptions" :key="opt" :label="opt" :value="opt" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('auditChange.search.operatorName')" prop="operatorName">
          <el-input
            v-model="queryParams.operatorName"
            :aria-label="t('auditChange.search.operatorName')"
            :placeholder="t('auditChange.search.phOperatorName')"
            :maxlength="30"
            clearable
            class="w-[160px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('auditChange.search.operatedAt')" class="w-[308px]">
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
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Download"
          :loading="exportLoading"
          @click="handleExport"
          v-hasPermi="['system:audit-change:export']"
        >
          {{ t('common.export') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysAuditChange) => row.id"
      :default-sort="defaultSort"
      @sort-change="handleSortChange"
    >
      <!-- 行展开：before/after 双栏 diff 对比 -->
      <el-table-column type="expand">
        <template #default="scope">
          <div class="diff-wrap">
            <el-alert
              v-if="parseSnapshot(scope.row.changedFields).length === 0"
              :title="t('auditChange.diff.noChangedField')"
              type="info"
              :closable="false"
              show-icon
            />
            <template v-else>
              <div class="diff-header">
                <span>{{ t('auditChange.diff.changedFields') }}</span>
                <el-tag
                  v-for="f in parseSnapshot(scope.row.changedFields)"
                  :key="f"
                  size="small"
                  type="warning"
                  class="mr5"
                >
                  {{ f }}
                </el-tag>
              </div>
              <el-row :gutter="12">
                <el-col :xs="24" :lg="12">
                  <div class="diff-pane">
                    <div class="diff-pane-title diff-before">{{ t('auditChange.diff.before') }}</div>
                    <div class="diff-body">
                      <div
                        v-for="field in diffFields(scope.row)"
                        :key="field"
                        class="diff-row"
                        :class="{ 'diff-changed': isFieldChanged(scope.row, field) }"
                      >
                        <span class="diff-field">{{ field }}</span>
                        <code class="diff-value">{{ formatValue(scope.row, 'before', field) }}</code>
                      </div>
                    </div>
                  </div>
                </el-col>
                <el-col :xs="24" :lg="12">
                  <div class="diff-pane">
                    <div class="diff-pane-title diff-after">{{ t('auditChange.diff.after') }}</div>
                    <div class="diff-body">
                      <div
                        v-for="field in diffFields(scope.row)"
                        :key="field"
                        class="diff-row"
                        :class="{ 'diff-changed': isFieldChanged(scope.row, field) }"
                      >
                        <span class="diff-field">{{ field }}</span>
                        <code class="diff-value">{{ formatValue(scope.row, 'after', field) }}</code>
                      </div>
                    </div>
                  </div>
                </el-col>
              </el-row>
            </template>
          </div>
        </template>
      </el-table-column>
      <el-table-column :label="t('auditChange.column.id')" align="center" prop="id" width="90" />
      <TenantColumn />
      <el-table-column
        :label="t('auditChange.column.tableName')"
        align="center"
        prop="tableName"
        min-width="140"
        show-overflow-tooltip
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      />
      <el-table-column
        :label="t('auditChange.column.rowPk')"
        align="center"
        prop="rowPk"
        width="120"
        show-overflow-tooltip
      />
      <el-table-column :label="t('auditChange.column.action')" align="center" prop="action" width="100">
        <template #default="scope">
          <el-tag :type="actionTagType(scope.row.action)">{{ scope.row.action }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('auditChange.column.changedFields')" min-width="180">
        <template #default="scope">
          <el-tag
            v-for="f in parseSnapshot(scope.row.changedFields).slice(0, 5)"
            :key="f"
            size="small"
            type="warning"
            class="mr5"
          >
            {{ f }}
          </el-tag>
          <span v-if="parseSnapshot(scope.row.changedFields).length > 5">
            +{{ parseSnapshot(scope.row.changedFields).length - 5 }}
          </span>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('auditChange.column.operatorName')"
        align="center"
        prop="operatorName"
        width="120"
        show-overflow-tooltip
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      />
      <el-table-column
        :label="t('auditChange.column.operatedAt')"
        align="center"
        prop="operatedAt"
        width="180"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      >
        <template #default="scope">
          <span>{{ parseTime(scope.row.operatedAt) }}</span>
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

<script setup lang="ts" name="AuditChange">
import TenantColumn from '@/components/TenantColumn/index.vue'
import { listAuditChange, exportAuditChange } from '@/api/system/auditChange'
import { addDateRange } from '@/utils/stepby'
import type { SysAuditChange, AuditChangeQueryParams } from '@/types/api/system/auditChange'
import { useCrudTable } from '@/composables/useCrudTable'
import { useMobileFilter } from '@/composables/useMobileFilter'
import type { Ref } from 'vue'

const { t } = useI18n()
const queryRef = useTemplateRef('queryRef')

// 变更动作下拉（后端 action 取值域）
const actionOptions = ['INSERT', 'UPDATE', 'DELETE']

const exportLoading = ref(false)
const dateRange = ref<string[]>([])
const defaultSort = ref({ prop: 'operatedAt', order: 'descending' })

const queryParams = ref<AuditChangeQueryParams>({
  pageNum: 1,
  pageSize: 10,
  tableName: undefined,
  rowPk: undefined,
  action: undefined,
  operatorName: undefined,
  // 排序键必须显式声明，否则 URL 同步引发的页面重建会把用户排序丢掉（operlog 同族缺陷，b73 轮 14）
  orderByColumn: undefined,
  isAsc: undefined
})

// 本页为只读审计页（无新增/编辑/删除表单）：getApi/addApi/updateApi 按只读页惯例传空实现（operlog 同模式）
const form = ref({}) as Ref<SysAuditChange>
const formRef = ref<unknown>(null)

const { dataList, loading, showSearch, total, getList, handleQuery, resetQuery, handleSortChange } = useCrudTable<
  SysAuditChange,
  AuditChangeQueryParams
>({
  listApi: (params) =>
    listAuditChange(
      addDateRange(params as unknown as Record<string, unknown>, dateRange.value) as unknown as AuditChangeQueryParams
    ),
  idField: 'id',
  defaultForm: () => ({}) as SysAuditChange,
  titleKey: 'auditChange.column.tableName',
  queryParams,
  form,
  formRef: formRef as never,
  queryRef,
  // 批六十四：重置前清空日期区间（composable 感知不到的页面级查询状态）
  onReset: () => {
    dateRange.value = []
  },
  supportsSort: true
})

// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
useMobileFilter(showSearch)

// resetQuery 来自 useCrudTable（批六十四修复：EP initialValue 被 URL 同步污染，
// 页面本地 shadow 版本同样失效——统一走 composable 的干净默认值快照恢复；
// 日期区间经 onReset 钩子清空）

/** 导出按钮操作（CSV 下载，携带当前过滤条件） */
function handleExport(): void {
  exportLoading.value = true
  exportAuditChange(
    addDateRange(
      queryParams.value as unknown as Record<string, unknown>,
      dateRange.value
    ) as unknown as AuditChangeQueryParams
  )
    .catch(() => {})
    .finally(() => {
      exportLoading.value = false
    })
}

// ==================== diff 视图辅助 ====================

/** 解析 JSON 数组/对象字符串，失败时返回空数组（防御脏数据） */
function parseSnapshot(json: string | null): string[] {
  if (!json) return []
  try {
    const parsed = JSON.parse(json)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

/** 解析快照对象字符串，失败时返回空对象 */
function parseObject(json: string | null): Record<string, unknown> {
  if (!json) return {}
  try {
    const parsed = JSON.parse(json)
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {}
  } catch {
    return {}
  }
}

/** diff 双栏字段并集（before + after + changedFields，保证新增/删除字段也在对比中） */
function diffFields(row: SysAuditChange): string[] {
  const before = parseObject(row.beforeData)
  const after = parseObject(row.afterData)
  const changed = parseSnapshot(row.changedFields)
  const set = new Set<string>([...Object.keys(before), ...Object.keys(after), ...changed])
  return Array.from(set)
}

/** 字段是否在变更清单中（展开区高亮用） */
function isFieldChanged(row: SysAuditChange, field: string): boolean {
  return parseSnapshot(row.changedFields).includes(field)
}

/** 取指定快照中的字段值并 pretty 展示（对象/数组 JSON 格式化，其余原样；敏感值 *** 由后端打码后原样保留） */
function formatValue(row: SysAuditChange, side: 'before' | 'after', field: string): string {
  const snapshot = parseObject(side === 'before' ? row.beforeData : row.afterData)
  if (!(field in snapshot)) return '-'
  const value = snapshot[field]
  if (value === null || value === undefined) return '-'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

/** 动作标签颜色：INSERT 绿 / UPDATE 蓝 / DELETE 红 */
function actionTagType(action: string): 'success' | 'primary' | 'danger' {
  if (action === 'INSERT') return 'success'
  if (action === 'DELETE') return 'danger'
  return 'primary'
}

getList()
</script>

<style lang="scss" scoped>
/* SCSS 豁免：diff 双栏布局涉及嵌套选择器与滚动区样式，Tailwind 表达冗长，限定本页作用域 */
.diff-wrap {
  padding: 8px 16px 16px;
}

.diff-header {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 10px;
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.diff-pane-title {
  padding: 4px 10px;
  border-radius: 4px 4px 0 0;
  font-size: 12px;
  font-weight: 600;

  &.diff-before {
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger);
  }

  &.diff-after {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success);
  }
}

.diff-body {
  max-height: 320px;
  overflow: auto;
  border: 1px solid var(--el-border-color-lighter);
  border-top: none;
  border-radius: 0 0 4px 4px;
}

.diff-row {
  display: flex;
  gap: 10px;
  padding: 4px 10px;
  font-size: 12px;
  border-bottom: 1px dashed var(--el-border-color-lighter);

  &:last-child {
    border-bottom: none;
  }

  &.diff-changed {
    background: var(--el-color-warning-light-9);
  }
}

.diff-field {
  width: 160px;
  flex-shrink: 0;
  color: var(--el-text-color-secondary);
  word-break: break-all;
}

.diff-value {
  flex: 1;
  font-family: var(--el-font-family-mono, monospace);
  white-space: pre-wrap;
  word-break: break-all;
  color: var(--el-text-color-primary);
}
</style>
