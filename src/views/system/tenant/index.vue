<template>
  <div class="app-container">
    <transition name="fade" enter-active-class="animate__animated animate__fadeInUp">
      <el-card v-if="showSearch" shadow="never" class="mb-2">
        <el-form :inline="true" :model="queryForm" @submit.prevent>
          <el-form-item :label="t('tenant.tenantName')">
            <el-input
              v-model.trim="queryForm.tenantName"
              :placeholder="t('common.inputText')"
              clearable
              class="w-[180px]"
              @keyup.enter="handleQuery"
              :aria-label="t('tenant.tenantName')"
            />
          </el-form-item>
          <el-form-item :label="t('tenant.tenantCode')">
            <el-input
              v-model.trim="queryForm.tenantCode"
              :placeholder="t('tenant.codePlaceholder')"
              clearable
              class="w-[160px]"
              @keyup.enter="handleQuery"
              :aria-label="t('tenant.codePlaceholder')"
            />
          </el-form-item>
          <!-- 生命周期视角切换（回收站仅平台可见；租户操作者列表恒为本租户在册行） -->
          <el-form-item v-if="isPlatform" :label="t('tenant.lifecycle')">
            <el-radio-group v-model="queryForm.delFlag" @change="handleQuery">
              <el-radio-button value="0">{{ t('tenant.inRegister') }}</el-radio-button>
              <el-radio-button value="2">{{ t('tenant.recycleBin') }}</el-radio-button>
            </el-radio-group>
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleQuery">
              {{ t('common.search') }}
            </el-button>
            <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
          </el-form-item>
        </el-form>
      </el-card>
    </transition>

    <el-card shadow="never">
      <template #header>
        <el-row :gutter="10" class="mb8">
          <el-col :span="1.5">
            <el-button
              v-if="isPlatform"
              v-hasPermi="['system:tenant:add']"
              type="primary"
              plain
              icon="Plus"
              @click="openAdd"
            >
              {{ t('common.add') }}
            </el-button>
          </el-col>
          <right-toolbar v-model:show-search="showSearch" @query-table="getList" />
        </el-row>
        <el-alert :title="t('tenant.modelTip')" type="info" :closable="false" class="mb-1" />
        <el-alert v-if="isRecycleView" :title="t('tenant.recycleTip')" type="warning" :closable="false" class="mb-2" />
      </template>

      <el-table v-loading="loading" :data="tenantList">
        <el-table-column :label="t('tenant.tenantId')" prop="tenantId" width="90" align="center" />
        <el-table-column :label="t('tenant.tenantName')" prop="tenantName" min-width="150" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.tenantName }}</span>
            <el-tag v-if="row.delFlag === '2'" type="danger" size="small" class="ml-1">
              {{ t('tenant.recycleBin') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('tenant.tenantCode')" prop="tenantCode" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.tenantCode || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('tenant.contactName')" prop="contactName" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.contactName || row.leader || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('tenant.contactPhone')" prop="contactPhone" min-width="130" show-overflow-tooltip>
          <template #default="{ row }">{{ row.contactPhone || row.phone || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('tenant.package')" prop="packageName" min-width="110" show-overflow-tooltip>
          <template #default="{ row }">{{ row.packageName || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('tenant.domain')" prop="domain" min-width="140" show-overflow-tooltip>
          <template #default="{ row }">{{ row.domain || t('tenant.domainEmpty') }}</template>
        </el-table-column>
        <el-table-column :label="t('tenant.accountUsage')" width="130" align="center">
          <template #default="{ row }">
            <div>
              {{ row.userCount }} / {{ row.accountCount > 0 ? row.accountCount : t('tenant.accountUnlimited') }}
            </div>
            <!-- 配额用量进度条：上限 >0 时展示已用占比，接近上限变色；上限 0（不限）不展示 -->
            <el-progress
              v-if="row.accountCount > 0"
              :percentage="Math.min((row.userCount / row.accountCount) * 100, 100)"
              :stroke-width="6"
              :show-text="false"
              :status="row.userCount / row.accountCount >= 0.9 ? 'warning' : undefined"
              class="mt-1"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('tenant.expireTime')" width="180" align="center">
          <template #default="{ row }">
            <span v-if="!row.expireTime">{{ t('tenant.expireForever') }}</span>
            <el-tooltip v-else :disabled="!isExpired(row.expireTime)" :content="t('tenant.expiredTip')">
              <span :class="{ 'text-danger': isExpired(row.expireTime) }">{{ formatTime(row.expireTime) }}</span>
            </el-tooltip>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="90" align="center">
          <template #default="{ row }">
            <el-switch
              :aria-label="`${row.tenantName} ${t('common.status')}`"
              v-model="row.status"
              :loading="statusLoadingIds.includes(row.tenantId)"
              active-value="0"
              inactive-value="1"
              :disabled="!canToggleStatus(row)"
              @change="handleStatusChange(row)"
            />
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.createTime')" prop="createTime" width="170" align="center">
          <template #default="{ row }">
            {{ formatTime(row.createTime) }}
          </template>
        </el-table-column>
        <template #empty>
          <list-empty :load-error="loadError" @retry="getList" />
        </template>
        <el-table-column :label="t('common.column.operation')" width="330" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="row.delFlag !== '2'"
              v-hasPermi="['system:tenant:edit']"
              link
              type="primary"
              icon="Edit"
              @click="openEdit(row)"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-if="row.delFlag !== '2' && isPlatform"
              v-hasPermi="['system:tenant:edit']"
              link
              type="info"
              icon="Setting"
              @click="openCapabilities(row)"
            >
              {{ t('tenant.capability') }}
            </el-button>
            <el-button
              v-if="row.delFlag !== '2' && isPlatform"
              v-hasPermi="['system:tenant:domain:list']"
              link
              type="info"
              icon="Link"
              @click="openDomain(row)"
            >
              {{ t('tenantDomain.manage') }}
            </el-button>
            <el-button
              v-if="row.delFlag !== '2' && isPlatform"
              v-hasPermi="['system:backup:export']"
              link
              type="warning"
              icon="Download"
              :loading="exportingId === row.tenantId"
              @click="handleExport(row)"
            >
              {{ t('tenant.exportPackage') }}
            </el-button>
            <!-- 注：导出接口 POST /system/backup/tenant-export/{tenantId} 在后端
                 PERM_ROUTE_TABLE 校验的就是 system:backup:export（走备份链路落盘登记），
                 菜单种子无 system:tenant:export，属有意的跨模块权限复用，前端与后端保持一致 -->
            <el-button
              v-if="row.delFlag !== '2' && isPlatform"
              v-hasPermi="['system:tenant:remove']"
              link
              type="danger"
              icon="Delete"
              @click="handleDelete(row)"
            >
              {{ t('common.delete') }}
            </el-button>
            <el-button
              v-if="row.delFlag === '2' && isPlatform"
              v-hasPermi="['system:tenant:edit']"
              link
              type="success"
              icon="RefreshLeft"
              @click="handleRestore(row)"
            >
              {{ t('tenant.restore') }}
            </el-button>
          </template>
        </el-table-column>
      </el-table>
    </el-card>

    <!-- 新增/编辑对话框 -->
    <el-dialog
      v-model="formVisible"
      :title="formTitle"
      width="min(90%, 640px)"
      append-to-body
      destroy-on-close
      :close-on-click-modal="false"
      :before-close="beforeFormClose"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" @submit.prevent>
        <el-divider content-position="left">{{ t('tenant.baseSection') }}</el-divider>
        <el-form-item :label="t('tenant.tenantName')" prop="tenantName">
          <el-input
            v-model.trim="form.tenantName"
            :placeholder="t('common.inputText')"
            maxlength="30"
            :aria-label="t('tenant.tenantName')"
          />
        </el-form-item>
        <el-form-item v-if="!isEdit" :label="t('tenant.tenantCode')" prop="tenantCode">
          <el-input
            v-model.trim="form.tenantCode"
            :placeholder="t('tenant.codeAutoTip')"
            maxlength="32"
            :disabled="!isPlatform"
            :aria-label="t('tenant.codeAutoTip')"
          />
        </el-form-item>
        <el-form-item v-if="isPlatform" :label="t('tenant.package')" prop="packageId">
          <div class="w-full">
            <el-select
              :aria-label="t('tenant.package')"
              v-model="form.packageId"
              :placeholder="t('tenant.packagePlaceholder')"
              clearable
              class="w-full"
              @change="onPackageChange"
            >
              <el-option
                v-for="pkg in packageOptions"
                :key="pkg.packageId"
                :label="packageLabel(pkg)"
                :value="pkg.packageId"
              />
            </el-select>
            <el-alert
              v-if="packageOptionsFailed"
              :title="t('tenant.packageOptionsFailed')"
              type="error"
              :closable="false"
              show-icon
              class="mt-1"
            >
              <el-button link type="primary" @click="loadPackageOptions">{{ t('common.retry') }}</el-button>
            </el-alert>
          </div>
        </el-form-item>
        <el-form-item v-if="isPlatform" :label="t('tenant.expireTime')" prop="expireTime">
          <el-date-picker
            v-model="form.expireTime"
            type="datetime"
            value-format="YYYY-MM-DD HH:mm:ss"
            :placeholder="t('tenant.expireForever')"
            class="w-full"
            :aria-label="t('tenant.expireForever')"
          />
        </el-form-item>
        <el-form-item v-if="isPlatform" :label="t('tenant.accountCount')" prop="accountCount">
          <el-input-number v-model="form.accountCount" :min="0" :max="999999" controls-position="right" />
          <span class="ml-2 text-xs text-text-placeholder">{{ t('tenant.accountUnlimitedTip') }}</span>
        </el-form-item>
        <el-form-item v-if="!isEdit && isPlatform" :label="t('common.status')" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio value="0">{{ t('common.normal') }}</el-radio>
            <el-radio value="1">{{ t('common.disabled') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('common.column.sort')" prop="orderNum">
          <el-input-number v-model="form.orderNum" :min="0" :max="999" controls-position="right" />
        </el-form-item>

        <el-divider content-position="left">{{ t('tenant.contactSection') }}</el-divider>
        <el-form-item :label="t('tenant.contactName')" prop="contactName">
          <el-input
            v-model.trim="form.contactName"
            :placeholder="t('common.inputText')"
            maxlength="20"
            :aria-label="t('tenant.contactName')"
          />
        </el-form-item>
        <el-form-item :label="t('tenant.contactPhone')" prop="contactPhone">
          <el-input
            v-model.trim="form.contactPhone"
            :placeholder="t('common.inputText')"
            maxlength="20"
            :aria-label="t('tenant.contactPhone')"
          />
        </el-form-item>
        <el-form-item :label="t('tenant.contactEmail')" prop="contactEmail">
          <el-input
            v-model.trim="form.contactEmail"
            :placeholder="t('common.inputText')"
            maxlength="50"
            :aria-label="t('tenant.contactEmail')"
          />
        </el-form-item>
        <el-form-item :label="t('tenant.remark')" prop="remark">
          <el-input v-model="form.remark" type="textarea" :rows="2" maxlength="200" show-word-limit />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" :loading="saving" @click="saveForm">{{ t('common.save') }}</el-button>
        <el-button @click="cancelForm">{{ t('common.cancel') }}</el-button>
      </template>
    </el-dialog>

    <!-- 套餐能力位（三层开关中间层：平台 [features] → 套餐能力位 → 角色授权；仅平台可配） -->
    <el-dialog
      v-model="capabilityVisible"
      :title="t('tenant.capabilityTitle', [capabilityPackageName])"
      width="760px"
      destroy-on-close
      :before-close="beforeCapabilityClose"
    >
      <el-alert :title="t('tenant.capabilityTip')" type="info" :closable="false" class="mb-2" />
      <el-alert :title="t('tenant.capabilityPlatformCeiling')" type="warning" :closable="false" class="mb-2" />
      <el-alert
        v-if="capabilityLoadFailed"
        :title="t('tenant.capabilityLoadFailed')"
        type="error"
        :closable="false"
        show-icon
        class="mb-2"
      >
        <el-button link type="primary" @click="loadCapabilities">{{ t('common.retry') }}</el-button>
      </el-alert>
      <el-table v-loading="capabilityLoading" :data="capabilityItems" border size="small" row-key="key">
        <el-table-column :label="t('tenant.capabilityKey')" prop="key" min-width="220" />
        <el-table-column :label="t('tenant.capabilityMode')" min-width="220">
          <template #default="{ row }">
            <el-select
              :aria-label="t('tenant.capabilityMode')"
              v-model="capabilityForm[row.key]"
              size="small"
              class="w-full"
              :disabled="!isPlatformEnabled(row.key)"
            >
              <el-option v-for="m in row.modes" :key="m" :label="m" :value="m" />
            </el-select>
          </template>
        </el-table-column>
        <el-table-column :label="t('common.status')" width="130" align="center">
          <template #default="{ row }">
            <el-tag v-if="!isPlatformEnabled(row.key)" type="info" size="small">
              {{ t('tenant.capabilityPlatformOff') }}
            </el-tag>
            <el-tag v-else-if="capabilityForm[row.key] !== 'off'" type="success" size="small">
              {{ capabilityForm[row.key] }}
            </el-tag>
          </template>
        </el-table-column>
      </el-table>
      <template #footer>
        <el-button
          type="primary"
          :loading="capabilitySaving"
          :disabled="capabilityItems.length === 0 || capabilityLoadFailed"
          @click="saveCapabilities"
        >
          {{ t('tenant.capabilitySave') }}
        </el-button>
        <el-button @click="cancelCapability">{{ t('common.cancel') }}</el-button>
      </template>
    </el-dialog>

    <!-- 域名管理抽屉（仅平台：域名接入 + DNS TXT 验证） -->
    <tenant-domain-drawer v-model="domainVisible" :tenant="domainTenant" @refresh="getList" />
  </div>
</template>

<script setup lang="ts">
import { useMobileFilter } from '@/composables/useMobileFilter'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import { createLatestGuard } from '@/composables/latestRequest'
import {
  listTenant,
  getTenant,
  addTenant,
  updateTenant,
  changeTenantStatus,
  delTenant,
  restoreTenant,
  listTenantPackageOptions,
  exportTenantPackage,
  getPackageFeatures,
  updatePackageFeatures
} from '@/api/system/tenant'
import type { TenantVo, TenantPackageOption, TenantAddDto, TenantEditDto } from '@/api/system/tenant'
import type { PackageFeatureItemVo } from '@/types/api/generated/PackageFeatureItemVo'
import TenantDomainDrawer from './TenantDomainDrawer.vue'
import { downloadBackup } from '@/api/system/backup'
import type { ComponentInternalInstance } from 'vue'
import { checkPermi } from '@/utils/permission'
import { confirmAction } from '@/utils/confirm'
import { useRowActionGuard } from '@/composables/useRowActionGuard'
import { validateForm } from '@/utils/formValidate'
import useUserStore from '@/store/modules/user'

const { t } = useI18n()
const { proxy } = getCurrentInstance() as ComponentInternalInstance
const userStore = useUserStore()

// 多租户 Phase 3：平台操作者可管理全部租户（含套餐/配额/到期/回收站）；租户操作者仅本租户
const isPlatform = computed(() => (userStore.tenantId ?? 0) === 0)

const showSearch = ref(true)
// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
useMobileFilter(showSearch)
const loading = ref(false)
/** 列表请求守卫：连点搜索/刷新时只让最后一次请求的结局生效（b119） */
const listGuard = createLatestGuard()
// 列表加载失败标记：失败置真（空态显示"加载失败 + 重试"），成功置假
const loadError = ref(false)
const saving = ref(false)
const tenantList = ref<TenantVo[]>([])
const packageOptions = ref<TenantPackageOption[]>([])
/** 套餐候选读取失败（b141）：下拉为空不得冒充"系统里没有套餐" */
const packageOptionsFailed = ref(false)
const queryForm = reactive({ tenantName: '', tenantCode: '', delFlag: '0' })

const formVisible = ref(false)
const isEdit = ref(false)
const editingId = ref<number | null>(null)
const formRef = ref()

// 域名管理抽屉（仅平台可见；租户操作者无入口）
const domainVisible = ref(false)
const domainTenant = ref<TenantVo | null>(null)

// 套餐能力位（三层开关中间层；仅平台可配）
const capabilityVisible = ref(false)
const capabilityLoading = ref(false)
const capabilitySaving = ref(false)
const capabilityPackageId = ref<number | null>(null)
const capabilityPackageName = ref('')
/** 注册表（后端返回全量能力位定义，前端不硬编码 key 清单） */
const capabilityItems = ref<PackageFeatureItemVo[]>([])
/** 当前编辑值：key → mode（提交时整体回传） */
const capabilityForm = ref<Record<string, string>>({})
/** 平台层已开启的能力位（天花板）：不在此列表内的项不可开启、选择器禁用 */
const capabilityPlatformEnabled = ref<string[]>([])
/** 能力位注册表读取失败（b141）：读失败不得当成"这个套餐没有能力位"，更不得把空表存回去 */
const capabilityLoadFailed = ref(false)
// 正在导出数据包的租户 id（按钮 loading；同时防重复点击）
const exportingId = ref<number | null>(null)
const form = reactive({
  tenantName: '',
  tenantCode: '',
  packageId: undefined as number | undefined,
  expireTime: undefined as string | undefined,
  accountCount: 0 as number | undefined,
  status: '0',
  orderNum: 0 as number | undefined,
  contactName: '',
  contactPhone: '',
  contactEmail: '',
  remark: ''
})

const isRecycleView = computed(() => queryForm.delFlag === '2')

/**
 * 关闭语义（b135）：新增/编辑租户表单既有 11 个校验字段，改动后按 Esc 或点遮罩
 * 原先会静默丢弃。`openAdd` / `openEdit` 都是「赋值完成后再置 visible」，
 * 因此 post-flush 的自动快照拿到的就是用户看到的那一刻值。
 */
const { markSaved, beforeClose: beforeFormClose, cancel: cancelForm } = useDialogDirtyGuard(formVisible, form)

/** 套餐能力位同理：每个 key 一个下拉，改一半按 Esc 原先会静默丢弃整批调整 */
const {
  snapshot: snapshotCapabilities,
  markSaved: markCapabilitiesSaved,
  beforeClose: beforeCapabilityClose,
  cancel: cancelCapability
} = useDialogDirtyGuard(capabilityVisible, capabilityForm)

// 邮箱格式校验（可选字段：填写时必须是合法邮箱，避免把非法值写入联系信息）
const rules = {
  tenantName: [{ required: true, message: () => t('tenant.nameRequired'), trigger: 'blur' }],
  tenantCode: [
    {
      pattern: /^[a-zA-Z0-9_-]{2,32}$/,
      message: () => t('tenant.codeRule'),
      trigger: 'blur'
    }
  ],
  contactEmail: [{ type: 'email', message: () => t('tenant.emailRule'), trigger: 'blur' }]
}

const formTitle = computed(() => (isEdit.value ? t('tenant.editTitle') : t('tenant.addTitle')))
const hasEditPermi = checkPermi(['system:tenant:edit'])

/** 时间格式化为 YYYY-MM-DD HH:mm:ss（后端返回 RFC3339 / 空格分隔两种形态均兼容） */
function formatTime(value?: string): string {
  if (!value) return '-'
  return value.replace('T', ' ').slice(0, 19)
}

/** 是否已过期（与当前时间比较；空值 = 永不过期，不判过期） */
function isExpired(value?: string): boolean {
  if (!value) return false
  const ts = new Date(value.replace(' ', 'T')).getTime()
  return Number.isFinite(ts) && ts < Date.now()
}

/** 状态开关可用性：回收站行不可切换；需编辑权限；租户操作者不可自行启停 */
function canToggleStatus(row: TenantVo): boolean {
  return isPlatform.value && row.delFlag !== '2' && hasEditPermi
}

function packageLabel(pkg: TenantPackageOption): string {
  return pkg.defaultAccountCount > 0
    ? `${pkg.packageName}（${t('tenant.accountCount')} ${pkg.defaultAccountCount}）`
    : pkg.packageName
}

/**
 * 新增租户时选中套餐 → 带入套餐默认账号数（0 = 不限）。
 *
 * 后端契约：新增租户时 `accountCount` 缺省才回落套餐 `defaultAccountCount`；
 * 表单默认 0 会被当作"显式不限"，故此处显式带出套餐默认值，保证套餐配额语义真实生效。
 * 编辑态不联动（配额由平台在该租户上显式设置，切套餐不应静默改写配额）。
 */
function onPackageChange(pkgId: number | undefined) {
  if (isEdit.value) return
  const pkg = packageOptions.value.find((p: TenantPackageOption) => p.packageId === pkgId)
  form.accountCount = pkg && pkg.defaultAccountCount > 0 ? pkg.defaultAccountCount : 0
}

/** 该能力位在平台层是否已开启（平台是天花板：未开启则套餐无法开启，选择器禁用） */
function isPlatformEnabled(key: string): boolean {
  return capabilityPlatformEnabled.value.includes(key)
}

/** 打开套餐能力位配置（按租户的套餐维度：能力位挂在套餐上，同套餐租户共享） */
async function openCapabilities(row: TenantVo) {
  if (!row.packageId) {
    proxy?.$modal.msgWarning(t('tenant.capabilityNoPackage'))
    return
  }
  capabilityPackageId.value = row.packageId
  capabilityPackageName.value = row.packageName || String(row.packageId)
  capabilityVisible.value = true
  await loadCapabilities()
}

/** 拉取套餐能力位（注册表 + 当前模式 + 平台天花板） */
async function loadCapabilities() {
  if (!capabilityPackageId.value) return
  capabilityLoading.value = true
  capabilityLoadFailed.value = false
  // 换套餐身份 ⇒ 先丢上一个套餐的表单与勾选，失败时不留下"另一个套餐的值"
  capabilityItems.value = []
  capabilityPlatformEnabled.value = []
  capabilityForm.value = {}
  try {
    const res = await getPackageFeatures(capabilityPackageId.value)
    const data = res.data
    capabilityItems.value = data?.items ?? []
    capabilityPlatformEnabled.value = data?.platformEnabled ?? []
    // 平台未开启的项一律置 off 并禁用：避免把"平台没开"的值回传而被后端 400 拒绝
    const next: Record<string, string> = {}
    for (const item of capabilityItems.value) {
      next[item.key] = isPlatformEnabled(item.key) ? item.mode : 'off'
    }
    capabilityForm.value = next
    snapshotCapabilities()
  } catch (e) {
    // 读失败必须可见且可重试；空表不得冒充"该套餐没有能力位"（b141，b133 同族）
    capabilityLoadFailed.value = true
    if (import.meta.env.DEV) console.error('[tenant] loadCapabilities:', e)
  } finally {
    capabilityLoading.value = false
  }
}

/** 保存套餐能力位（后端会做三道校验并立即收敛该套餐下全部租户的角色菜单授权） */
async function saveCapabilities() {
  if (!capabilityPackageId.value) return
  // 读失败时表单是空的：保存等于把该套餐的能力位全部清掉（安全闸，不只靠按钮 disabled）
  if (capabilityLoadFailed.value) return
  capabilitySaving.value = true
  try {
    await updatePackageFeatures({
      packageId: capabilityPackageId.value,
      features: { ...capabilityForm.value }
    })
    proxy?.$modal.msgSuccess(t('tenant.capabilitySaved'))
    markCapabilitiesSaved()
    capabilityVisible.value = false
  } catch (e) {
    // 拦截器已提示；保持对话框打开让用户重试，拒绝不得逸出（b141）
    if (import.meta.env.DEV) console.error('[tenant] saveCapabilities:', e)
  } finally {
    capabilitySaving.value = false
  }
}

async function getList() {
  const ticket = listGuard.begin()
  loading.value = true
  try {
    const res = await listTenant({ ...queryForm })
    if (!listGuard.isCurrent(ticket)) return
    loadError.value = false
    tenantList.value = res.data ?? []
  } catch {
    if (!listGuard.isCurrent(ticket)) return
    // b105：失败必须与"没有租户"可区分；此前没有 catch，拒绝会逸出到全局处理器
    loadError.value = true
    tenantList.value = []
  } finally {
    if (listGuard.isCurrent(ticket)) loading.value = false
  }
}

/** 套餐下拉（仅平台需要；失败不阻断列表展示，但必须在下拉旁可见并可重试） */
async function loadPackageOptions() {
  if (!isPlatform.value) return
  packageOptionsFailed.value = false
  try {
    const res = await listTenantPackageOptions()
    packageOptions.value = res.data ?? []
  } catch (e) {
    packageOptions.value = []
    packageOptionsFailed.value = true
    if (import.meta.env.DEV) console.error('[tenant] loadPackageOptions:', e)
  }
}

function handleQuery() {
  getList()
}

function resetQuery() {
  queryForm.tenantName = ''
  queryForm.tenantCode = ''
  queryForm.delFlag = '0'
  handleQuery()
}

function openAdd() {
  isEdit.value = false
  editingId.value = null
  Object.assign(form, {
    tenantName: '',
    tenantCode: '',
    packageId: undefined,
    expireTime: undefined,
    accountCount: 0,
    status: '0',
    orderNum: 0,
    contactName: '',
    contactPhone: '',
    contactEmail: '',
    remark: ''
  })
  formVisible.value = true
}

async function openEdit(row: TenantVo) {
  isEdit.value = true
  editingId.value = row.tenantId
  const res = await getTenant(row.tenantId)
  const d = res.data ?? row
  Object.assign(form, {
    tenantName: d.tenantName ?? '',
    tenantCode: d.tenantCode ?? '',
    packageId: d.packageId,
    expireTime: d.expireTime,
    accountCount: d.accountCount ?? 0,
    status: d.status ?? '0',
    orderNum: d.orderNum ?? 0,
    contactName: d.contactName ?? '',
    contactPhone: d.contactPhone ?? '',
    contactEmail: d.contactEmail ?? '',
    remark: d.remark ?? ''
  })
  formVisible.value = true
}

/** 打开域名管理抽屉（仅平台；域名接入 + DNS TXT 验证） */
function openDomain(row: TenantVo) {
  domainTenant.value = row
  domainVisible.value = true
}

async function saveForm() {
  // b140（项8 C2）：占闸必须早于任何 await，否则连点会各提交一次（见 :loading 的
  // 同步占位纪律，与 useRowActionGuard 同源）
  if (saving.value) return
  saving.value = true
  try {
    if (!(await validateForm(formRef.value))) return
    if (isEdit.value && editingId.value != null) {
      const dto: TenantEditDto = {
        tenantId: editingId.value,
        tenantName: form.tenantName,
        orderNum: form.orderNum,
        contactName: form.contactName || undefined,
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
        remark: form.remark || undefined
      }
      // 套餐/配额/到期为平台分配项：仅平台提交（租户操作者提交会被后端 403，且回传需谨慎）
      // 三态语义：清理表单后显式传 null（= 不分配套餐 / 配额不限 / 永不过期），
      // 不能省略字段（省略 = 不修改，清空操作将静默失效）
      if (isPlatform.value) {
        dto.packageId = form.packageId ?? null
        dto.expireTime = form.expireTime ?? null
        dto.accountCount = form.accountCount ?? null
      }
      await updateTenant(dto)
      proxy?.$modal.msgSuccess(t('common.success'))
    } else {
      const dto: TenantAddDto = {
        tenantName: form.tenantName,
        tenantCode: form.tenantCode || undefined,
        orderNum: form.orderNum,
        contactName: form.contactName || undefined,
        contactPhone: form.contactPhone || undefined,
        contactEmail: form.contactEmail || undefined,
        remark: form.remark || undefined,
        status: form.status
      }
      if (isPlatform.value) {
        dto.packageId = form.packageId
        dto.expireTime = form.expireTime
        dto.accountCount = form.accountCount
      }
      const res = await addTenant(dto)
      // 一次性展示租户管理员初始密码（服务端只存哈希，关闭后无法再次获取）
      const created = res.data
      if (created?.adminUserName && created?.adminInitPassword) {
        proxy?.$modal.alertSuccess(t('tenant.adminInitTip', [created.adminUserName, created.adminInitPassword]))
      } else {
        proxy?.$modal.msgSuccess(t('common.success'))
      }
    }
    formVisible.value = false
    markSaved()
    getList()
  } catch (e) {
    // 拒绝不得逸出：提示由请求拦截器统一给，这里只保证表单不被 ErrorBoundary 卸载
    // （此前只有 finally，接口失败 = "点了确定，表单没了，什么都没保存"）
    if (import.meta.env.DEV) console.error('[tenant] save failed:', e)
  } finally {
    saving.value = false
  }
}

/**
 * 启停切换（**行级**互斥 + 在途态，b106）：`v-model` 乐观更新，被挡掉/取消/失败三出口都回滚。
 *
 * `confirmAction` 用布尔返回（不 reject），这里把它适配成 guard 的 `confirmed`：
 * 取消时抛错 ⇒ guard 返回 false ⇒ 调用方回滚。停用租户会连带撤销其 PAT/会话，
 * 重复提交的两次请求会各自触发一轮收敛，终态由返回顺序决定。
 */
const { runningIds: statusLoadingIds, guarded } = useRowActionGuard<number>()

async function handleStatusChange(row: TenantVo): Promise<void> {
  const oldVal = row.status === '0' ? '1' : '0'
  // 后端契约要求显式目标状态：开关翻转后的 row.status 可能缺省，这里收敛成确定的 '0'/'1'
  const next = row.status === '0' ? '0' : '1'
  const executed = await guarded(
    row.tenantId,
    async () => {
      const ok = await confirmAction(
        row.status === '1' ? t('tenant.enableConfirm', [row.tenantName]) : t('tenant.disableConfirm', [row.tenantName])
      )
      if (!ok) throw new Error('cancelled')
    },
    async () => {
      try {
        await changeTenantStatus(row.tenantId, next)
        proxy?.$modal.msgSuccess(t('common.success'))
      } catch (e) {
        row.status = oldVal
        if (import.meta.env.DEV) console.error('[tenant] changeStatus:', e)
        throw e
      }
    }
  )
  if (!executed) row.status = oldVal
}

async function handleDelete(row: TenantVo) {
  const ok = await confirmAction(t('tenant.deleteConfirm', [row.tenantName]))
  if (!ok) return
  try {
    await delTenant(row.tenantId)
    proxy?.$modal.msgSuccess(t('common.success'))
    getList()
  } catch (e) {
    // 全局拦截器已提示；这里只阻止拒绝逸出（async 事件处理器的拒绝会被全局 errorHandler 接管并卸载页面）
    if (import.meta.env.DEV) console.error('[tenant] delete:', e)
  }
}

async function handleRestore(row: TenantVo) {
  const ok = await confirmAction(t('tenant.restoreConfirm', [row.tenantName]))
  if (!ok) return
  try {
    await restoreTenant(row.tenantId)
    proxy?.$modal.msgSuccess(t('common.restoreSuccess'))
    getList()
  } catch (e) {
    if (import.meta.env.DEV) console.error('[tenant] restore:', e)
  }
}

/**
 * 导出租户数据包（仅平台专属能力 system:backup:export）
 *
 * 链路：POST /system/backup/tenant-export/{tenantId} 落盘并登记 backup_type=tenant_export
 * 的备份日志 → 立即用返回的 backupId 走既有 GET /system/backup/download/{backupId} 取文件。
 * 只导出不导入（租户级恢复不支持）；平台租户（tid=0）同样可导出。
 */
async function handleExport(row: TenantVo) {
  const ok = await confirmAction(t('tenant.exportConfirm', [row.tenantName]))
  if (!ok) return
  exportingId.value = row.tenantId
  try {
    const res = await exportTenantPackage(row.tenantId)
    const created = res.data
    if (!created?.backupId) {
      // 200 但没有备份记录 ⇒ 不能报"已导出"：界面会显示成功而「数据备份」里什么都没有
      proxy?.$modal.msgWarning(t('tenant.exportUnknown'))
      return
    }
    await downloadBackup(created.backupId, created.fileName)
    proxy?.$modal.msgSuccess(t('tenant.exportSuccess'))
  } catch (e) {
    // 失败提示由拦截器统一弹出；导出按钮 loading 必须在 finally 复位，拒绝不得逸出（b141）
    if (import.meta.env.DEV) console.error('[tenant] handleExport:', e)
  } finally {
    exportingId.value = null
  }
}

onMounted(() => {
  loadPackageOptions()
  getList()
})
</script>

<style lang="scss" scoped>
.text-danger {
  color: var(--el-color-danger);
}
</style>
