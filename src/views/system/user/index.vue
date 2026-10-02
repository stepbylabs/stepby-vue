<template>
  <div class="app-container tree-sidebar-manage-wrap">
    <tree-panel
      :title="t('user.search.dept')"
      :tree-data="deptOptions"
      :search-placeholder="t('user.search.phDept')"
      storage-key="dept-sidebar-width"
      :defaultExpandAll="true"
      @node-click="handleNodeClick"
      @refresh="getDeptTree"
      ref="deptTreeRef"
    />
    <div class="tree-sidebar-content">
      <div class="content-inner">
        <Transition name="expand-fade">
          <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
            <el-form-item :label="t('user.search.username')" prop="userName">
              <el-input
                v-model="queryParams.userName"
                :placeholder="t('user.search.phUsername')"
                clearable
                class="w-[240px]"
                @keyup.enter="handleQuery"
              />
            </el-form-item>
            <el-form-item :label="t('user.search.phone')" prop="phonenumber">
              <el-input
                v-model="queryParams.phonenumber"
                :placeholder="t('user.search.phPhone')"
                clearable
                class="w-[240px]"
                @keyup.enter="handleQuery"
              />
            </el-form-item>
            <el-form-item :label="t('user.search.status')" prop="status">
              <el-select
                v-model="queryParams.status"
                :placeholder="t('user.search.phStatus')"
                clearable
                class="w-[240px]"
              >
                <el-option
                  v-for="dict in sys_normal_disable"
                  :key="dict.value"
                  :label="dict.label"
                  :value="dict.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('user.search.createTime')" class="w-[308px]">
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
            <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:user:add']">
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
              v-hasPermi="['system:user:edit']"
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
              v-hasPermi="['system:user:remove']"
            >
              {{ t('common.delete') }}
            </el-button>
          </el-col>
          <el-col :span="1.5">
            <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['system:user:export']">
              {{ t('common.export') }}
            </el-button>
          </el-col>
          <el-col :span="1.5">
            <el-button type="info" plain icon="Upload" @click="handleImport" v-hasPermi="['system:user:import']">
              {{ t('common.import') }}
            </el-button>
          </el-col>
          <right-toolbar
            v-model:showSearch="showSearch"
            @queryTable="getList"
            :columns="columns"
            storage-key="user-list-columns"
            :show-print="true"
            :print-data="userList"
            :print-title="t('user.title')"
          ></right-toolbar>
        </el-row>

        <Transition name="fade" mode="out-in">
          <SkeletonTable v-if="loading" :columns="9" :rows="8" />
          <el-table
            v-else
            ref="userTableRef"
            v-loading="loading"
            :data="userList"
            :row-key="(row: SysUser) => row.userId"
            @selection-change="handleSelectionChange"
          >
            <el-table-column type="selection" width="50" align="center" />
            <el-table-column
              :label="t('user.column.id')"
              align="center"
              key="userId"
              prop="userId"
              v-if="columns.userId.visible"
              width="80"
            />
            <TenantColumn />
            <el-table-column
              :label="t('user.column.username')"
              align="center"
              key="userName"
              v-if="columns.userName.visible"
              min-width="120"
              show-overflow-tooltip
            >
              <template #default="scope">
                <el-link type="primary" underline="never" @click="handleViewData(scope.row)">
                  {{ scope.row.userName }}
                </el-link>
              </template>
            </el-table-column>
            <el-table-column
              :label="t('user.column.nickName')"
              align="center"
              key="nickName"
              prop="nickName"
              v-if="columns.nickName.visible"
              min-width="120"
              show-overflow-tooltip
            />
            <el-table-column
              :label="t('user.column.dept')"
              align="center"
              key="deptName"
              prop="dept.deptName"
              v-if="columns.deptName.visible"
              min-width="120"
            >
              <template #default="scope">
                <span>{{ scope.row.dept?.deptName }}</span>
                <el-tooltip
                  v-if="(scope.row.deptIds?.length ?? 0) > 0"
                  :content="t('user.column.deptSecondaryTip', { count: scope.row.deptIds.length })"
                  placement="top"
                >
                  <el-tag size="small" type="info" class="ml-1">+{{ scope.row.deptIds.length }}</el-tag>
                </el-tooltip>
              </template>
            </el-table-column>
            <el-table-column
              :label="t('user.column.phone')"
              align="center"
              key="phonenumber"
              prop="phonenumber"
              v-if="columns.phonenumber.visible"
              width="120"
            >
              <template #default="scope">
                <span v-desensitize="'phone'" :data-value="scope.row.phonenumber">{{ scope.row.phonenumber }}</span>
              </template>
            </el-table-column>
            <el-table-column :label="t('user.column.status')" align="center" key="status" v-if="columns.status.visible">
              <template #default="scope">
                <el-switch
                  v-hasPermi="['system:user:edit']"
                  v-model="scope.row.status"
                  active-value="0"
                  inactive-value="1"
                  @change="handleStatusChange(scope.row)"
                ></el-switch>
              </template>
            </el-table-column>
            <!-- v5-E4：账号来源标识（sys_oauth_user 存在绑定 → 第三方） -->
            <el-table-column
              :label="t('user.column.oauthBound')"
              align="center"
              key="oauthBound"
              width="90"
            >
              <template #default="scope">
                <el-tag v-if="scope.row.oauthBound" type="warning" size="small">
                  {{ t('user.column.oauthBoundTag') }}
                </el-tag>
                <span v-else class="text-text-placeholder">-</span>
              </template>
            </el-table-column>
            <el-table-column
              :label="t('user.column.createTime')"
              align="center"
              prop="createTime"
              v-if="columns.createTime.visible"
              width="160"
            >
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
                <el-tooltip :content="t('common.edit')" placement="top" v-if="scope.row.userId !== 1">
                  <el-button
                    link
                    type="primary"
                    icon="Edit"
                    :aria-label="t('common.edit')"
                    @click="handleUpdate(scope.row)"
                    v-hasPermi="['system:user:edit']"
                  ></el-button>
                </el-tooltip>
                <el-tooltip :content="t('common.delete')" placement="top" v-if="scope.row.userId !== 1">
                  <el-button
                    link
                    type="primary"
                    icon="Delete"
                    :aria-label="t('common.delete')"
                    @click="handleDelete(scope.row)"
                    v-hasPermi="['system:user:remove']"
                  ></el-button>
                </el-tooltip>
                <el-tooltip :content="t('user.tip.resetPwdTitle')" placement="top" v-if="scope.row.userId !== 1">
                  <el-button
                    link
                    type="primary"
                    icon="Key"
                    :aria-label="t('user.resetPwd')"
                    @click="handleResetPwd(scope.row)"
                    v-hasPermi="['system:user:resetPwd']"
                  ></el-button>
                </el-tooltip>
                <el-tooltip :content="t('role.selectUser.title')" placement="top" v-if="scope.row.userId !== 1">
                  <el-button
                    link
                    type="primary"
                    icon="CircleCheck"
                    :aria-label="t('user.assignRoles')"
                    @click="handleAuthRole(scope.row)"
                    v-hasPermi="['system:user:edit']"
                  ></el-button>
                </el-tooltip>
                <!-- GDPR 用户匿名化：入口可见性由后端按能力位 privacy.user_erasure + 平台归属算好下发
                     （userStore.showUserErasure），不在此处二次推断 ⇒ 不会造出"可见但请求 404"的假入口 -->
                <el-tooltip
                  :content="t('user.erasure.button')"
                  placement="top"
                  v-if="scope.row.userId !== 1 && userStore.showUserErasure"
                >
                  <el-button
                    link
                    type="danger"
                    icon="UserFilled"
                    :aria-label="t('user.erasure.button')"
                    @click="handleAnonymize(scope.row)"
                    v-hasPermi="['system:user:remove']"
                  ></el-button>
                </el-tooltip>
              </template>
            </el-table-column>
            <template #empty>
              <EmptyState
                :description="t('common.noData')"
                :action-text="hasQueryFilter ? t('common.emptyActionReset') : t('common.emptyActionCreate')"
                :action-icon="hasQueryFilter ? 'RefreshLeft' : 'Plus'"
                :show-reset="hasQueryFilter"
                :reset-text="t('common.emptyActionReset')"
                @action="hasQueryFilter ? resetQuery() : handleAdd()"
                @reset="resetQuery"
              />
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
      </div>
    </div>
    <!-- 添加或修改用户配置对话框 -->
    <user-form-dialog
      v-model:open="open"
      :title="title"
      :dept-options="deptOptions"
      :enabled-dept-options="enabledDeptOptions"
      :post-options="postOptions"
      :role-options="roleOptions"
      :scim-role-ids="scimRoleIds"
      :scim-dept-ids="scimDeptIds"
      :edit-user="editUser"
      :init-password="initPassword"
      @submit-success="getList"
    />

    <!-- 用户详情抽屉 -->
    <user-view-drawer ref="userViewRef" />

    <!-- 批量操作浮动工具栏 -->
    <batch-actions :selected-count="ids.length" @clear="clearSelection">
      <el-button
        type="danger"
        plain
        size="small"
        icon="Delete"
        @click="handleDelete()"
        v-hasPermi="['system:user:remove']"
      >
        {{ t('common.batchDelete') }}
      </el-button>
      <el-button
        type="warning"
        plain
        size="small"
        icon="Download"
        @click="handleExport"
        v-hasPermi="['system:user:export']"
      >
        {{ t('common.export') }}
      </el-button>
    </batch-actions>

    <!-- 批量导入用户对话框（下载模板 + 上传 xlsx + 校验错误回显） -->
    <excel-import-dialog
      ref="importDialogRef"
      :title="t('user.import.title')"
      action="/system/user/importData"
      template-action="/system/user/importTemplate"
      template-file-name="user_import_template"
      :update-support-label="t('user.import.updateSupport')"
      @success="handleImportSuccess"
    />
  </div>
</template>

<script setup lang="ts" name="User">
import TreePanel from '@/components/TreePanel/index.vue'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import TenantColumn from '@/components/TenantColumn/index.vue'
import TenantFilter from '@/components/TenantFilter/index.vue'
import BatchActions from '@/components/BatchActions/index.vue'
import ExcelImportDialog from '@/components/ExcelImportDialog/index.vue'
import UserViewDrawer from './view.vue'
import UserFormDialog from './UserFormDialog.vue'
import { usePasswordRule } from '@/utils/passwordRule'
import { changeUserStatus, listUser, resetUserPwd, delUser, getUser, deptTreeSelect, anonymizeUserPrecheck, anonymizeUser } from '@/api/system/user'
import type { SysUser, UserQueryParams, UserErasureReport } from '@/types/api/system/user'
import type { SysRole } from '@/types/api/system/role'
import type { SysPost } from '@/types/api/system/post'
import type { TreeSelect, TableShowColumns, AjaxResult } from '@/types/api/common'
import modal from '@/plugins/modal'
import { addDateRange } from '@/utils/stepby'
import { download } from '@/utils/request'
import { getConfigKey } from '@/api/system/config'
import { ElMessageBox } from 'element-plus'
import { useSearchPersistence } from '@/composables/useSearchPersistence'
import { useRoute } from 'vue-router'
import useSettingsStore from '@/store/modules/settings'
import useUserStore from '@/store/modules/user'

const userStore = useUserStore()
const router = useRouter()
const { t } = useI18n()
const queryRefRef = useTemplateRef('queryRef')
const deptTreeRefRef = useTemplateRef('deptTreeRef')
const userViewRefRef = useTemplateRef('userViewRef')
const importDialogRef = useTemplateRef('importDialogRef')
const userTableRef = useTemplateRef('userTableRef')
const { pwdPromptValidator } = usePasswordRule()
// 搜索区状态筛选使用；对话框内的状态/性别字典已迁入 UserFormDialog
const { sys_normal_disable } = useDict('sys_normal_disable')

const userList = ref<SysUser[]>([])
const open = ref<boolean>(false)
const loading = ref<boolean>(true)
const showSearch = ref<boolean>(true)
const ids = ref<number[]>([])
const single = ref<boolean>(true)
const multiple = ref<boolean>(true)
const total = ref<number>(0)
const title = ref<string>('')
const dateRange = ref<string[]>([])
const deptOptions = ref<TreeSelect[] | undefined>(undefined)
const enabledDeptOptions = ref<TreeSelect[] | undefined>(undefined)
const initPassword = ref<string | undefined>(undefined)
const postOptions = ref<SysPost[]>([])
const roleOptions = ref<SysRole[]>([])
// 编辑场景回填用户数据（含 postIds/roleIds/deptIds），新增场景为 undefined
const editUser = ref<SysUser | undefined>(undefined)
// v5-D12 Group：SCIM 组联动角色/兼职部门（编辑表单只读标记）
const scimRoleIds = ref<number[]>([])
const scimDeptIds = ref<number[]>([])
// 列显隐信息
// M1: columns 保持 ref（非 computed），因为 RightToolbar 通过 props 直接 mutate visible 属性来切换列显隐；
// 若改 computed，语言切换时 computed 重新求值会返回新对象，丢失用户已切换的 visible 状态。
// label 不响应语言切换是已知限制，可通过 watch locale 更新 label 优化（当前影响较小）。
const columns = ref<Record<string, TableShowColumns>>({
  userId: { label: t('user.column.id'), visible: true },
  userName: { label: t('user.column.username'), visible: true },
  nickName: { label: t('user.column.nickName'), visible: true },
  deptName: { label: t('user.column.dept'), visible: true },
  phonenumber: { label: t('user.column.phone'), visible: true },
  status: { label: t('user.column.status'), visible: true },
  createTime: { label: t('user.column.createTime'), visible: true }
})

// UX-7：列显隐偏好持久化 —— 从用户偏好恢复，改动后写回（刷新/换设备保持一致）
const settingsStore = useSettingsStore()
const USER_TABLE_KEY = 'system:user'
const savedColumns = settingsStore.userPrefs.tableColumns?.[USER_TABLE_KEY]
if (savedColumns?.length) {
  for (const key of Object.keys(columns.value)) {
    columns.value[key].visible = savedColumns.includes(key)
  }
}
watch(
  columns,
  (v: Record<string, TableShowColumns>) => {
    const visible = Object.keys(v).filter((k) => v[k].visible)
    settingsStore.updateUserPrefs({
      tableColumns: { ...settingsStore.userPrefs.tableColumns, [USER_TABLE_KEY]: visible }
    })
  },
  { deep: true }
)

const data = reactive({
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    userName: undefined,
    phonenumber: undefined,
    status: undefined,
    deptId: undefined
  } as UserQueryParams
})

const { queryParams } = toRefs(data)

// TierA-4: 是否有查询条件（用于空状态 CTA 切换文案）
const hasQueryFilter = computed(() => {
  const q = queryParams.value
  return !!(
    q.userName ||
    q.phonenumber ||
    q.status ||
    q.deptId ||
    q.beginTime ||
    q.endTime ||
    (dateRange.value && dateRange.value.length > 0)
  )
})

// TierB-3: 搜索条件持久化 - 进入页面时恢复，搜索/重置时保存
const { savedQuery, saveQuery: persistQuery, clearQuery: clearPersistedQuery } = useSearchPersistence('user-list')

// UX-6：恢复查询条件的优先级 —— **URL query 优先**（可分享/刷新/书签保持），
// 无 URL 参数时才回落到 localStorage 记忆（跨会话）。两者互补而非互相覆盖。
// L11: setup 顶层 Object.assign 是有意为之 - 必须在 getList() 调用前恢复查询参数，
// 否则首次加载会用默认分页而非用户上次保存的搜索条件。此处副作用可接受。
const route = useRoute()
const urlQuery = route.query as Record<string, unknown>
const hasUrlQuery = Object.keys(urlQuery).length > 0
if (hasUrlQuery) {
  // 仅覆盖查询对象中已存在的键，避免把任意 URL 参数注入查询条件
  for (const [k, v] of Object.entries(urlQuery)) {
    if (!(k in queryParams.value) || v === undefined || v === null || v === '') continue
    const current = (queryParams.value as unknown as Record<string, unknown>)[k]
    ;(queryParams.value as unknown as Record<string, unknown>)[k] =
      typeof current === 'number' && !Number.isNaN(Number(v)) ? Number(v) : v
  }
} else if (savedQuery.value) {
  Object.assign(queryParams.value, savedQuery.value)
}

/**
 * 查询条件写入 URL（UX-6，replace 不污染历史栈）
 * 仅写入非空值，与 useCrudTable 内的同名逻辑保持一致语义。
 */
function syncUrlQuery() {
  if (!router) return
  const src = queryParams.value as unknown as Record<string, unknown>
  const q: Record<string, string> = {}
  for (const [k, v] of Object.entries(src)) {
    if (v === undefined || v === null || v === '') continue
    q[k] = String(v)
  }
  if (JSON.stringify(q) === JSON.stringify(route.query as Record<string, string>)) return
  router.replace({ query: q }).catch(() => {})
}

/** 查询用户列表（UX-6：同步查询条件到 URL，刷新/分享不丢失） */
function getList() {
  loading.value = true
  syncUrlQuery()
  listUser(addDateRange(queryParams.value, dateRange.value))
    .then((res) => {
      userList.value = res.rows
      total.value = res.total
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

/** 查询部门下拉树结构 */
function getDeptTree() {
  deptTreeSelect()
    .then((response) => {
      deptOptions.value = response.data
      enabledDeptOptions.value = filterDisabledDept(JSON.parse(JSON.stringify(response.data)))
    })
    .catch(() => {})
}

/** 过滤禁用的部门 */
function filterDisabledDept(deptList: TreeSelect[]) {
  return deptList.filter((dept) => {
    if (dept.disabled) {
      return false
    }
    if (dept.children && dept.children.length) {
      dept.children = filterDisabledDept(dept.children)
    }
    return true
  })
}

/** 节点单击事件 */
function handleNodeClick(data: TreeSelect) {
  queryParams.value.deptId = data.id
  handleQuery()
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.value.pageNum = 1
  // TierB-3: 持久化搜索条件（排除分页参数）
  persistQuery({
    userName: queryParams.value.userName,
    phonenumber: queryParams.value.phonenumber,
    status: queryParams.value.status,
    deptId: queryParams.value.deptId
  })
  getList()
}

/** 重置按钮操作 */
function resetQuery() {
  dateRange.value = []
  queryRefRef.value?.resetFields()
  queryParams.value.tenantId = undefined
  queryParams.value.deptId = undefined
  deptTreeRefRef.value?.setCurrentKey(null)
  // TierB-3: 清除持久化的搜索条件
  clearPersistedQuery()
  handleQuery()
}

/** 删除按钮操作 */
function handleDelete(row?: SysUser) {
  const userIds = row?.userId != null ? [row.userId] : ids.value
  if (!userIds || userIds.length === 0) {
    modal.msgWarning(t('common.selectToDelete'))
    return
  }
  modal
    .confirm(t('common.confirmDelete', { ids: userIds }))
    .then(function () {
      return delUser(userIds)
    })
    .then(() => {
      getList()
      // 清除选中状态：避免删除后按钮 disabled 状态与已删除数据不一致
      clearSelection()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    // M4: 用户取消确认对话框（e 为 'cancel' 字符串）时不记录；删除失败由 request 拦截器提示，此处记录日志
    .catch((e: unknown) => {
      if (e instanceof Error) {
        if (import.meta.env.DEV) console.error('Failed to delete user:', e)
      }
    })
}

/** 导出按钮操作 */
function handleExport() {
  download(
    '/system/user/export',
    {
      ...queryParams.value
    },
    `user_${new Date().getTime()}.xlsx`
  )
}

/** 打开批量导入对话框 */
function handleImport() {
  importDialogRef.value?.open()
}

/** 导入成功后刷新列表 */
function handleImportSuccess() {
  getList()
}

/** 用户状态修改  */
function handleStatusChange(row: SysUser) {
  const text = row.status === '0' ? t('common.enabled') : t('common.disabled')
  modal
    .confirm(t('user.tip.confirmStatusChange', { text, name: row.userName }))
    .then(function () {
      return changeUserStatus(row.userId!, row.status!)
    })
    .then(() => {
      modal.msgSuccess(t('common.success'))
    })
    .catch(function () {
      row.status = row.status === '0' ? '1' : '0'
    })
}

/** 跳转角色分配 */
function handleAuthRole(row: SysUser) {
  // L5: 断言 userId 非空（表格行数据均来自后端列表，userId 必存在）
  const userId = row.userId!
  router.push('/system/user-auth/role/' + userId)
}

/** 重置密码按钮操作 */
function handleResetPwd(row: SysUser) {
  ElMessageBox.prompt(t('user.tip.editPwd'), t('user.tip.resetPwdTitle'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    closeOnClickModal: false,
    inputValidator: pwdPromptValidator
  })
    .then(({ value }: { value: string }) => {
      resetUserPwd(row.userId!, value)
        .then(() => {
          modal.msgSuccess(t('user.tip.resetPwdSuccess', { password: value }))
        })
        .catch(() => {})
    })
    // M4: 用户取消 prompt（e 为 'cancel'）不记录；重置失败由 request 拦截器提示，此处记录日志
    .catch((e: unknown) => {
      if (e instanceof Error) {
        if (import.meta.env.DEV) console.error('Failed to reset password:', e)
      }
    })
}

/**
 * GDPR 用户匿名化（不可逆）。
 *
 * 两段式：先调**只读预检**拿到影响面（字段清单 + 凭据计数），把后果逐项告知用户；
 * 用户在确认框中明确同意后才调执行端点。执行成功后刷新列表。
 *
 * 入口本身由后端 `userStore.showUserErasure` 门控（能力位 + 平台归属），
 * 因此正常情况下不会触达"能力关闭 ⇒ 404"的分支。
 */
async function handleAnonymize(row: SysUser): Promise<void> {
  if (!row.userId) return
  let report: UserErasureReport | undefined
  try {
    const pre = await anonymizeUserPrecheck(row.userId)
    report = pre.data
  } catch (e) {
    if (import.meta.env.DEV) console.error('[user] anonymize precheck failed:', e)
    return
  }
  if (!report) return
  const detail = t('user.erasure.confirm', {
    user: row.userName || '',
    fields: report.fields?.length ?? 0,
    pat: report.patCount ?? 0,
    sso: report.ssoBindingCount ?? 0,
    sessions: report.onlineSessionCount ?? 0
  })
  try {
    await ElMessageBox.confirm(detail, t('user.erasure.title'), {
      confirmButtonText: t('user.erasure.confirmBtn'),
      cancelButtonText: t('common.cancel'),
      type: 'warning',
      closeOnClickModal: false
    })
  } catch {
    // 用户取消：不执行（预检是只读的，无副作用）
    return
  }
  try {
    await anonymizeUser(row.userId)
    modal.msgSuccess(t('user.erasure.done', { user: row.userName || '' }))
    getList()
  } catch (e) {
    if (import.meta.env.DEV) console.error('[user] anonymize failed:', e)
  }
}

/** 选择条数  */
function handleSelectionChange(selection: SysUser[]) {
  ids.value = selection.map((item) => item.userId!)
  single.value = selection.length != 1
  multiple.value = !selection.length
}

/** 清空选择 */
function clearSelection() {
  // 通过 ref 清空表格选择，避免 document.querySelector 在多表格场景下误清空
  userTableRef.value?.clearSelection()
  ids.value = []
  single.value = true
  multiple.value = true
}

/** 详情按钮操作 */
function handleViewData(row: SysUser) {
  userViewRefRef.value?.open(row.userId)
}

/** 新增按钮操作 */
function handleAdd() {
  editUser.value = undefined
  scimRoleIds.value = []
  scimDeptIds.value = []
  title.value = t('common.add')
  getUser()
    .then((response) => {
      postOptions.value = response.posts
      roleOptions.value = response.roles
      open.value = true
    })
    .catch(() => {})
}

/** 修改按钮操作 */
function handleUpdate(row?: SysUser) {
  const userId = row?.userId || ids.value[0]
  title.value = t('common.edit')
  getUser(userId)
    .then((response) => {
      postOptions.value = response.posts
      roleOptions.value = response.roles
      editUser.value = {
        ...(response.data || {}),
        postIds: response.postIds,
        roleIds: response.roleIds,
        deptIds: response.deptIds
      }
      scimRoleIds.value = response.scimRoleIds ?? []
      scimDeptIds.value = response.scimDeptIds ?? []
      open.value = true
    })
    // M4: 加载用户信息失败由 request 拦截器提示，此处记录日志
    .catch((e) => {
      if (import.meta.env.DEV) console.error('Failed to load user info:', e)
    })
}

onMounted(() => {
  getDeptTree()
  getList()
  getConfigKey('sys.user.initPassword')
    .then((response: AjaxResult) => {
      initPassword.value = response.msg
    })
    // M4: initPassword 获取失败影响新增用户（密码为空），需明确提示用户
    .catch((e) => {
      if (import.meta.env.DEV) console.error('Failed to get initial password config:', e)
      modal.msgError(t('common.failed'))
    })
})
</script>
