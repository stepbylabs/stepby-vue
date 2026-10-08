<template>
  <div class="app-container">
    <el-alert type="info" :closable="false" show-icon class="mb-2" :title="t('config.configTomlTip')" />
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
        <el-form-item :label="t('config.search.configName')" prop="configName">
          <el-input
            v-model="queryParams.configName"
            :placeholder="t('config.search.phConfigName')"
            :maxlength="100"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('config.search.configKey')" prop="configKey">
          <el-input
            v-model="queryParams.configKey"
            :placeholder="t('config.search.phConfigKey')"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('config.search.configType')" prop="configType">
          <el-select
            :aria-label="t('config.search.configType')"
            v-model="queryParams.configType"
            :placeholder="t('config.search.phConfigType')"
            clearable
            class="w-[240px]"
          >
            <el-option v-for="dict in sys_yes_no" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('config.search.createTime')" class="w-[308px]">
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:config:add']">
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
          v-hasPermi="['system:config:edit']"
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
          v-hasPermi="['system:config:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['system:config:export']">
          {{ t('common.export') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="danger" plain icon="Refresh" @click="handleRefreshCache" v-hasPermi="['system:config:remove']">
          {{ t('common.refresh') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <SkeletonTable v-if="loading" :columns="6" :rows="8" />
    <el-table
      v-else
      :data="dataList"
      :row-key="(row: SysConfig) => row.configId"
      @selection-change="handleSelectionChange"
    >
      <el-table-column type="selection" width="55" align="center" />
      <el-table-column :label="t('config.column.id')" align="center" prop="configId" width="80" />
      <el-table-column
        :label="t('config.column.configName')"
        align="center"
        prop="configName"
        min-width="150"
        show-overflow-tooltip
      />
      <el-table-column
        :label="t('config.column.configKey')"
        align="center"
        prop="configKey"
        min-width="180"
        show-overflow-tooltip
      />
      <el-table-column :label="t('config.column.configValue')" align="center" prop="configValue" min-width="180">
        <template #default="scope">
          <EditableCell
            v-if="canEditValue"
            :model-value="scope.row.configValue"
            :maxlength="500"
            :validate="validateConfigValue"
            @commit="(nv: string, ov: string) => onConfigValueCommit(scope.row, nv, ov)"
          />
          <span v-else class="block truncate">{{ scope.row.configValue }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('config.column.configType')" align="center" prop="configType" width="90">
        <template #default="scope">
          <dict-tag :options="sys_yes_no" :value="scope.row.configType" />
        </template>
      </el-table-column>
      <!-- E-04：多租户参数治理列（§27.8）——scope/tenant_editable/visible_to_tenant 只读展示，编辑防误改由后端 Locked 守卫兜底 -->
      <el-table-column :label="t('config.column.governance')" align="center" width="150">
        <template #default="scope">
          <el-tooltip :disabled="!isGovernanceRestricted(scope.row)" placement="top">
            <template #content>{{ t('config.column.governanceTip') }}</template>
            <span class="inline-flex items-center gap-1">
              <el-tag size="small" :type="scope.row.scope === 'platform_only' ? 'danger' : 'info'">
                {{ scope.row.scope || 'global' }}
              </el-tag>
              <el-tag
                v-if="scope.row.visibleToTenant === '0'"
                size="small"
                type="warning"
              >
                {{ t('config.column.hiddenToTenant') }}
              </el-tag>
            </span>
          </el-tooltip>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('config.column.remark')"
        align="center"
        prop="remark"
        min-width="200"
        show-overflow-tooltip
      />
      <el-table-column :label="t('config.column.createTime')" align="center" prop="createTime" width="180">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
      <el-table-column
        :label="t('common.column.operation')"
        align="center"
        width="150"
        class-name="small-padding fixed-width"
      >
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="Edit"
            @click="handleUpdate(scope.row)"
            v-hasPermi="['system:config:edit']"
          >
            {{ t('common.edit') }}
          </el-button>
          <el-button
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['system:config:remove']"
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

    <!-- 添加或修改参数配置对话框（before-close：未保存离开确认，UX-5） -->
    <el-dialog :title="title" v-model="open" width="min(90%, 500px)" append-to-body destroy-on-close :before-close="beforeDialogClose">
      <el-form ref="configRef" :model="form" :rules="rules" label-width="80px">
        <el-form-item :label="t('config.form.configName')" prop="configName">
          <el-input v-model.trim="form.configName" :placeholder="t('config.search.phConfigName')" />
        </el-form-item>
        <el-form-item :label="t('config.form.configKey')" prop="configKey">
          <el-input v-model.trim="form.configKey" :placeholder="t('config.search.phConfigKey')" />
        </el-form-item>
        <el-form-item :label="t('config.form.configValue')" prop="configValue">
          <el-input
            v-model="form.configValue"
            type="textarea"
            :placeholder="t('common.form.inputPlaceholder')"
            :maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <el-form-item :label="t('config.form.configType')" prop="configType">
          <el-radio-group v-model="form.configType">
            <el-radio v-for="dict in sys_yes_no" :key="dict.value" :value="dict.value">{{ dict.label }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('config.form.remark')" prop="remark">
          <el-input
            v-model="form.remark"
            type="textarea"
            :placeholder="t('common.form.inputPlaceholder')"
            :maxlength="500"
            show-word-limit
          />
        </el-form-item>
        <!-- E-04 参数治理（仅平台管理员）：scope/editable/visible 三列编辑；
             Locked 键控件禁用（后端 resolve_governance fail-closed 兜底） -->
        <template v-if="isPlatform">
          <el-divider content-position="left">{{ t('config.governance.section') }}</el-divider>
          <el-form-item :label="t('config.governance.scope')" prop="scope">
            <el-select
              v-model="form.scope"
              :disabled="isLockedKey"
              :placeholder="t('config.governance.scopePlaceholder')"
              class="w-full"
              @change="onScopeChange"
            >
              <el-option value="platform_only" :label="t('config.governance.scopePlatformOnly')" />
              <el-option value="platform_default" :label="t('config.governance.scopePlatformDefault')" />
              <el-option value="tenant_private" :label="t('config.governance.scopeTenantPrivate')" />
            </el-select>
          </el-form-item>
          <el-form-item :label="t('config.governance.tenantEditable')">
            <el-switch
              v-model="tenantEditableOn"
              :disabled="isLockedKey || form.scope === 'platform_only'"
              active-value="1"
              inactive-value="0"
            />
            <span class="ml-2 text-xs text-[var(--el-text-color-secondary)]">
              {{ t('config.governance.tenantEditableTip') }}
            </span>
          </el-form-item>
          <el-form-item :label="t('config.governance.visibleToTenant')">
            <el-switch
              v-model="visibleToTenantOn"
              :disabled="isLockedKey || form.scope === 'platform_only'"
              active-value="1"
              inactive-value="0"
            />
            <span class="ml-2 text-xs text-[var(--el-text-color-secondary)]">
              {{ t('config.governance.visibleToTenantTip') }}
            </span>
          </el-form-item>
          <el-alert
            v-if="isLockedKey"
            :title="t('config.governance.lockedTip')"
            type="warning"
            :closable="false"
            show-icon
            class="mb-2"
          />
        </template>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitFormGuarded">{{ t('common.confirm') }}</el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="Config">
import type { SysConfig, ConfigQueryParams } from '@/types/api/system/config'
import {
  listConfig,
  getConfig,
  delConfig,
  addConfig,
  updateConfig,
  refreshCache,
  invalidateConfigCache
} from '@/api/system/config'
import { useCrudTable } from '@/composables/useCrudTable'
import { addDateRange } from '@/utils/stepby'
import { checkPermi } from '@/utils/permission'
import modal from '@/plugins/modal'
import request from '@/utils/request'
import useUserStore from '@/store/modules/user'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import EditableCell from '@/components/EditableCell/index.vue'

const userStore = useUserStore()
/** E-04 参数治理：治理编辑仅平台管理员（租户写治理字段被后端强制 tenant_private） */
const isPlatform = computed(() => (userStore.tenantId ?? 0) === 0)

/** 平台锁定键清单（governance-locked 端点；Locked 键治理控件禁用，后端 fail-closed 兜底） */
const lockedKeys = ref<Set<string>>(new Set())
onMounted(() => {
  if (!isPlatform.value) return
  request({ url: '/system/config/governance-locked', method: 'get' })
    .then((res) => {
      const keys = ((res as { data?: string[] }).data ?? (res as unknown as string[])) || []
      lockedKeys.value = new Set(keys)
    })
    .catch(() => {})
})
const isLockedKey = computed(() => !!form.value.configKey && lockedKeys.value.has(form.value.configKey))

const configRefRef = useTemplateRef('configRef')
const queryRefRef = useTemplateRef('queryRef')
const { t } = useI18n()
const { sys_yes_no } = useDict('sys_yes_no')

const dateRange = ref<string[]>([])

const data = reactive({
  form: {} as SysConfig,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    configName: undefined,
    configKey: undefined,
    configType: undefined
  } as ConfigQueryParams,
  rules: {
    configName: [{ required: true, message: t('config.validate.configNameRequired'), trigger: 'blur' }],
    configKey: [{ required: true, message: t('config.validate.configKeyRequired'), trigger: 'blur' }],
    configValue: [{ required: true, message: t('config.validate.configValueRequired'), trigger: 'blur' }]
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
  beforeDialogClose,
  getList,
  cancel,
  handleQuery,
  handleSelectionChange,
  handleAdd,
  handleUpdate,
  submitForm,
  handleDelete,
  handleExport
} = useCrudTable<SysConfig, ConfigQueryParams>({
  listApi: (params) =>
    listConfig(addDateRange(params as Record<string, unknown>, dateRange.value) as ConfigQueryParams),
  getApi: getConfig,
  addApi: addConfig,
  updateApi: updateConfig,
  deleteApi: delConfig,
  idField: 'configId',
  exportUrl: '/system/config/export',
  defaultForm: () => ({
    configId: undefined,
    configName: undefined,
    configKey: undefined,
    configValue: undefined,
    configType: 'Y',
    remark: undefined,
    // E-04：治理缺省跟随后端 fail-closed（platform_only/'0'/'0'），下放需显式选择
    scope: 'platform_only',
    tenantEditable: '0',
    visibleToTenant: '0'
  }),
  titleKey: 'config.title',
  deleteTipKey: 'common.confirmDelete',
  queryParams,
  form,
  formRef: configRefRef,
  queryRef: queryRefRef,
  onAfterSubmit: () => {
    // P1 修复: 双层缓存失效
    // 1. invalidateConfigCache: 失效前端 cachedApi（getConfigKey 的 30s TTL 内存缓存）
    // 2. refreshCache: 失效后端 Redis 缓存（让其它节点/进程也拿到最新值）
    invalidateConfigCache()
    refreshCache().catch(() => {})
  },
  onAfterDelete: () => {
    invalidateConfigCache()
    refreshCache().catch(() => {})
  }
})

/** E-04 治理表单状态：switch 与 scope 联动（platform_only 强制 '0'/'0'）+ 变更快照（二次确认） */
const tenantEditableOn = ref<'0' | '1'>('0')
const visibleToTenantOn = ref<'0' | '1'>('0')
let governanceSnapshot = ''

function syncSwitchesFromForm() {
  tenantEditableOn.value = (form.value.tenantEditable as '0' | '1') || '0'
  visibleToTenantOn.value = (form.value.visibleToTenant as '0' | '1') || '0'
}

/** scope 变更：platform_only 强制两开关关（镜像后端 resolve_governance 推导） */
function onScopeChange(scope: string) {
  if (scope === 'platform_only') {
    tenantEditableOn.value = '0'
    visibleToTenantOn.value = '0'
  }
}

/** 提交前把治理开关回写 form（非平台不上传治理字段——后端本就忽略，保持语义干净） */
function applyGovernanceToForm() {
  if (!isPlatform.value) {
    delete (form.value as Record<string, unknown>).scope
    delete (form.value as Record<string, unknown>).tenantEditable
    delete (form.value as Record<string, unknown>).visibleToTenant
    return
  }
  form.value.scope = (form.value.scope as string) || 'platform_only'
  if (form.value.scope === 'platform_only') {
    tenantEditableOn.value = '0'
    visibleToTenantOn.value = '0'
  }
  form.value.tenantEditable = tenantEditableOn.value
  form.value.visibleToTenant = visibleToTenantOn.value
}

/** 治理字段相对打开对话框时是否有变化（有变 → 保存前二次确认，防误改） */
function governanceChanged(): boolean {
  if (!isPlatform.value) return false
  const cur = JSON.stringify([
    form.value.scope || 'platform_only',
    tenantEditableOn.value,
    visibleToTenantOn.value
  ])
  return cur !== governanceSnapshot
}

watch(open, (v: boolean) => {
  if (!v) return
  syncSwitchesFromForm()
  governanceSnapshot = JSON.stringify([
    form.value.scope || 'platform_only',
    tenantEditableOn.value,
    visibleToTenantOn.value
  ])
})

/** 提交守卫：治理字段变更时二次确认（E-04 防误改设计），再走 useCrudTable 提交 */
async function submitFormGuarded() {
  applyGovernanceToForm()
  if (governanceChanged()) {
    try {
      await modal.confirm(t('config.governance.confirmChange'))
    } catch {
      return
    }
  }
  submitForm()
}

/** 重置按钮操作 - 覆盖以清空 dateRange */
function resetQuery() {
  dateRange.value = []
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 刷新缓存按钮操作 */
function handleRefreshCache() {
  // P1 修复: 同时失效前端内存缓存和后端 Redis 缓存
  invalidateConfigCache()
  refreshCache()
    .then(() => {
      modal.msgSuccess(t('common.refreshSuccess'))
    })
    .catch(() => {})
}

// ==================== 行内编辑（Tier-S #5）====================
// 是否可编辑参数值：与「编辑」按钮同权限，无权限时单元格退化为纯文本。
const canEditValue = computed(() => checkPermi(['system:config:edit']))

// E-04：治理列受限判定（platform_only / 对租户不可见 → tooltip 提示防误改；
// 编辑防误改由后端 Locked 守卫兜底，前端仅提示语义）
function isGovernanceRestricted(row: { scope?: string; visibleToTenant?: string }): boolean {
  return row.scope === 'platform_only' || row.visibleToTenant === '0'
}

/** 行内校验：参数值必填（与对话框 configValue 规则同源） */
function validateConfigValue(v: string): string | true {
  if (v === null || v === undefined || String(v).trim() === '') {
    return t('config.validate.configValueRequired')
  }
  return true
}

/**
 * 提交行内编辑：真实调用 PUT /system/config（与对话框同一后端链路与审计）。
 * dataList 为 shallowRef（行非深层响应），故乐观写与失败回滚都必须通过
 * 整体重新赋值数组触发单元格重渲染；直接改 row.configValue 不会刷新视图。
 */
async function onConfigValueCommit(row: SysConfig, newVal: string, oldVal: string): Promise<void> {
  const patch = (value: string): void => {
    dataList.value = dataList.value.map((r: SysConfig) =>
      r.configId === row.configId ? { ...r, configValue: value } : r
    )
  }
  patch(newVal)
  try {
    await updateConfig({ ...row, configValue: newVal })
    invalidateConfigCache()
    refreshCache().catch(() => {})
    modal.msgSuccess(t('config.inlineEdit.saveSuccess'))
  } catch {
    patch(oldVal)
    modal.msgError(t('config.inlineEdit.saveFailed'))
  }
}

getList()
</script>
