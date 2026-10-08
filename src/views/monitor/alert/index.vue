<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('alert.search.name')" prop="name">
          <el-input
            v-model="queryParams.name"
            :placeholder="t('alert.search.phName')"
            :maxlength="64"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('alert.search.metric')" prop="metric">
          <el-select
            :aria-label="t('alert.search.metric')"
            v-model="queryParams.metric"
            :placeholder="t('alert.search.phMetric')"
            clearable
            class="w-[200px]"
          >
            <el-option v-for="opt in metricOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('alert.search.enabled')" prop="enabled">
          <el-select
            :aria-label="t('alert.search.enabled')"
            v-model="queryParams.enabled"
            :placeholder="t('alert.search.phEnabled')"
            clearable
            class="w-[140px]"
          >
            <el-option :label="t('common.enabled')" value="1" />
            <el-option :label="t('common.disabled')" value="0" />
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['monitor:alert:add']">
          {{ t('common.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="success"
          plain
          icon="Edit"
          :disabled="single"
          @click="handleUpdate()"
          v-hasPermi="['monitor:alert:edit']"
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
          v-hasPermi="['monitor:alert:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Download"
          @click="handleExport"
          v-hasPermi="['monitor:alert:list']"
        >
          {{ t('common.export') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysAlertRule) => row.id"
      @selection-change="handleSelectionChange"
      :default-sort="defaultSort"
      @sort-change="handleSortChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column :label="t('alert.column.id')" align="center" prop="id" width="80" />
      <el-table-column
        :label="t('alert.column.name')"
        align="center"
        prop="name"
        min-width="140"
        show-overflow-tooltip
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      />
      <el-table-column
        :label="t('alert.column.metric')"
        align="center"
        prop="metric"
        min-width="150"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      >
        <template #default="scope">
          <el-tag size="small">{{ metricLabel(scope.row.metric) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('alert.column.trigger')" align="center" min-width="130">
        <template #default="scope">
          <span>{{ comparatorLabel(scope.row.comparator) }} {{ scope.row.threshold }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('alert.column.silentMinutes')" align="center" prop="silentMinutes" width="100">
        <template #default="scope">
          <span>{{ scope.row.silentMinutes }} {{ t('alert.unit.minutes') }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('alert.column.notifyChannel')" align="center" min-width="130" show-overflow-tooltip>
        <template #default="scope">
          <span v-if="channelName(scope.row.notifyChannelId)">{{ channelName(scope.row.notifyChannelId) }}</span>
          <el-tag v-else size="small" type="info">{{ t('alert.notifyNone') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('alert.column.enabled')"
        align="center"
        prop="enabled"
        width="90"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      >
        <template #default="scope">
          <el-switch
            :aria-label="`${scope.row.name} ${t('alert.column.enabled')}`"
            v-model="scope.row.enabled"
            active-value="1"
            inactive-value="0"
            @change="handleEnabledChange(scope.row)"
            v-hasPermi="['monitor:alert:edit']"
          ></el-switch>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('alert.column.lastFiredAt')"
        align="center"
        prop="lastFiredAt"
        width="170"
        sortable="custom"
        :sort-orders="['descending', 'ascending']"
      >
        <template #default="scope">
          <span v-if="scope.row.lastFiredAt">{{ parseTime(scope.row.lastFiredAt) }}</span>
          <span v-else>-</span>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="220"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="VideoPlay"
            @click="handleEvaluate(scope.row)"
            v-hasPermi="['monitor:alert:edit']"
          >
            {{ t('alert.btn.evaluate') }}
          </el-button>
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['monitor:alert:edit']">
            {{ t('common.edit') }}
          </el-button>
          <el-button link type="primary" icon="Delete" @click="handleDelete(scope.row)" v-hasPermi="['monitor:alert:remove']">
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

    <!-- 添加或修改告警规则对话框 -->
    <el-dialog :title="title" v-model="open" width="min(90%, 620px)" append-to-body destroy-on-close>
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item :label="t('alert.form.name')" prop="name">
          <el-input v-model.trim="form.name" :placeholder="t('alert.form.phName')" :maxlength="64" />
        </el-form-item>
        <el-form-item :label="t('alert.form.metric')" prop="metric">
          <el-select :aria-label="t('alert.form.metric')" v-model="form.metric" :placeholder="t('alert.form.phMetric')" class="w-full">
            <el-option v-for="opt in metricOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('alert.form.comparator')" prop="comparator">
          <el-select :aria-label="t('alert.form.comparator')" v-model="form.comparator" class="w-[140px]">
            <el-option v-for="opt in comparatorOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('alert.form.threshold')" prop="threshold">
          <el-input-number v-model="form.threshold" :min="0" :precision="2" controls-position="right" />
        </el-form-item>
        <el-form-item :label="t('alert.form.silentMinutes')" prop="silentMinutes">
          <el-input-number v-model="form.silentMinutes" :min="0" :max="14400" controls-position="right" />
          <span class="form-tip">{{ t('alert.form.silentMinutesTip') }}</span>
        </el-form-item>
        <el-form-item :label="t('alert.form.notifyChannelId')" prop="notifyChannelId">
          <el-select
            :aria-label="t('alert.form.notifyChannelId')"
            v-model="form.notifyChannelId"
            :placeholder="t('alert.form.phNotifyChannel')"
            :loading="channelLoading"
            clearable
            class="w-full"
          >
            <el-option
              v-for="ch in channelList"
              :key="ch.channelId"
              :label="ch.channelName"
              :value="ch.channelId!"
            />
          </el-select>
          <div class="form-tip-block">{{ t('alert.form.notifyChannelTip') }}</div>
        </el-form-item>
        <el-form-item :label="t('alert.form.notifyTemplateId')" prop="notifyTemplateId">
          <el-select
            :aria-label="t('alert.form.notifyTemplateId')"
            v-model="form.notifyTemplateId"
            :placeholder="t('alert.form.phNotifyTemplate')"
            :loading="templateLoading"
            clearable
            class="w-full"
          >
            <el-option
              v-for="tpl in templateList"
              :key="tpl.templateId"
              :label="tpl.templateName"
              :value="tpl.templateId!"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('alert.form.enabled')">
          <el-switch v-model="form.enabled" active-value="1" inactive-value="0" />
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">{{ t('common.confirm') }}</el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 立即评估结果对话框 -->
    <el-dialog
      :title="t('alert.evaluate.title')"
      v-model="evaluateOpen"
      width="min(90%, 480px)"
      append-to-body
      destroy-on-close
    >
      <el-descriptions :column="1" border>
        <el-descriptions-item :label="t('alert.evaluate.metricValue')">
          <span class="font-semibold">{{ evaluateResult?.metricValue ?? '-' }}</span>
        </el-descriptions-item>
        <el-descriptions-item :label="t('alert.evaluate.fired')">
          <el-tag v-if="evaluateResult?.fired" type="danger">{{ t('alert.evaluate.firedYes') }}</el-tag>
          <el-tag v-else type="success">{{ t('alert.evaluate.firedNo') }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('alert.evaluate.reason')">
          {{ evaluateResult?.reason || '-' }}
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <el-button type="primary" @click="evaluateOpen = false">{{ t('common.confirm') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="MonitorAlert">
import { useMobileFilter } from '@/composables/useMobileFilter'
import { listAlert, getAlert, addAlert, updateAlert, delAlert, changeAlertEnabled, evaluateAlert, exportAlert } from '@/api/monitor/alert'
import { listChannel, listTemplate } from '@/api/system/msg'
import type { SysAlertRule, AlertRuleQueryParams, AlertRuleSaveDto, AlertEvaluateResult } from '@/types/api/monitor/alert'
import type { SysMsgChannel, SysMsgTemplate } from '@/types/api/system/msg'
import type { FormInstance, FormRules } from 'element-plus'
import modal from '@/plugins/modal'

const { t } = useI18n()
const queryRef = useTemplateRef('queryRef')
const formRef = useTemplateRef<FormInstance>('formRef')

// 指标下拉（与后端 sys_alert_service.rs::VALID_METRICS 白名单对齐）
const metricOptions = computed(() => [
  { value: 'login_failed_5m', label: t('alert.metric.login_failed_5m') },
  { value: 'http_5xx_5m', label: t('alert.metric.http_5xx_5m') },
  { value: 'job_failed_24h', label: t('alert.metric.job_failed_24h') },
  { value: 'online_users', label: t('alert.metric.online_users') },
  { value: 'cpu_usage', label: t('alert.metric.cpu_usage') },
  { value: 'mem_usage', label: t('alert.metric.mem_usage') },
  { value: 'disk_usage', label: t('alert.metric.disk_usage') }
])

// 比较器下拉（与后端 VALID_COMPARATORS 白名单对齐）
const comparatorOptions = computed(() => [
  { value: 'gt', label: t('alert.comparator.gt') },
  { value: 'lt', label: t('alert.comparator.lt') },
  { value: 'ge', label: t('alert.comparator.ge') },
  { value: 'le', label: t('alert.comparator.le') }
])

function metricLabel(metric: string): string {
  const hit = metricOptions.value.find((o: { value: string; label: string }) => o.value === metric)
  return hit ? hit.label : metric
}

function comparatorLabel(comparator: string): string {
  const hit = comparatorOptions.value.find((o: { value: string; label: string }) => o.value === comparator)
  return hit ? hit.label : comparator
}

const loading = ref(false)
const submitLoading = ref(false)
const showSearch = ref(true)
// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
useMobileFilter(showSearch)
const dataList = ref<SysAlertRule[]>([])
const ids = ref<(number | string)[]>([])
const single = ref(true)
const multiple = ref(true)
const total = ref(0)
const title = ref('')
const open = ref(false)
const defaultSort = ref({ prop: 'lastFiredAt', order: 'descending' })

// 消息渠道/模板下拉数据（编辑弹窗与列表展示共用）
const channelList = ref<SysMsgChannel[]>([])
const channelLoading = ref(false)
const templateList = ref<SysMsgTemplate[]>([])
const templateLoading = ref(false)

const queryParams = ref<AlertRuleQueryParams>({
  pageNum: 1,
  pageSize: 10,
  name: undefined,
  metric: undefined,
  enabled: undefined
})

const defaultForm = (): AlertRuleSaveDto => ({
  id: undefined,
  name: '',
  metric: 'login_failed_5m',
  comparator: 'gt',
  threshold: 0,
  silentMinutes: 30,
  notifyChannelId: null,
  notifyTemplateId: null,
  enabled: '1'
})

const form = ref<AlertRuleSaveDto>(defaultForm())

const rules = computed<FormRules>(() => ({
  name: [{ required: true, message: t('alert.rule.nameRequired'), trigger: 'blur' }],
  metric: [{ required: true, message: t('alert.rule.metricRequired'), trigger: 'change' }],
  comparator: [{ required: true, message: t('alert.rule.comparatorRequired'), trigger: 'change' }],
  threshold: [{ required: true, message: t('alert.rule.thresholdRequired'), trigger: 'blur' }]
}))

/** 查询告警规则列表 */
function getList(): void {
  loading.value = true
  listAlert(queryParams.value)
    .then((res) => {
      dataList.value = res.rows || []
      total.value = res.total || 0
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

/** 搜索按钮操作 */
function handleQuery(): void {
  queryParams.value.pageNum = 1
  getList()
}

/** 重置按钮操作：清空排序参数后按默认排序重新查询 */
function resetQuery(): void {
  queryParams.value.orderByColumn = undefined
  queryParams.value.isAsc = undefined
  queryRef.value?.resetFields()
  handleQuery()
}

/** 排序触发事件 */
function handleSortChange(column: { prop: string | null; order: string | null }): void {
  if (column.order === null) {
    queryParams.value.orderByColumn = undefined
    queryParams.value.isAsc = undefined
  } else {
    queryParams.value.orderByColumn = column.prop || undefined
    queryParams.value.isAsc = column.order === 'ascending' ? 'asc' : 'desc'
  }
  getList()
}

/** 多选框选中数据 */
function handleSelectionChange(selection: SysAlertRule[]): void {
  ids.value = selection.map((item) => item.id)
  single.value = selection.length !== 1
  multiple.value = !selection.length
}

/** 加载消息渠道下拉（启用的渠道） */
function loadChannels(): void {
  channelLoading.value = true
  listChannel({ pageNum: 1, pageSize: 100, status: '0' })
    .then((res) => {
      channelList.value = res.rows || []
    })
    .catch(() => {})
    .finally(() => {
      channelLoading.value = false
    })
}

/** 加载消息模板下拉（启用的模板） */
function loadTemplates(): void {
  templateLoading.value = true
  listTemplate({ pageNum: 1, pageSize: 100, status: '0' })
    .then((res) => {
      templateList.value = res.rows || []
    })
    .catch(() => {})
    .finally(() => {
      templateLoading.value = false
    })
}

/** 渠道 ID → 渠道名（列表展示；下拉未加载时回退显示 ID） */
function channelName(channelId: number | null): string | null {
  if (channelId == null) return null
  const hit = channelList.value.find((ch: SysMsgChannel) => ch.channelId === channelId)
  return hit ? hit.channelName : String(channelId)
}

/** 新增按钮操作 */
function handleAdd(): void {
  form.value = defaultForm()
  title.value = t('alert.title') + ' - ' + t('common.add')
  loadChannels()
  loadTemplates()
  open.value = true
}

/** 修改按钮操作（可传行数据） */
function handleUpdate(row?: SysAlertRule): void {
  const id = row?.id ?? ids.value[0]
  if (id == null) return
  getAlert(id)
    .then((res) => {
      form.value = { ...defaultForm(), ...(res.data || {}) } as AlertRuleSaveDto
      title.value = t('alert.title') + ' - ' + t('common.edit')
      loadChannels()
      loadTemplates()
      open.value = true
    })
    .catch(() => {})
}

/** 提交按钮操作 */
function submitForm(): void {
  formRef.value?.validate((valid: boolean) => {
    if (!valid) return
    submitLoading.value = true
    const api = form.value.id != null ? updateAlert : addAlert
    api(form.value)
      .then(() => {
        modal.msgSuccess(t('common.success'))
        open.value = false
        getList()
      })
      .catch(() => {})
      .finally(() => {
        submitLoading.value = false
      })
  })
}

/** 取消按钮 */
function cancel(): void {
  open.value = false
}

/** 删除按钮操作（支持行删除与批量删除） */
function handleDelete(row?: SysAlertRule): void {
  const deleteIds = row?.id != null ? [row.id] : ids.value
  if (!deleteIds.length) return
  modal
    .confirm(t('alert.tip.confirmDelete', { ids: deleteIds.join(',') }))
    .then(() => delAlert(deleteIds))
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}

/** 启停切换 */
function handleEnabledChange(row: SysAlertRule): void {
  const text = row.enabled === '1' ? t('common.enabled') : t('common.disabled')
  modal
    .confirm(t('alert.tip.confirmChange', { text, name: row.name }))
    .then(() => changeAlertEnabled(row.id, row.enabled ?? '0'))
    .then(() => modal.msgSuccess(text + t('common.success')))
    .catch(() => {
      row.enabled = row.enabled === '1' ? '0' : '1'
    })
}

// ----- 立即评估 -----
const evaluateOpen = ref(false)
const evaluateResult = ref<AlertEvaluateResult | null>(null)

/** 立即评估：采集指标并按规则判定，弹结果 */
function handleEvaluate(row: SysAlertRule): void {
  evaluateAlert(row.id)
    .then((res) => {
      evaluateResult.value = res.data ?? null
      evaluateOpen.value = true
    })
    .catch(() => {})
}

/** 导出按钮操作（Excel） */
function handleExport(): void {
  exportAlert(queryParams.value)
}

// 初始化：列表 + 渠道名展示所需的渠道列表
getList()
loadChannels()
</script>

<style lang="scss" scoped>
/* SCSS 豁免：表单行内提示间距微调，限定本页作用域 */
.form-tip {
  margin-left: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.form-tip-block {
  width: 100%;
  margin-top: 4px;
  font-size: 12px;
  line-height: 1.4;
  color: var(--el-text-color-secondary);
}
</style>
