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
              show-overflow-tooltip
            />
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
                  v-model="scope.row.status"
                  active-value="0"
                  inactive-value="1"
                  @change="handleStatusChange(scope.row)"
                ></el-switch>
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
    <el-dialog :title="title" v-model="open" width="min(90%, 600px)" append-to-body destroy-on-close>
      <el-form :model="form" :rules="rules" ref="userRef" label-width="80px">
        <el-row>
          <el-col :span="12">
            <el-form-item :label="t('user.form.nickName')" prop="nickName">
              <el-input v-model="form.nickName" :placeholder="t('common.form.inputPlaceholder')" maxlength="30" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('user.form.dept')" prop="deptId">
              <el-tree-select
                v-model="form.deptId"
                :data="enabledDeptOptions"
                :props="{ value: 'id', label: 'label', children: 'children' }"
                value-key="id"
                :placeholder="t('common.form.selectPlaceholder')"
                clearable
                check-strictly
              />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item :label="t('user.form.phone')" prop="phonenumber">
              <el-input
                v-model.trim="form.phonenumber"
                :placeholder="t('common.form.inputPlaceholder')"
                maxlength="11"
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('user.form.email')" prop="email">
              <el-input v-model.trim="form.email" :placeholder="t('common.form.inputPlaceholder')" maxlength="50" />
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <Transition name="expand-fade">
              <el-form-item v-if="form.userId == undefined" :label="t('user.form.username')" prop="userName">
                <el-input v-model="form.userName" :placeholder="t('common.form.inputPlaceholder')" maxlength="30" />
              </el-form-item>
            </Transition>
          </el-col>
          <el-col :span="12">
            <Transition name="expand-fade">
              <el-form-item
                v-if="form.userId == undefined"
                :label="t('user.form.password')"
                prop="password"
                :rules="pwdValidator"
              >
                <el-input
                  v-model.trim="form.password"
                  :placeholder="t('user.form.phPassword')"
                  type="password"
                  maxlength="20"
                  show-password
                />
              </el-form-item>
            </Transition>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item :label="t('user.form.sex')">
              <el-select v-model="form.sex" :placeholder="t('common.form.selectPlaceholder')">
                <el-option
                  v-for="dict in sys_user_sex"
                  :key="dict.value"
                  :label="dict.label"
                  :value="dict.value"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('user.form.status')">
              <el-radio-group v-model="form.status">
                <el-radio v-for="dict in sys_normal_disable" :key="dict.value" :value="dict.value">
                  {{ dict.label }}
                </el-radio>
              </el-radio-group>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="12">
            <el-form-item :label="t('user.form.post')">
              <el-select v-model="form.postIds" multiple :placeholder="t('common.form.selectPlaceholder')">
                <el-option
                  v-for="item in postOptions"
                  :key="item.postId"
                  :label="item.postName"
                  :value="item.postId"
                  :disabled="item.status == 1"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('user.form.role')">
              <el-select v-model="form.roleIds" multiple :placeholder="t('common.form.selectPlaceholder')">
                <el-option
                  v-for="item in roleOptions"
                  :key="item.roleId"
                  :label="item.roleName"
                  :value="item.roleId"
                  :disabled="item.status == 1"
                ></el-option>
              </el-select>
            </el-form-item>
          </el-col>
        </el-row>
        <el-row>
          <el-col :span="24">
            <el-form-item :label="t('user.form.remark')">
              <el-input
                v-model="form.remark"
                type="textarea"
                :placeholder="t('common.form.inputPlaceholder')"
                :maxlength="500"
                show-word-limit
              ></el-input>
            </el-form-item>
          </el-col>
        </el-row>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">{{ t('common.confirm') }}</el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

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
  </div>
</template>

<script setup lang="ts" name="User">
import TreePanel from '@/components/TreePanel/index.vue'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import BatchActions from '@/components/BatchActions/index.vue'
import UserViewDrawer from './view.vue'
import { usePasswordRule } from '@/utils/passwordRule'
import {
  changeUserStatus,
  listUser,
  resetUserPwd,
  delUser,
  getUser,
  updateUser,
  addUser,
  deptTreeSelect
} from '@/api/system/user'
import type { SysUser, UserQueryParams } from '@/types/api/system/user'
import type { SysRole } from '@/types/api/system/role'
import type { SysPost } from '@/types/api/system/post'
import type { TreeSelect, TableShowColumns, AjaxResult } from '@/types/api/common'
import modal from '@/plugins/modal'
import { addDateRange } from '@/utils/yebot'
import { download } from '@/utils/request'
import { getConfigKey } from '@/api/system/config'
import { ElMessageBox } from 'element-plus'
import { useSearchPersistence } from '@/composables/useSearchPersistence'

const router = useRouter()
const { t } = useI18n()
const queryRefRef = useTemplateRef('queryRef')
const deptTreeRefRef = useTemplateRef('deptTreeRef')
const userViewRefRef = useTemplateRef('userViewRef')
const userRefRef = useTemplateRef('userRef')
const userTableRef = useTemplateRef('userTableRef')
const { pwdValidator, pwdPromptValidator } = usePasswordRule()
const { sys_normal_disable, sys_user_sex } = useDict('sys_normal_disable', 'sys_user_sex')

const userList = ref<SysUser[]>([])
const open = ref<boolean>(false)
const loading = ref<boolean>(true)
const submitLoading = ref<boolean>(false)
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

const data = reactive({
  form: {} as SysUser,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    userName: undefined,
    phonenumber: undefined,
    status: undefined,
    deptId: undefined
  } as UserQueryParams
})

// M1: rules 改为 computed 以响应语言切换；el-form 通过 :rules 绑定读取最新值，validate 仍可正常工作
const rules = computed(() => ({
  userName: [
    { required: true, message: t('user.validate.userNameRequired'), trigger: 'blur' },
    { min: 2, max: 20, message: t('user.validate.userNameLength'), trigger: 'blur' }
  ],
  nickName: [{ required: true, message: t('user.validate.nickNameRequired'), trigger: 'blur' }],
  email: [{ type: 'email', message: t('user.validate.emailFormat'), trigger: ['blur', 'change'] }],
  phonenumber: [{ pattern: /^1[3|4|5|6|7|8|9][0-9]\d{8}$/, message: t('user.validate.phoneFormat'), trigger: 'blur' }]
}))

const { queryParams, form } = toRefs(data)

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
// L11: setup 顶层 Object.assign 是有意为之 - 必须在 getList() 调用前恢复查询参数，
// 否则首次加载会用默认分页而非用户上次保存的搜索条件。此处副作用可接受。
if (savedQuery.value) {
  Object.assign(queryParams.value, savedQuery.value)
}

/** 查询用户列表 */
function getList() {
  loading.value = true
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

/** 重置操作表单 */
function reset() {
  form.value = {
    userId: undefined,
    deptId: undefined,
    userName: undefined,
    nickName: undefined,
    password: undefined,
    phonenumber: undefined,
    email: undefined,
    sex: undefined,
    status: '0',
    remark: undefined,
    postIds: [],
    roleIds: []
  }
  userRefRef.value?.resetFields()
}

/** 取消按钮 */
function cancel() {
  open.value = false
  reset()
}

/** 新增按钮操作 */
function handleAdd() {
  reset()
  getUser()
    .then((response) => {
      postOptions.value = response.posts
      roleOptions.value = response.roles
      open.value = true
      title.value = t('common.add')
      form.value.password = initPassword.value
    })
    .catch(() => {})
}

/** 修改按钮操作 */
function handleUpdate(row?: SysUser) {
  reset()
  const userId = row?.userId || ids.value[0]
  getUser(userId)
    .then((response) => {
      form.value = response.data!
      postOptions.value = response.posts
      roleOptions.value = response.roles
      form.value.postIds = response.postIds
      form.value.roleIds = response.roleIds
      open.value = true
      title.value = t('common.edit')
      form.value.password = ''
    })
    // M4: 加载用户信息失败由 request 拦截器提示，此处记录日志
    .catch((e) => {
      if (import.meta.env.DEV) console.error('Failed to load user info:', e)
    })
}

/** 提交按钮 */
function submitForm() {
  userRefRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      if (form.value.userId != undefined) {
        updateUser(form.value)
          .then(() => {
            modal.msgSuccess(t('common.editSuccess'))
            open.value = false
            getList()
          })
          // M4: 更新失败由 request 拦截器提示，此处记录日志
          .catch((e) => {
            if (import.meta.env.DEV) console.error('Failed to update user:', e)
          })
          .finally(() => {
            submitLoading.value = false
          })
      } else {
        addUser(form.value)
          .then(() => {
            modal.msgSuccess(t('common.addSuccess'))
            open.value = false
            getList()
          })
          // M4: 新增失败由 request 拦截器提示，此处记录日志
          .catch((e) => {
            if (import.meta.env.DEV) console.error('Failed to add user:', e)
          })
          .finally(() => {
            submitLoading.value = false
          })
      }
    }
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
