<template>
  <div class="app-container">
    <el-card shadow="never">
      <template #header>
        <span>{{ t('tenantNav.myTitle') }}</span>
      </template>

      <el-alert :title="t('tenantNav.tip')" type="info" :closable="false" class="mb-2" />

      <!-- 平台操作者：自助页语义 = 管理某个租户的自建导航，必须先选租户（否则后端 400：
           "平台操作者必须显式指定 tenantId"，见 sys_tenant_nav_service::effective_write_tenant/options）。
           租户操作者不受影响（后端强制本租户）。 -->
      <el-form v-if="isPlatform" inline class="mb-2" @submit.prevent>
        <el-form-item :label="t('tenantNav.targetTenant')">
          <el-select
            v-model="selectedTenantId"
            filterable
            :placeholder="t('tenantNav.targetTenantPlaceholder')"
            class="w-[280px]"
            @change="loadAll"
          >
            <el-option
              v-for="tnt in tenantOptions"
              :key="tnt.tenantId"
              :label="`${tnt.tenantName} (${tnt.tenantCode})`"
              :value="tnt.tenantId"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <el-alert
        v-if="isPlatform && !selectedTenantId"
        :title="t('tenantNav.platformPickTenant')"
        type="warning"
        :closable="false"
        class="mb-2"
      />
      <el-alert
        v-if="blocked"
        :title="blockedTip"
        type="warning"
        :closable="false"
        class="mb-2"
      />
      <el-alert
        v-else-if="!canWrite"
        :title="t('tenantNav.readonlyTip')"
        type="warning"
        :closable="false"
        class="mb-2"
      />

      <el-row v-if="canLoad" :gutter="10" class="mb8">
        <el-col :span="1.5">
          <el-button
            v-hasPermi="['system:tenantMenu:add']"
            type="primary"
            plain
            icon="Plus"
            @click="openAdd"
          >
            {{ t('tenantNav.add') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button icon="Refresh" @click="loadAll">{{ t('common.refresh') }}</el-button>
        </el-col>
      </el-row>

      <el-table v-if="canLoad" v-loading="loading" :data="rows" row-key="l3Id" border>
        <el-table-column
          :label="t('tenantNav.refMenu')"
          prop="refMenuName"
          min-width="220"
          show-overflow-tooltip
        >
          <template #default="{ row }">
            <span>{{ row.refMenuName || '-' }}</span>
            <el-tag
              size="small"
              class="ml-1"
              :type="row.refMenuType === 'M' ? 'warning' : 'success'"
            >
              {{ row.refMenuType === 'M' ? t('tenantNav.typeDir') : t('tenantNav.typePage') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('tenantNav.parent')" min-width="160">
          <template #default="{ row }">{{ parentLabel(row.parentId) }}</template>
        </el-table-column>
        <el-table-column
          :label="t('tenantNav.perms')"
          prop="refMenuPerms"
          min-width="180"
          show-overflow-tooltip
        >
          <template #default="{ row }">{{ row.refMenuPerms || '-' }}</template>
        </el-table-column>
        <el-table-column
          :label="t('tenantNav.orderNum')"
          prop="orderNum"
          width="100"
          align="center"
        />
        <el-table-column :label="t('tenantNav.visible')" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.visible === '1' ? 'info' : 'success'">
              {{ row.visible === '1' ? t('tenantNav.hide') : t('tenantNav.show') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('tenantNav.status')" width="100" align="center">
          <template #default="{ row }">
            <el-tag size="small" :type="row.status === '1' ? 'danger' : 'success'">
              {{ row.status === '1' ? t('tenantNav.statusDisabled') : t('tenantNav.statusNormal') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('common.column.operation')"
          width="180"
          align="center"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              v-hasPermi="['system:tenantMenu:edit']"
              link
              type="primary"
              icon="Edit"
              @click="openEdit(row)"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-hasPermi="['system:tenantMenu:remove']"
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
      <el-empty v-if="canLoad && !loading && rows.length === 0" :description="t('tenantNav.empty')" />
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="isEdit ? t('tenantNav.editTitle') : t('tenantNav.addTitle')"
      width="620px"
      append-to-body
      destroy-on-close
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" @submit.prevent>
        <el-form-item :label="t('tenantNav.refMenu')" prop="refMenuId">
          <el-select
            v-model="form.refMenuId"
            :disabled="isEdit"
            filterable
            class="w-full"
            :placeholder="t('tenantNav.refMenuPlaceholder')"
          >
            <el-option
              v-for="opt in menuOptions"
              :key="opt.menuId"
              :value="opt.menuId"
              :label="opt.menuName"
              :disabled="opt.selected"
            >
              <span>{{ opt.menuName }}</span>
              <span class="ml-1 text-xs text-text-placeholder">
                {{ opt.menuType === 'M' ? t('tenantNav.typeDir') : t('tenantNav.typePage') }}
              </span>
              <span v-if="opt.selected" class="ml-1 text-xs">
                ({{ t('tenantNav.selected') }})
              </span>
            </el-option>
          </el-select>
          <div class="text-xs text-text-placeholder">{{ t('tenantNav.refMenuTip') }}</div>
        </el-form-item>
        <el-form-item :label="t('tenantNav.parent')" prop="parentId">
          <el-select v-model="form.parentId" class="w-full">
            <el-option :value="0" :label="t('tenantNav.parentTop')" />
            <el-option
              v-for="row in parentCandidates"
              :key="row.l3Id"
              :value="row.l3Id"
              :label="row.refMenuName"
            />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('tenantNav.orderNum')" prop="orderNum">
          <el-input-number v-model="form.orderNum" :min="0" :max="9999" controls-position="right" />
          <span class="ml-2 text-xs text-text-placeholder">{{ t('tenantNav.orderNumTip') }}</span>
        </el-form-item>
        <el-form-item :label="t('tenantNav.visible')" prop="visible">
          <el-radio-group v-model="form.visible">
            <el-radio value="0">{{ t('tenantNav.show') }}</el-radio>
            <el-radio value="1">{{ t('tenantNav.hide') }}</el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item v-if="isEdit" :label="t('tenantNav.status')" prop="status">
          <el-radio-group v-model="form.status">
            <el-radio value="0">{{ t('tenantNav.statusNormal') }}</el-radio>
            <el-radio value="1">{{ t('tenantNav.statusDisabled') }}</el-radio>
          </el-radio-group>
          <div class="text-xs text-text-placeholder">{{ t('tenantNav.statusDisabledTip') }}</div>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button type="primary" :loading="saving" @click="submitForm">
          {{ t('common.save') }}
        </el-button>
        <el-button @click="dialogVisible = false">{{ t('common.cancel') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  listTenantNav,
  tenantNavOptions,
  addTenantNav,
  updateTenantNav,
  delTenantNav
} from '@/api/system/tenantNav'
import { listTenant } from '@/api/system/tenant'
import type { SysTenantMenuVo, TenantNavMenuOptionVo } from '@/api/system/tenantNav'
import type { TenantVo } from '@/api/system/tenant'
import type { ComponentInternalInstance } from 'vue'
import { checkPermi } from '@/utils/permission'
import useUserStore from '@/store/modules/user'

/**
 * 租户自建导航 L3 页面（批次 3 / MT-1）
 *
 * 语义：只调整「已授权菜单」的父级 / 排序 / 显隐——不新增页面、不新增权限码。
 * 准入由后端能力位 `nav.l3` 决定（off ⇒ 403；view_only ⇒ 只读；full ⇒ 可写），
 * 本页仅按 perms 控制按钮可见性，并在无 list 权限 / 403 时给出提示。
 *
 * 平台操作者（tid=0）：后端要求平台显式指定 tenantId（list/options 查询与
 * add 写入均校验，缺省 400），故页面提供租户选择器，选中后以平台身份代管
 * 该租户的自建导航；未选租户时不发请求，避免"打开页面即弹警告"。
 */
const { t } = useI18n()
const { proxy } = getCurrentInstance() as ComponentInternalInstance
const userStore = useUserStore()
/** 页面查看权限（无此权限 ⇒ 多半是能力位未开启或角色未授权，展示提示而非空表） */
const hasNavPermi = checkPermi(['system:tenantMenu:list'])
/** 写权限（用于「只读档」提示） */
const canWrite = checkPermi(['system:tenantMenu:add'])

/** 平台操作者（tid=0）：自助页必须先选目标租户 */
const isPlatform = userStore.tenantId === 0

const loading = ref(false)
const saving = ref(false)
const rows = ref<SysTenantMenuVo[]>([])
const menuOptions = ref<TenantNavMenuOptionVo[]>([])
const blocked = ref(false)
const blockedTip = ref('')
const tenantOptions = ref<TenantVo[]>([])
const selectedTenantId = ref<number | undefined>(undefined)

/** 平台未选租户 ⇒ 不发任何请求（防 400 警告）；租户操作者恒可加载 */
const canLoad = computed(() => (isPlatform ? selectedTenantId.value != null : true))
/** 实际传给后端的 tenantId：平台 = 选中的租户；租户操作者 = 不传（后端强制本租户） */
const targetTenantId = computed(() => (isPlatform ? selectedTenantId.value : undefined))

const dialogVisible = ref(false)
const isEdit = ref(false)
const formRef = ref()
const form = reactive({
  l3Id: 0,
  refMenuId: undefined as number | undefined,
  parentId: 0,
  orderNum: 0,
  visible: '0',
  status: '0'
})

const rules = {
  refMenuId: [{ required: true, message: () => t('common.inputText'), trigger: 'change' }]
}

/** 可选父级：排除自身（编辑时不允许把自己挂到自己之下） */
const parentCandidates = computed(() =>
  rows.value.filter((r: SysTenantMenuVo) => !isEdit.value || r.l3Id !== form.l3Id)
)

/** 父级展示：0 = 顶层；其余显示父行的引用菜单名（缺失时回退为 #id） */
function parentLabel(parentId: number): string {
  if (!parentId) return t('tenantNav.parentTop')
  const parent = rows.value.find((r: SysTenantMenuVo) => r.l3Id === parentId)
  return parent?.refMenuName || `#${parentId}`
}

async function loadAll() {
  if (!hasNavPermi) {
    blocked.value = true
    blockedTip.value = t('tenantNav.disabledTip')
    return
  }
  if (!canLoad.value) return
  loading.value = true
  try {
    const [listRes, optRes] = await Promise.all([
      listTenantNav(targetTenantId.value),
      tenantNavOptions(targetTenantId.value)
    ])
    rows.value = listRes.data ?? []
    menuOptions.value = optRes.data ?? []
    blocked.value = false
  } catch {
    // 403（能力位未开启 / 被平台关闭）→ 页面提示，不展示空表误导
    blocked.value = true
    blockedTip.value = t('tenantNav.disabledTip')
  } finally {
    loading.value = false
  }
}

/** 平台操作者：拉取租户下拉（自助页 = 平台代管某租户的入口） */
async function loadTenantOptions() {
  if (!isPlatform) return
  try {
    const res = await listTenant()
    tenantOptions.value = res.data ?? []
  } catch {
    tenantOptions.value = []
  }
}

function resetForm() {
  Object.assign(form, {
    l3Id: 0,
    refMenuId: undefined,
    parentId: 0,
    orderNum: 0,
    visible: '0',
    status: '0'
  })
}

function openAdd() {
  isEdit.value = false
  resetForm()
  dialogVisible.value = true
}

function openEdit(row: SysTenantMenuVo) {
  isEdit.value = true
  Object.assign(form, {
    l3Id: row.l3Id,
    refMenuId: row.refMenuId,
    parentId: row.parentId ?? 0,
    orderNum: row.orderNum ?? 0,
    visible: row.visible === '1' ? '1' : '0',
    status: row.status === '1' ? '1' : '0'
  })
  dialogVisible.value = true
}

async function submitForm() {
  await formRef.value?.validate()
  saving.value = true
  try {
    if (isEdit.value) {
      await updateTenantNav({
        l3Id: form.l3Id,
        parentId: form.parentId,
        orderNum: form.orderNum,
        visible: form.visible,
        status: form.status
      })
    } else {
      await addTenantNav({
        tenantId: targetTenantId.value,
        refMenuId: form.refMenuId as number,
        parentId: form.parentId,
        orderNum: form.orderNum,
        visible: form.visible
      })
    }
    proxy?.$modal.msgSuccess(t('common.success'))
    dialogVisible.value = false
    await loadAll()
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: SysTenantMenuVo) {
  const ok = await proxy?.$modal.confirm(t('tenantNav.deleteConfirm', [row.refMenuName]))
  if (!ok) return
  await delTenantNav(row.l3Id)
  proxy?.$modal.msgSuccess(t('common.success'))
  await loadAll()
}

onMounted(() => {
  loadTenantOptions()
  loadAll()
})
</script>
