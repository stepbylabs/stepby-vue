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
            :aria-label="t('tenantNav.targetTenant')"
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
      <el-alert v-if="blocked" :title="blockedTip" type="warning" :closable="false" class="mb-2" />
      <el-alert
        v-else-if="!canWrite"
        :title="t('tenantNav.readonlyTip')"
        type="warning"
        :closable="false"
        class="mb-2"
      />
      <!-- b140：取数失败是**第三种**状态（既不是"能力位关闭"，也不是"这个租户没有导航"），
           必须在界面上可见且可重试；否则一次网络抖动会被读成一条业务结论。 -->
      <el-alert v-if="loadFailed" type="error" :closable="false" show-icon class="mb-2" :title="t('common.loadFailed')">
        <el-button link type="primary" @click="loadAll">{{ t('common.retry') }}</el-button>
      </el-alert>
      <el-alert
        v-if="tenantOptionsFailed"
        type="error"
        :closable="false"
        show-icon
        class="mb-2"
        :title="t('tenantNav.tenantListFailed')"
      >
        <el-button link type="primary" @click="loadTenantOptions">{{ t('common.retry') }}</el-button>
      </el-alert>

      <el-row v-if="canLoad" :gutter="10" class="mb8">
        <el-col :span="1.5">
          <el-button v-hasPermi="['system:tenantMenu:add']" type="primary" plain icon="Plus" @click="openAdd">
            {{ t('tenantNav.add') }}
          </el-button>
        </el-col>
        <el-col :span="1.5">
          <el-button icon="Refresh" @click="loadAll">{{ t('common.refresh') }}</el-button>
        </el-col>
      </el-row>

      <el-table v-if="canLoad" v-loading="loading" :data="rows" row-key="l3Id" border>
        <el-table-column :label="t('tenantNav.refMenu')" prop="refMenuName" min-width="220" show-overflow-tooltip>
          <template #default="{ row }">
            <span>{{ row.refMenuName || '-' }}</span>
            <el-tag size="small" class="ml-1" :type="row.refMenuType === 'M' ? 'warning' : 'success'">
              {{ row.refMenuType === 'M' ? t('tenantNav.typeDir') : t('tenantNav.typePage') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('tenantNav.parent')" min-width="160">
          <template #default="{ row }">{{ parentLabel(row.parentId) }}</template>
        </el-table-column>
        <el-table-column :label="t('tenantNav.perms')" prop="refMenuPerms" min-width="180" show-overflow-tooltip>
          <template #default="{ row }">{{ row.refMenuPerms || '-' }}</template>
        </el-table-column>
        <el-table-column :label="t('tenantNav.orderNum')" prop="orderNum" width="100" align="center" />
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
        <el-table-column :label="t('common.column.operation')" width="180" align="center" fixed="right">
          <template #default="{ row }">
            <el-button v-hasPermi="['system:tenantMenu:edit']" link type="primary" icon="Edit" @click="openEdit(row)">
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
      <el-empty
        v-if="canLoad && !loading && !blocked && !loadFailed && rows.length === 0"
        :description="t('tenantNav.empty')"
      />
    </el-card>

    <el-dialog
      :close-on-click-modal="false"
      v-model="dialogVisible"
      :title="isEdit ? t('tenantNav.editTitle') : t('tenantNav.addTitle')"
      width="620px"
      append-to-body
      destroy-on-close
      :before-close="beforeFormClose"
    >
      <el-form ref="formRef" :model="form" :rules="rules" label-width="110px" @submit.prevent>
        <el-form-item :label="t('tenantNav.refMenu')" prop="refMenuId">
          <el-select
            :aria-label="t('tenantNav.refMenu')"
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
              <span v-if="opt.selected" class="ml-1 text-xs">({{ t('tenantNav.selected') }})</span>
            </el-option>
          </el-select>
          <div class="text-xs text-text-placeholder">{{ t('tenantNav.refMenuTip') }}</div>
        </el-form-item>
        <el-form-item :label="t('tenantNav.parent')" prop="parentId">
          <el-select :aria-label="t('tenantNav.parent')" v-model="form.parentId" class="w-full">
            <el-option :value="0" :label="t('tenantNav.parentTop')" />
            <el-option v-for="row in parentCandidates" :key="row.l3Id" :value="row.l3Id" :label="row.refMenuName" />
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
        <el-button @click="cancelForm">{{ t('common.cancel') }}</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { listTenantNav, tenantNavOptions, addTenantNav, updateTenantNav, delTenantNav } from '@/api/system/tenantNav'
import { listTenant } from '@/api/system/tenant'
import type { SysTenantMenuVo, TenantNavMenuOptionVo } from '@/api/system/tenantNav'
import type { TenantVo } from '@/api/system/tenant'
import type { ComponentInternalInstance } from 'vue'
import { checkPermi } from '@/utils/permission'
import { confirmAction } from '@/utils/confirm'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import { validateForm } from '@/utils/formValidate'
import { httpStatusOf } from '@/utils/requestError'
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
/** 取数失败（区别于"能力位被关闭"）：驱动可重试的错误条，并拦住写入口 */
const loadFailed = ref(false)
/** 平台侧租户下拉是否没读到：没读到 ⇒ 不能确定当前可代管哪个租户 */
const tenantOptionsFailed = ref(false)
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
    loadFailed.value = false
  } catch (e) {
    // b140：这里此前把**任何**失败都折算成"能力位未开启"。403 才是被管理性关闭；
    // 网络抖动、5xx、后端 bug 一律显示"请联系平台管理员开启"，等于界面在撒谎——
    // 用户会去提工单要求开启一个本来已经开启的功能（AGENTS 前言 ⑨：错误提示会被
    // 当成行动指令；㊷①：失败、没有、被关闭是三种界面，不是两种文案）。
    if (httpStatusOf(e) === 403) {
      blocked.value = true
      blockedTip.value = t('tenantNav.disabledTip')
      loadFailed.value = false
    } else {
      blocked.value = false
      loadFailed.value = true
    }
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
    tenantOptionsFailed.value = false
  } catch {
    // b140：读失败不得静默清成空列表——"没有租户"与"没读到"必须可区分（b133 同族），
    // 且未就绪时不得让人往下走（下面的 submitForm 有对应闸）。
    tenantOptionsFailed.value = true
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

const { beforeClose: beforeFormClose, cancel: cancelForm, markSaved } = useDialogDirtyGuard(dialogVisible, form)

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
  // b140（项8 C2）：**占闸必须是函数体第一件事**。原先 `await validateForm()` 排在置位之前，
  // 两次连点各自等校验、各自通过、各自提交一次——按钮的 `:loading` 挡不住，
  // 因为第一次点击时 `saving` 还是 false（与 `useRowActionGuard` 用同步 Set 的理由同源）。
  if (saving.value) return
  saving.value = true
  try {
    // b140 规则①（AGENTS ㉟/b133）：**没读到就不许写**。按钮 disabled 只是 UI 约定，
    // 函数才是安全边界——失败时菜单树是空的，提交上去的 parentId/ refMenuId 来自
    // 上一次（甚至上上次）成功的数据，界面上的"看起来正常"掩盖了一次脏写。
    if (loadFailed.value || tenantOptionsFailed.value) {
      proxy?.$modal.msgWarning(t('common.loadFailed'))
      return
    }
    if (!(await validateForm(formRef.value))) return
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
    markSaved()
    dialogVisible.value = false
    await loadAll()
  } catch (e) {
    // 提示由请求拦截器统一给（b125 ⑤：同一次失败只许一条），这里只负责**不让拒绝逸出**——
    // 此前没有 catch，接口失败会经 Vue 的错误处理链走到 ErrorBoundary 并把整张表单卸载
    // （用户视角：点了确定，表单没了，什么都没保存；b107 同一形状）。
    if (import.meta.env.DEV) console.error('[tenantNav] submit failed:', e)
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: SysTenantMenuVo) {
  const ok = await confirmAction(t('tenantNav.deleteConfirm', [row.refMenuName]))
  if (!ok) return
  try {
    await delTenantNav(row.l3Id)
    proxy?.$modal.msgSuccess(t('common.success'))
    await loadAll()
  } catch (e) {
    // 拦截器已提示；阻止拒绝逸出
    if (import.meta.env.DEV) console.error('[tenantNav] delete:', e)
  }
}

onMounted(() => {
  loadTenantOptions()
  loadAll()
})
</script>
