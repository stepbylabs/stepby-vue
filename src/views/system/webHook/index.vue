<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="90px">
        <el-form-item :label="t('webHook.search.hookName')" prop="hookName">
          <el-input
            v-model="queryParams.hookName"
            :placeholder="t('webHook.search.phHookName')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
            :aria-label="t('webHook.search.phHookName')"
          />
        </el-form-item>
        <el-form-item :label="t('webHook.search.eventTypes')" prop="eventTypes">
          <el-select
            :aria-label="t('webHook.search.eventTypes')"
            v-model="searchEventTypes"
            :placeholder="t('webHook.search.phEventTypes')"
            multiple
            filterable
            allow-create
            default-first-option
            clearable
            class="w-[240px]"
          >
            <el-option v-for="opt in eventTypeOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('webHook.search.status')" prop="status">
          <el-select
            :aria-label="t('webHook.search.status')"
            v-model="queryParams.status"
            :placeholder="t('webHook.search.phStatus')"
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:webHook:add']">
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
          v-hasPermi="['system:webHook:edit']"
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
          v-hasPermi="['system:webHook:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Promotion"
          :disabled="single"
          @click="openTestDialog"
          v-hasPermi="['system:webHook:test']"
        >
          {{ t('webHook.btn.test') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Download"
          :loading="exportLoading"
          @click="handleExport"
          v-hasPermi="['system:webHook:query']"
        >
          {{ t('webHook.btn.export') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="info" plain icon="Operation" @click="handleLog" v-hasPermi="['system:webHook:log:list']">
          {{ t('webHook.btn.log') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="info" plain icon="Files" @click="openEventCatalog" v-hasPermi="['system:webhook:event:list']">
          {{ t('webHook.btn.eventCatalog') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="dataList"
      :row-key="(row: SysWebHook) => row.id"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column :label="t('webHook.column.id')" align="center" prop="id" width="80" />
      <el-table-column :label="t('webHook.column.hookName')" align="center" min-width="150" show-overflow-tooltip>
        <template #default="scope">
          <el-link type="primary" underline="never" @click="handleUpdate(scope.row)">
            {{ scope.row.hookName }}
          </el-link>
        </template>
      </el-table-column>
      <el-table-column :label="t('webHook.column.eventTypes')" align="center" width="200">
        <template #default="scope">
          <template v-if="scope.row.eventTypes">
            <el-tag v-for="et in splitEventTypes(scope.row.eventTypes)" :key="et" size="small" class="mr5">
              {{ eventTypeLabel(et) }}
            </el-tag>
          </template>
          <el-tag v-else size="small" type="success">{{ t('webHook.eventType.all') }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('webHook.column.targetUrl')"
        align="center"
        prop="targetUrl"
        min-width="220"
        show-overflow-tooltip
      />
      <el-table-column :label="t('webHook.column.contentType')" align="center" prop="contentType" width="130" />
      <el-table-column :label="t('webHook.column.timeoutSecs')" align="center" prop="timeoutSecs" width="90" />
      <el-table-column :label="t('webHook.column.status')" align="center" width="90">
        <template #default="scope">
          <el-switch
            :aria-label="`${scope.row.hookName} ${t('webHook.column.status')}`"
            v-model="scope.row.status"
            :loading="statusLoadingIds.includes(String(scope.row.id))"
            active-value="0"
            inactive-value="1"
            @change="handleStatusChange(scope.row)"
            v-hasPermi="['system:webHook:status']"
          ></el-switch>
        </template>
      </el-table-column>
      <el-table-column :label="t('webHook.column.createTime')" align="center" prop="createTime" width="170" />
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="280"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Promotion"
            @click="openTestDialog(scope.row)"
            v-hasPermi="['system:webHook:test']"
          >
            {{ t('webHook.btn.test') }}
          </el-button>
          <!-- 按事件目录测试发送：下拉选事件，点击即以该事件样例投递 -->
          <el-dropdown
            v-hasPermi="['system:webhook:test-send']"
            class="mr5"
            @command="(eventKey: string) => handleTestSendByEvent(scope.row, eventKey)"
          >
            <el-button link type="primary" icon="Position" :loading="testSendLoadingId === scope.row.id">
              {{ t('webHook.btn.testSend') }}
            </el-button>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item
                  v-for="opt in eventCatalogOptions"
                  :key="opt.value"
                  :command="opt.value"
                  :disabled="opt.disabled"
                >
                  {{ opt.label }}
                </el-dropdown-item>
                <el-dropdown-item v-if="eventCatalogOptions.length === 0" disabled>
                  {{ t('webHook.eventCatalog.empty') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
          <el-button
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row)"
            v-hasPermi="['system:webHook:edit']"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['system:webHook:remove']"
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

    <!-- 添加或修改回调配置对话框 -->
    <el-dialog
      :close-on-click-modal="false"
      :title="title"
      :before-close="beforeDialogClose"
      v-model="open"
      width="min(90%, 620px)"
      append-to-body
      destroy-on-close
      @open="onFormDialogOpen"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px">
        <el-form-item :label="t('webHook.form.hookName')" prop="hookName">
          <el-input
            v-model.trim="form.hookName"
            :placeholder="t('webHook.form.phHookName')"
            :maxlength="64"
            :aria-label="t('webHook.form.phHookName')"
          />
        </el-form-item>
        <!-- 方案 C：订阅口径收敛为事件目录 subscribed_events（旧 eventTypes 输入已移除，
             存量配置由后端迁移 m20261003_000004 收敛并回显在新列） -->
        <el-form-item :label="t('webHook.form.subscribedEvents')" prop="subscribedEvents">
          <div class="w-full">
            <el-select
              :aria-label="t('webHook.form.subscribedEvents')"
              v-model="formSubscribedEvents"
              multiple
              filterable
              :loading="eventCatalogLoading"
              :placeholder="t('webHook.form.phSubscribedEvents')"
              class="w-full"
            >
              <el-option v-for="opt in eventCatalogOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            </el-select>
            <div v-if="eventCatalogLoadError" class="mt-1 text-xs text-[var(--el-color-danger)]">
              {{ t('webHook.eventCatalog.loadFail') }}
              <el-button link type="primary" size="small" @click="loadEventOptionsFull">
                {{ t('common.retry') }}
              </el-button>
            </div>
            <div
              v-else-if="eventCatalogTruncated"
              class="mt-1 text-xs text-[var(--el-color-warning)]"
              data-test="event-catalog-truncated"
            >
              {{ t('common.optionsTruncated', { count: eventCatalogOptions.length, total: eventCatalogTotal }) }}
            </div>
            <div v-else class="mt-1 text-xs text-text-secondary">{{ t('webHook.form.subscribedEventsTip') }}</div>
          </div>
        </el-form-item>
        <el-form-item :label="t('webHook.form.targetUrl')" prop="targetUrl">
          <el-input
            v-model.trim="form.targetUrl"
            :placeholder="t('webHook.form.phTargetUrl')"
            :maxlength="2048"
            :aria-label="t('webHook.form.phTargetUrl')"
          />
        </el-form-item>
        <el-form-item :label="t('webHook.form.secret')" prop="secret">
          <div class="w-full">
            <el-input
              v-model="form.secret"
              type="password"
              show-password
              :placeholder="
                form.id != null && form.hasSecret ? t('webHook.form.phSecretKeep') : t('webHook.form.phSecret')
              "
              :maxlength="256"
            />
            <div class="mt-1 text-xs text-text-secondary">{{ t('webHook.form.secretTip') }}</div>
          </div>
        </el-form-item>
        <el-form-item :label="t('webHook.form.contentType')" prop="contentType">
          <el-radio-group v-model="form.contentType">
            <el-radio v-for="opt in contentTypeOptions" :key="opt" :value="opt">{{ opt }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('webHook.form.timeoutSecs')" prop="timeoutSecs">
          <el-input-number v-model="form.timeoutSecs" :min="1" :max="30" :step="1" />
          <span class="ml-2 text-text-secondary">{{ t('webHook.form.timeoutSecsUnit') }}</span>
        </el-form-item>
        <el-form-item :label="t('webHook.form.status')">
          <el-switch
            v-model="form.status"
            active-value="0"
            inactive-value="1"
            :active-text="t('common.enabled')"
            :inactive-text="t('common.disabled')"
          />
        </el-form-item>
        <el-form-item :label="t('webHook.form.remark')" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :rows="2"
            :placeholder="t('webHook.form.phRemark')"
            :maxlength="500"
            show-word-limit
            :aria-label="t('webHook.form.phRemark')"
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

    <!-- 测试推送对话框 -->
    <el-dialog
      :close-on-click-modal="false"
      :title="t('webHook.tip.testTitle')"
      v-model="testOpen"
      width="min(90%, 640px)"
      append-to-body
      destroy-on-close
    >
      <el-form :model="testForm" label-width="110px">
        <el-form-item :label="t('webHook.column.hookName')">
          <span>{{ currentHook?.hookName }}</span>
        </el-form-item>
        <el-form-item :label="t('webHook.test.eventType')">
          <el-select
            :aria-label="t('webHook.test.eventType')"
            v-model="testForm.eventType"
            :placeholder="t('webHook.test.phEventType')"
            clearable
            filterable
            allow-create
            class="w-full"
          >
            <el-option v-for="opt in eventCatalogOptions" :key="opt.value" :label="opt.label" :value="opt.value" />
            <el-option
              v-for="opt in eventTypeOptions"
              :key="'legacy-' + opt.value"
              :label="opt.label"
              :value="opt.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('webHook.test.payload')">
          <el-input
            v-model="testForm.payload"
            type="textarea"
            :rows="6"
            :placeholder="t('webHook.test.phPayload')"
            class="font-mono"
            :aria-label="t('webHook.test.phPayload')"
          />
        </el-form-item>
      </el-form>
      <el-descriptions :column="1" border v-if="testResult" class="mb15">
        <el-descriptions-item :label="t('webHook.test.result')">
          <el-tag v-if="testResult.ok" type="success">{{ t('webHook.test.ok') }}</el-tag>
          <el-tag v-else type="danger">{{ t('webHook.test.fail') }}</el-tag>
        </el-descriptions-item>
        <el-descriptions-item :label="t('webHook.test.statusCode')">{{ testResult.statusCode }}</el-descriptions-item>
        <el-descriptions-item :label="t('webHook.test.costMs')">{{ testResult.costMs }}</el-descriptions-item>
        <el-descriptions-item :label="t('webHook.test.response')">
          <pre class="result-pre">{{ testResult.response || '-' }}</pre>
        </el-descriptions-item>
        <el-descriptions-item v-if="testResult.error" :label="t('webHook.test.error')">
          <pre class="result-pre text-danger">{{ testResult.error }}</pre>
        </el-descriptions-item>
      </el-descriptions>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="testLoading" @click="doTest">{{ t('webHook.test.send') }}</el-button>
          <el-button @click="testOpen = false">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 事件目录对话框 + 全量下拉 + 启停（独立区块，见 EventCatalogSection.vue） -->
    <EventCatalogSection
      ref="eventCatalogSectionRef"
      v-model:open="eventCatalogOpen"
      v-model:options="eventCatalogOptions"
    />
  </div>
</template>

<script setup lang="ts" name="SysWebHook">
import {
  listWebHook,
  getWebHook,
  delWebHook,
  addWebHook,
  updateWebHook,
  changeWebHookStatus,
  testWebHook,
  testSendByEvent
} from '@/api/system/webHook'
import type { SysWebHook, DeliveryResult } from '@/types/api/system/webHook'
import { useCrudTable } from '@/composables/useCrudTable'
import { useMobileFilter } from '@/composables/useMobileFilter'
import EventCatalogSection from './EventCatalogSection.vue'
import { useRowActionGuard } from '@/composables/useRowActionGuard'
import modal from '@/plugins/modal'
import { useRouter } from 'vue-router'

const router = useRouter()
const { t } = useI18n()
const formRef = useTemplateRef('formRef')
const queryRef = useTemplateRef('queryRef')
const { sys_normal_disable } = useDict('sys_normal_disable')

// 事件类型选项（支持 allow-create 自定义）
const eventTypeOptions = computed(() => [
  { value: 'login_success', label: t('webHook.eventType.login_success') },
  { value: 'login_failure', label: t('webHook.eventType.login_failure') },
  { value: 'scim_user_provisioned', label: t('webHook.eventType.scim_user_provisioned') },
  { value: 'scim_user_deactivated', label: t('webHook.eventType.scim_user_deactivated') }
])

// 请求体格式
const contentTypeOptions = ['json', 'form-urlencoded']

// ==================== 事件目录（子组件承载目录对话框/全量下拉/启停，见 EventCatalogSection.vue） ====================
const eventCatalogOpen = ref(false)
// 目录下拉选项（停用事件在测试发送中禁用；名称与 event_key 一并展示）由子组件加载并回传
const eventCatalogOptions = ref<{ value: string; label: string; disabled: boolean }[]>([])
const eventCatalogSectionRef = useTemplateRef<{
  reloadOptions: () => void
  optionsLoading: boolean
  optionsError: boolean
  optionsTotal: number
  optionsTruncated: boolean
}>('eventCatalogSectionRef')
// 下拉数据源的进度/失败由子组件持有（单一数据源），父组件只消费不回推
const eventCatalogLoading = computed(() => eventCatalogSectionRef.value?.optionsLoading ?? false)
const eventCatalogLoadError = computed(() => eventCatalogSectionRef.value?.optionsError ?? false)
const eventCatalogTotal = computed(() => eventCatalogSectionRef.value?.optionsTotal ?? 0)
const eventCatalogTruncated = computed(() => eventCatalogSectionRef.value?.optionsTruncated ?? false)

/** 打开事件目录对话框 */
function openEventCatalog(): void {
  eventCatalogOpen.value = true
}

/** 全量加载事件目录（供订阅/测试发送下拉；防重入逻辑在子组件内，瞬时失败后可重拉兜底） */
function loadEventOptionsFull(): void {
  eventCatalogSectionRef.value?.reloadOptions()
}

// 搜索区：事件类型多选（UI 用数组，请求时 join 为逗号串）
const searchEventTypes = ref<string[]>([])

function splitEventTypes(types: string): string[] {
  return (types || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function eventTypeLabel(value: string): string {
  const hit = eventTypeOptions.value.find((o: { value: string; label: string }) => o.value === value)
  return hit ? hit.label : value
}

const data = reactive({
  form: {} as SysWebHook,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    hookName: undefined,
    eventTypes: undefined,
    status: undefined
  },
  rules: {
    hookName: [{ required: true, message: t('webHook.validate.hookNameRequired'), trigger: 'blur' }],
    targetUrl: [
      { required: true, message: t('webHook.validate.targetUrlRequired'), trigger: 'blur' },
      { pattern: /^https?:\/\/.+/i, message: t('webHook.validate.targetUrlFormat'), trigger: 'blur' }
    ]
  }
})

const { queryParams, form, rules } = toRefs(data)

const {
  dataList,
  open,
  loading,
  submitLoading,
  exportLoading,
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
  handleQuery: crudHandleQuery,
  resetQuery: crudResetQuery,
  handleSelectionChange,
  handleAdd,
  handleUpdate,
  submitForm: crudSubmitForm,
  handleExport,
  handleDelete
} = useCrudTable<SysWebHook, { pageNum: number; pageSize: number; [key: string]: unknown }>({
  listApi: listWebHook,
  getApi: getWebHook,
  addApi: addWebHook,
  updateApi: updateWebHook,
  deleteApi: delWebHook,
  idField: 'id',
  exportUrl: '/monitor/webHook/export',
  defaultForm: () =>
    ({
      id: undefined,
      hookName: undefined,
      eventTypes: undefined,
      subscribedEvents: undefined,
      targetUrl: undefined,
      secret: undefined,
      contentType: 'json',
      timeoutSecs: 10,
      status: '0',
      remark: undefined
    }) as unknown as SysWebHook,
  titleKey: 'webHook.title',
  deleteTipKey: 'webHook.tip.confirmDelete',
  queryParams,
  form,
  formRef,
  queryRef
})
// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter

// 表单内订阅事件目录键（数组；空 = 订阅全部）。
// 方案 C：旧 eventTypes 表单数组已随输入框移除，订阅只经新字段提交
const formSubscribedEvents = ref<string[]>([])

// 打开对话框时同步订阅事件数组，并确保目录下拉可用
function onFormDialogOpen() {
  formSubscribedEvents.value = parseSubscribedEvents(form.value.subscribedEvents)
  loadEventOptionsFull()
}

/** 解析后端 subscribed_events（JSON 数组串；数组形态直接用）；失败/为空回退为空数组（= 订阅全部） */
function parseSubscribedEvents(value: string | string[] | null | undefined): string[] {
  if (!value) return []
  if (Array.isArray(value)) return value.map(String)
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed.map(String) : []
  } catch {
    return []
  }
}

// 提交前处理：订阅事件键以**数组形态**只写新字段 subscribedEvents（空数组 = 订阅全部，
// 后端归一为 NULL）；旧字段 eventTypes 不再由前端提交（后端保留兼容转换，供存量调用方）。
// 编辑时 secret 留空表示不改变。
function submitForm() {
  form.value.subscribedEvents = formSubscribedEvents.value
  const f = form.value as { secret?: string | null }
  if (form.value.id != null && !f.secret) {
    f.secret = undefined
  }
  crudSubmitForm()
}

// 通知搜索区查询（事件类型数组 -> 逗号串）
function handleQuery() {
  queryParams.value.eventTypes = searchEventTypes.value.join(',') || undefined
  crudHandleQuery()
}

function resetQuery() {
  searchEventTypes.value = []
  crudResetQuery()
}

// 状态切换
/**
 * 启停切换（**行级**互斥 + 在途态，b106）：停用会改变出站投递的可用性，
 * 连点叠两次确认并发出两个方向相反的状态请求是最坏形态（终态由返回顺序决定）。
 */
const { runningIds: statusLoadingIds, guarded } = useRowActionGuard<string>()

async function handleStatusChange(row: SysWebHook): Promise<void> {
  const oldVal = row.status === '0' ? '1' : '0'
  const text = row.status === '0' ? t('common.enabled') : t('common.disabled')
  const executed = await guarded(
    String(row.id),
    () => modal.confirm(t('webHook.tip.confirmChange', { text, name: row.hookName || '' })),
    async () => {
      try {
        await changeWebHookStatus(row.id, row.status!)
        modal.msgSuccess(text + t('common.success'))
      } catch (e) {
        row.status = oldVal
        throw e
      }
    }
  )
  if (!executed) row.status = oldVal
}

// ----- 测试推送 -----
const testOpen = ref(false)
const testLoading = ref(false)
const currentHook = ref<SysWebHook | null>(null)
const testResult = ref<DeliveryResult | null>(null)
const testForm = reactive<{ eventType: string | undefined; payload: string }>({
  eventType: undefined,
  payload: ''
})

function openTestDialog(row?: SysWebHook) {
  const target = row ?? dataList.value.find((r: SysWebHook) => r.id === ids.value[0]) ?? null
  if (!target) return
  currentHook.value = target
  // 事件下拉数据源（全量目录；防重入，瞬时失败后可重拉）
  loadEventOptionsFull()
  testForm.eventType = target.eventTypes ? splitEventTypes(target.eventTypes)[0] : undefined
  testForm.payload = ''
  testResult.value = null
  testOpen.value = true
}

function doTest() {
  const hook = currentHook.value
  if (!hook) return
  testLoading.value = true
  let payload: unknown = testForm.payload
  if (testForm.payload && testForm.payload.trim()) {
    try {
      payload = JSON.parse(testForm.payload)
    } catch {
      payload = testForm.payload
    }
  } else {
    payload = undefined
  }
  testWebHook(hook.id, { eventType: testForm.eventType || undefined, payload })
    .then((res) => {
      testResult.value = res.data ?? null
      if (res.data?.ok) {
        modal.msgSuccess(t('webHook.tip.testSuccess'))
      } else {
        modal.msgError(t('webHook.tip.testFail'))
      }
    })
    .catch(() => {})
    .finally(() => {
      testLoading.value = false
    })
}

// ----- 按事件目录测试发送（POST /system/webhook/{id}/test-send） -----
const testSendLoadingId = ref<number | string | null>(null)

/** 行内"测试发送"下拉：选中事件后以该事件的 payload_example 真实投递 */
function handleTestSendByEvent(row: SysWebHook, eventKey: string): void {
  if (!eventKey) return
  testSendLoadingId.value = row.id
  testSendByEvent(row.id, eventKey)
    .then((res) => {
      if (res.data?.ok) {
        modal.msgSuccess(t('webHook.tip.testSendSuccess', { event: eventKey }))
      } else {
        modal.msgError(t('webHook.tip.testSendFail', { event: eventKey }))
      }
    })
    .catch(() => {})
    .finally(() => {
      testSendLoadingId.value = null
    })
}

// ----- 日志跳转 -----
function handleLog() {
  router.push('/system/webHook/log')
}

handleQuery()
</script>

<style lang="scss" scoped>
.font-mono :deep(textarea),
.font-mono :deep(.el-textarea__inner),
.font-mono :deep(.el-input__inner) {
  font-family: 'JetBrains Mono', 'Fira Code', Consolas, monospace;
}
.result-pre {
  margin: 0;
  padding: 8px;
  border-radius: 4px;
  background: var(--el-fill-color-light);
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-all;
  max-height: 200px;
  overflow: auto;
}
.text-danger {
  color: var(--el-color-danger);
}
</style>
