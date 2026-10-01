<template>
  <el-alert :title="t('tenantDomain.tip')" type="info" :closable="false" class="mb-2" />

  <el-row :gutter="10" class="mb8">
    <el-col :span="1.5">
      <el-button
        v-hasPermi="['system:tenant:domain:add']"
        type="primary"
        plain
        icon="Plus"
        @click="openAdd"
      >
        {{ t('tenantDomain.add') }}
      </el-button>
    </el-col>
    <el-col :span="1.5">
      <el-button icon="Refresh" @click="loadList">{{ t('common.refresh') }}</el-button>
    </el-col>
  </el-row>

  <el-table v-loading="loading" :data="rows">
    <el-table-column
      :label="t('tenantDomain.domain')"
      prop="domain"
      min-width="220"
      show-overflow-tooltip
    >
      <template #default="{ row }">
        <span>{{ row.domain }}</span>
        <el-tag v-if="row.isPrimary === '0'" type="success" size="small" class="ml-1">
          {{ t('tenantDomain.primary') }}
        </el-tag>
        <el-tag v-else type="info" size="small" class="ml-1">
          {{ t('tenantDomain.secondary') }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column :label="t('tenantDomain.domainType')" width="110" align="center">
      <template #default="{ row }">
        {{ row.domainType === '0' ? t('tenantDomain.typeSub') : t('tenantDomain.typeCustom') }}
      </template>
    </el-table-column>
    <el-table-column :label="t('tenantDomain.verifyStatus')" width="110" align="center">
      <template #default="{ row }">
        <el-tag :type="verifyTagType(row.verifyStatus)" size="small">
          {{ verifyLabel(row.verifyStatus) }}
        </el-tag>
      </template>
    </el-table-column>
    <el-table-column :label="t('common.status')" width="90" align="center">
      <template #default="{ row }">
        <el-switch
          v-model="row.status"
          active-value="0"
          inactive-value="1"
          @change="handleStatusChange(row)"
        />
      </template>
    </el-table-column>
    <el-table-column :label="t('tenantDomain.verifiedAt')" width="170" align="center">
      <template #default="{ row }">{{ formatTime(row.verifiedAt) }}</template>
    </el-table-column>
    <el-table-column
      :label="t('common.column.createTime')"
      width="170"
      align="center"
    >
      <template #default="{ row }">{{ formatTime(row.createTime) }}</template>
    </el-table-column>
    <el-table-column
      :label="t('common.column.operation')"
      width="220"
      align="center"
      fixed="right"
    >
      <template #default="{ row }">
        <el-button
          v-if="row.domainType === '1' && row.verifyStatus !== '1'"
          v-hasPermi="['system:tenant:domain:verify']"
          link
          type="primary"
          icon="CircleCheck"
          @click="handleVerify(row)"
        >
          {{ t('tenantDomain.verify') }}
        </el-button>
        <el-button
          v-if="row.isPrimary !== '0' && row.verifyStatus === '1'"
          v-hasPermi="['system:tenant:domain:edit']"
          link
          type="warning"
          icon="Star"
          @click="handleSetPrimary(row)"
        >
          {{ t('tenantDomain.setPrimary') }}
        </el-button>
        <el-button
          v-hasPermi="['system:tenant:domain:remove']"
          link
          type="danger"
          icon="Delete"
          @click="handleDelete(row)"
        >
          {{ t('common.delete') }}
        </el-button>
      </template>
    </el-table-column>
  </el-table>
  <el-empty v-if="!loading && rows.length === 0" :description="t('tenantDomain.empty')" />

  <!-- 新增域名绑定 -->
  <el-dialog
    v-model="addVisible"
    :title="t('tenantDomain.addTitle')"
    width="560px"
    append-to-body
    destroy-on-close
  >
    <el-alert
      v-if="!allowSubdomain"
      :title="t('tenantDomain.subdomainPlatformTip')"
      type="info"
      :closable="false"
      class="mb-2"
    />
    <el-form ref="addFormRef" :model="addForm" :rules="addRules" label-width="110px" @submit.prevent>
      <el-form-item :label="t('tenantDomain.domain')" prop="domain">
        <el-input
          v-model.trim="addForm.domain"
          :placeholder="t('tenantDomain.domainPlaceholder')"
          maxlength="128"
        />
      </el-form-item>
      <el-form-item :label="t('tenantDomain.domainType')" prop="domainType">
        <el-radio-group v-model="addForm.domainType">
          <el-radio v-if="allowSubdomain" value="0">{{ t('tenantDomain.typeSub') }}</el-radio>
          <el-radio value="1">{{ t('tenantDomain.typeCustom') }}</el-radio>
        </el-radio-group>
      </el-form-item>
      <el-form-item :label="t('tenantDomain.isPrimary')" prop="isPrimary">
        <el-switch v-model="addForm.isPrimary" active-value="0" inactive-value="1" />
        <span class="ml-2 text-xs text-text-placeholder">{{ t('tenantDomain.isPrimaryTip') }}</span>
      </el-form-item>
      <el-form-item :label="t('tenant.remark')" prop="remark">
        <el-input v-model="addForm.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
      </el-form-item>
    </el-form>
    <template #footer>
      <el-button type="primary" :loading="saving" @click="saveAdd">{{ t('common.save') }}</el-button>
      <el-button @click="addVisible = false">{{ t('common.cancel') }}</el-button>
    </template>
  </el-dialog>

  <!-- DNS TXT 验证结果 -->
  <el-dialog
    v-model="verifyVisible"
    :title="t('tenantDomain.verifyTitle')"
    width="600px"
    append-to-body
  >
    <el-result
      :icon="verifyResult?.verified ? 'success' : 'warning'"
      :title="verifyResult?.verified ? t('tenantDomain.verifyOk') : t('tenantDomain.verifyFail')"
    >
      <template #extra>
        <el-descriptions v-if="!verifyResult?.verified" :column="1" border size="small">
          <el-descriptions-item :label="t('tenantDomain.txtRecord')">
            {{ verifyResult?.txtRecord }}
          </el-descriptions-item>
          <el-descriptions-item :label="t('tenantDomain.txtValue')">
            {{ verifyResult?.txtValue || '-' }}
          </el-descriptions-item>
        </el-descriptions>
        <el-button
          v-if="!verifyResult?.verified"
          type="primary"
          plain
          icon="CopyDocument"
          @click="copyTxtValue"
        >
          {{ t('tenantDomain.copy') }}
        </el-button>
      </template>
    </el-result>
    <el-alert
      v-if="!verifyResult?.verified"
      :title="t('tenantDomain.verifyHint')"
      type="info"
      :closable="false"
      class="mt-1"
    />
  </el-dialog>
</template>

<script setup lang="ts">
import {
  listTenantDomain,
  addTenantDomain,
  verifyTenantDomain,
  setPrimaryTenantDomain,
  changeTenantDomainStatus,
  delTenantDomain
} from '@/api/system/tenantDomain'
import type {
  TenantDomainVo,
  TenantDomainAddDto,
  TenantDomainVerifyVo
} from '@/api/system/tenantDomain'
import type { ComponentInternalInstance } from 'vue'
import { checkPermi } from '@/utils/permission'
import useUserStore from '@/store/modules/user'

/**
 * 租户域名管理面板（平台抽屉 / 租户自助页面共用）
 *
 * - 平台模式（传入 tenantId）：平台管理员管理指定租户的域名（可含子域名）
 * - 自助模式（tenantId 缺省）：租户管理员管理本租户域名，后端按操作者租户自动收窄；
 *   子域名由平台统一分配，故自助模式强制 domainType='1'（自定义域名）
 */
const props = defineProps<{
  /** 目标租户 ID；缺省 = 自助模式（取当前登录用户所属租户） */
  tenantId?: number
  /** 租户名（平台模式用于外层抽屉标题，面板内不展示） */
  tenantName?: string
  /** 是否允许添加子域名；缺省按模式推导：平台模式 true / 自助模式 false */
  allowSubdomain?: boolean
}>()

const emit = defineEmits<{
  (e: 'refresh'): void
}>()

const { t } = useI18n()
const { proxy } = getCurrentInstance() as ComponentInternalInstance
const userStore = useUserStore()
const hasDomainPermi = checkPermi(['system:tenant:domain:list'])

/** 平台模式判定：显式传入 tenantId（0 亦视为有效值） */
const isPlatformMode = computed(() => props.tenantId != null)
/** 子域名开关：平台模式默认允许，自助模式默认禁止（子域名由平台分配） */
const allowSubdomain = computed(() => props.allowSubdomain ?? isPlatformMode.value)
/** 实际租户 ID：平台模式取 props，自助模式取当前登录用户所属租户 */
const effectiveTenantId = computed(() => props.tenantId ?? userStore.tenantId)

const loading = ref(false)
const saving = ref(false)
const rows = ref<TenantDomainVo[]>([])

const addVisible = ref(false)
const addFormRef = ref()
const addForm = reactive({
  domain: '',
  domainType: '0',
  isPrimary: '1' as string,
  remark: ''
})

const verifyVisible = ref(false)
const verifyResult = ref<TenantDomainVerifyVo | null>(null)

// 域名格式：小写字母/数字/点/中划线，至少一个点（与后端 normalize_domain + domain_invalid 对齐）
const addRules = {
  domain: [
    { required: true, message: () => t('common.inputText'), trigger: 'blur' },
    {
      pattern: /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)+$/,
      message: () => t('tenantDomain.domainRule'),
      trigger: 'blur'
    }
  ],
  domainType: [{ required: true, message: () => t('common.inputText'), trigger: 'change' }]
}

function formatTime(value?: string): string {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

function verifyLabel(status?: string): string {
  if (status === '1') return t('tenantDomain.verified')
  if (status === '2') return t('tenantDomain.verifyFailed')
  return t('tenantDomain.pendingVerify')
}

function verifyTagType(status?: string): 'success' | 'danger' | 'warning' {
  if (status === '1') return 'success'
  if (status === '2') return 'danger'
  return 'warning'
}

async function loadList() {
  if (!hasDomainPermi) return
  loading.value = true
  try {
    // 自助模式不传 tenantId：后端按操作者所属租户强制收窄（避免越权枚举他租户域名）
    const res = await listTenantDomain(isPlatformMode.value ? props.tenantId : undefined)
    rows.value = res.data ?? []
  } finally {
    loading.value = false
  }
}

function openAdd() {
  Object.assign(addForm, {
    domain: '',
    domainType: allowSubdomain.value ? '0' : '1',
    isPrimary: '1',
    remark: ''
  })
  addVisible.value = true
}

async function saveAdd() {
  await addFormRef.value?.validate()
  const tid = effectiveTenantId.value
  if (tid == null) return
  saving.value = true
  try {
    const dto: TenantDomainAddDto = {
      tenantId: tid,
      domain: addForm.domain.toLowerCase(),
      domainType: allowSubdomain.value ? addForm.domainType : '1',
      isPrimary: addForm.isPrimary,
      remark: addForm.remark || undefined
    }
    await addTenantDomain(dto)
    proxy?.$modal.msgSuccess(t('common.success'))
    addVisible.value = false
    await loadList()
    emit('refresh')
  } finally {
    saving.value = false
  }
}

async function handleVerify(row: TenantDomainVo) {
  const res = await verifyTenantDomain(row.domainId)
  verifyResult.value = res.data ?? null
  verifyVisible.value = true
  await loadList()
  emit('refresh')
}

async function copyTxtValue() {
  const value = verifyResult.value?.txtValue
  if (!value) return
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value)
    } else {
      throw new Error('clipboard unavailable')
    }
    proxy?.$modal.msgSuccess(t('tenantDomain.copyOk'))
  } catch {
    proxy?.$modal.msgError(t('common.failed'))
  }
}

async function handleSetPrimary(row: TenantDomainVo) {
  const ok = await proxy?.$modal.confirm(t('tenantDomain.setPrimaryConfirm', [row.domain]))
  if (!ok) return
  await setPrimaryTenantDomain(row.domainId)
  proxy?.$modal.msgSuccess(t('common.success'))
  await loadList()
  emit('refresh')
}

async function handleStatusChange(row: TenantDomainVo) {
  const next = row.status === '0' ? '0' : '1'
  const ok = await proxy?.$modal.confirm(t('tenantDomain.statusTip'))
  if (!ok) {
    row.status = row.status === '0' ? '1' : '0'
    return
  }
  await changeTenantDomainStatus(row.domainId, next)
  proxy?.$modal.msgSuccess(t('common.success'))
  emit('refresh')
}

async function handleDelete(row: TenantDomainVo) {
  const ok = await proxy?.$modal.confirm(t('tenantDomain.deleteConfirm', [row.domain]))
  if (!ok) return
  await delTenantDomain(row.domainId)
  proxy?.$modal.msgSuccess(t('common.success'))
  await loadList()
  emit('refresh')
}

// 抽屉 destroy-on-close：每次打开重新挂载即拉取；页面模式下进入页面拉取
onMounted(loadList)

defineExpose({ reload: loadList, openAdd })
</script>
