<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" v-show="showSearch" :inline="true" label-width="68px">
        <el-form-item :label="t('role.search.roleName')" prop="roleName">
          <el-input
            v-model="queryParams.roleName"
            :placeholder="t('role.search.phRoleName')"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('role.search.roleKey')" prop="roleKey">
          <el-input
            v-model="queryParams.roleKey"
            :placeholder="t('role.search.phRoleKey')"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('role.search.status')" prop="status">
          <el-select v-model="queryParams.status" :placeholder="t('role.search.phStatus')" clearable class="w-[240px]">
            <el-option v-for="dict in sys_normal_disable" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('role.search.createTime')" class="w-[308px]">
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:role:add']">
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
          v-hasPermi="['system:role:edit']"
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
          v-hasPermi="['system:role:remove']"
        >
          {{ t('common.delete') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Download" @click="handleExport" v-hasPermi="['system:role:export']">
          {{ t('common.export') }}
        </el-button>
      </el-col>
      <right-toolbar
        v-model:showSearch="showSearch"
        :columns="columns"
        @queryTable="getList"
        :show-print="true"
        :print-data="dataList"
        :print-title="t('role.title')"
      ></right-toolbar>
    </el-row>

    <!-- 表格数据 -->
    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="8" :rows="8" />
      <el-table
        v-else
        v-loading="loading"
        :data="dataList"
        :row-key="(row: SysRole) => row.roleId"
        @selection-change="handleSelectionChange"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column :label="t('role.column.id')" prop="roleId" width="80" />
        <el-table-column :label="t('role.column.roleName')" prop="roleName" show-overflow-tooltip width="150" v-if="columns.roleName.visible" />
        <el-table-column :label="t('role.column.roleKey')" prop="roleKey" show-overflow-tooltip width="150" v-if="columns.roleKey.visible" />
        <el-table-column :label="t('role.column.sort')" prop="roleSort" width="100" v-if="columns.roleSort.visible" />
        <el-table-column :label="t('role.column.status')" align="center" width="100" v-if="columns.status.visible">
          <template #default="scope">
            <el-switch
              v-hasPermi="['system:role:edit']"
              v-model="scope.row.status"
              active-value="0"
              inactive-value="1"
              @change="handleStatusChange(scope.row)"
            ></el-switch>
          </template>
        </el-table-column>
        <el-table-column :label="t('role.column.createTime')" align="center" prop="createTime">
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('common.column.operation')"
          align="center"
          width="180"
          class-name="small-padding fixed-width"
        >
          <template #default="scope">
            <el-tooltip :content="t('common.edit')" placement="top" v-if="scope.row.roleId !== 1">
              <el-button
                link
                type="primary"
                icon="Edit"
                :aria-label="t('common.edit')"
                @click="handleUpdate(scope.row)"
                v-hasPermi="['system:role:edit']"
              ></el-button>
            </el-tooltip>
            <el-tooltip :content="t('common.delete')" placement="top" v-if="scope.row.roleId !== 1">
              <el-button
                link
                type="primary"
                icon="Delete"
                :aria-label="t('common.delete')"
                @click="handleDelete(scope.row)"
                v-hasPermi="['system:role:remove']"
              ></el-button>
            </el-tooltip>
            <el-tooltip :content="t('role.form.deptTree')" placement="top" v-if="scope.row.roleId !== 1">
              <el-button
                link
                type="primary"
                icon="CircleCheck"
                :aria-label="t('role.dataScope')"
                @click="handleDataScope(scope.row)"
                v-hasPermi="['system:role:edit']"
              ></el-button>
            </el-tooltip>
            <el-tooltip :content="t('role.selectUser.title')" placement="top" v-if="scope.row.roleId !== 1">
              <el-button
                link
                type="primary"
                icon="User"
                :aria-label="t('role.selectUser.title')"
                @click="handleAuthUser(scope.row)"
                v-hasPermi="['system:role:edit']"
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

    <!-- 添加或修改角色配置对话框 -->
    <el-dialog :title="title"  :before-close="beforeDialogClose" v-model="open" width="min(90%, 500px)" append-to-body destroy-on-close>
      <el-form ref="roleRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item :label="t('role.form.roleName')" prop="roleName">
          <el-input v-model.trim="form.roleName" :placeholder="t('role.search.phRoleName')" />
        </el-form-item>
        <el-form-item prop="roleKey">
          <template #label>
            <span>
              <el-tooltip :content="t('role.tip.roleKeyHelp')" placement="top">
                <el-icon><question-filled /></el-icon>
              </el-tooltip>
              {{ t('role.form.roleKey') }}
            </span>
          </template>
          <el-input v-model="form.roleKey" :placeholder="t('role.search.phRoleKey')" :maxlength="100" show-word-limit />
        </el-form-item>
        <el-form-item :label="t('role.form.roleSort')" prop="roleSort">
          <el-input-number v-model="form.roleSort" controls-position="right" :min="0" />
        </el-form-item>
        <el-form-item :label="t('role.form.status')">
          <el-radio-group v-model="form.status">
            <el-radio v-for="dict in sys_normal_disable" :key="dict.value" :value="dict.value">
              {{ dict.label }}
            </el-radio>
          </el-radio-group>
        </el-form-item>
        <el-form-item :label="t('role.form.menuTree')">
          <el-checkbox v-model="menuExpand" @change="handleCheckedTreeExpand($event, 'menu')">
            {{ t('common.expand') }}/{{ t('common.collapse') }}
          </el-checkbox>
          <el-checkbox v-model="menuNodeAll" @change="handleCheckedTreeNodeAll($event, 'menu')">
            {{ t('role.label.selectAll') }}
          </el-checkbox>
          <el-checkbox v-model="form.menuCheckStrictly" @change="handleCheckedTreeConnect($event, 'menu')">
            {{ t('role.label.linkage') }}
          </el-checkbox>
          <el-tree
            class="tree-border"
            :data="menuOptions"
            show-checkbox
            ref="menuRef"
            node-key="id"
            :check-strictly="!form.menuCheckStrictly"
            :empty-text="t('common.loading')"
            :props="{ label: 'label', children: 'children' }"
          ></el-tree>
        </el-form-item>
        <el-form-item :label="t('role.form.remark')">
          <el-input v-model="form.remark" type="textarea" :placeholder="t('common.form.inputPlaceholder')"></el-input>
        </el-form-item>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="submitLoading" @click="submitForm">{{ t('common.confirm') }}</el-button>
          <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>

    <!-- 分配角色数据权限对话框 -->
    <el-dialog :title="title" v-model="openDataScope" width="min(90%, 500px)" append-to-body destroy-on-close>
      <el-form :model="form" label-width="80px">
        <el-form-item :label="t('role.form.roleName')">
          <el-input v-model="form.roleName" :disabled="true" />
        </el-form-item>
        <el-form-item :label="t('role.form.roleKey')">
          <el-input v-model="form.roleKey" :disabled="true" />
        </el-form-item>
        <el-form-item :label="t('role.form.dataScope')">
          <el-select v-model="form.dataScope" @change="dataScopeSelectChange">
            <el-option
              v-for="item in dataScopeOptions"
              :key="item.value"
              :label="item.label"
              :value="item.value"
            ></el-option>
          </el-select>
        </el-form-item>
        <Transition name="expand-fade">
          <el-form-item :label="t('role.form.deptTree')" v-show="form.dataScope == 2">
            <el-checkbox v-model="deptExpand" @change="handleCheckedTreeExpand($event, 'dept')">
              {{ t('common.expand') }}/{{ t('common.collapse') }}
            </el-checkbox>
            <el-checkbox v-model="deptNodeAll" @change="handleCheckedTreeNodeAll($event, 'dept')">
              {{ t('role.label.selectAll') }}
            </el-checkbox>
            <el-checkbox v-model="form.deptCheckStrictly" @change="handleCheckedTreeConnect($event, 'dept')">
              {{ t('role.label.linkage') }}
            </el-checkbox>
            <el-tree
              class="tree-border"
              :data="deptOptions"
              show-checkbox
              default-expand-all
              ref="deptRef"
              node-key="id"
              :check-strictly="!form.deptCheckStrictly"
              :empty-text="t('common.loading')"
              :props="{ label: 'label', children: 'children' }"
            ></el-tree>
          </el-form-item>
        </Transition>
      </el-form>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="dataScopeLoading" @click="submitDataScope">
            {{ t('common.confirm') }}
          </el-button>
          <el-button @click="cancelDataScope">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="Role">
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import {
  addRole,
  changeRoleStatus,
  dataScope,
  delRole,
  getRole,
  listRole,
  updateRole,
  deptTreeSelect
} from '@/api/system/role'
import { roleMenuTreeselect, treeselect as menuTreeselect } from '@/api/system/menu'
import type { SysRole, RoleQueryParams } from '@/types/api/system/role'
import type { TreeSelect, TableShowColumns } from '@/types/api/common'
import type { RoleDeptTreeResult } from '@/types/api/system/role'
import type { RoleMenuTreeselectResult } from '@/types/api/system/menu'
import type { TreeInstance } from 'element-plus'
import useSettingsStore from '@/store/modules/settings'
import { useCrudTable } from '@/composables/useCrudTable'
import modal from '@/plugins/modal'
import { addDateRange } from '@/utils/stepby'

const router = useRouter()
const { t } = useI18n()
const roleRefRef = useTemplateRef('roleRef')
const queryRefRef = useTemplateRef('queryRef')
const { sys_normal_disable } = useDict('sys_normal_disable')

// UX-7：列显隐偏好持久化（与用户管理页同一模式：RightToolbar 面板 + userPrefs 存储）
const settingsStore = useSettingsStore()
const ROLE_TABLE_KEY = 'system:role'
const columns = ref<Record<string, TableShowColumns>>({
  roleName: { label: t('role.column.roleName'), visible: true },
  roleKey: { label: t('role.column.roleKey'), visible: true },
  roleSort: { label: t('role.column.sort'), visible: true },
  status: { label: t('role.column.status'), visible: true },
  createTime: { label: t('role.column.createTime'), visible: true }
})
const savedRoleColumns = settingsStore.userPrefs.tableColumns?.[ROLE_TABLE_KEY]
if (savedRoleColumns?.length) {
  for (const key of Object.keys(columns.value)) {
    columns.value[key].visible = savedRoleColumns.includes(key)
  }
}
watch(
  columns,
  (v: Record<string, TableShowColumns>) => {
    const visible = Object.keys(v).filter((k) => v[k].visible)
    settingsStore.updateUserPrefs({
      tableColumns: { ...settingsStore.userPrefs.tableColumns, [ROLE_TABLE_KEY]: visible }
    })
  },
  { deep: true }
)

const dateRange = ref<string[]>([])
const menuOptions = ref<TreeSelect[]>([])
const menuExpand = ref<boolean>(false)
const menuNodeAll = ref<boolean>(false)
const deptExpand = ref<boolean>(true)
const deptNodeAll = ref<boolean>(false)
const deptOptions = ref<TreeSelect[]>([])
const openDataScope = ref<boolean>(false)
// P1 修复: 数据权限提交按钮独立 loading，避免与 submitLoading（角色 CRUD）混淆
// 防止用户重复点击导致重复提交
const dataScopeLoading = ref<boolean>(false)
const menuRef = useTemplateRef<TreeInstance>('menuRef')
const deptRef = useTemplateRef<TreeInstance>('deptRef')

/** 数据范围选项 - M1: 使用 computed 响应语言切换 */
const dataScopeOptions = computed(() => [
  { value: '1', label: t('role.dataScopeOptions.all') },
  { value: '2', label: t('role.dataScopeOptions.custom') },
  { value: '3', label: t('role.dataScopeOptions.dept') },
  { value: '4', label: t('role.dataScopeOptions.deptAndBelow') },
  { value: '5', label: t('role.dataScopeOptions.self') }
])

const data = reactive({
  form: {} as SysRole,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    roleName: undefined,
    roleKey: undefined,
    status: undefined
  } as RoleQueryParams
})

// M1: rules 改为 computed 以响应语言切换；el-form 通过 :rules 绑定读取最新值，validate 仍可正常工作
const rules = computed(() => ({
  roleName: [{ required: true, message: t('role.validate.roleNameRequired'), trigger: 'blur' }],
  roleKey: [{ required: true, message: t('role.validate.roleKeyRequired'), trigger: 'blur' }],
  roleSort: [{ required: true, message: t('role.validate.roleSortRequired'), trigger: 'blur' }]
}))

const { queryParams, form } = toRefs(data)

// TierA-4: 是否有查询条件（用于空状态 CTA 切换文案）
const hasQueryFilter = computed(() => {
  const q = queryParams.value
  return !!(q.roleName || q.roleKey || q.status)
})

const {
  dataList,
  open,
  loading,
  submitLoading,
  showSearch,
  ids,
  single,
  multiple,
  total,
  title,
  getList,
  beforeDialogClose,
  handleQuery,
  handleSelectionChange,
  handleDelete,
  handleExport
} = useCrudTable<SysRole, RoleQueryParams>({
  listApi: (params) => listRole(addDateRange(params as Record<string, unknown>, dateRange.value) as RoleQueryParams),
  getApi: getRole,
  addApi: addRole,
  updateApi: updateRole,
  deleteApi: delRole,
  idField: 'roleId',
  exportUrl: '/system/role/export',
  defaultForm: () => ({
    roleId: undefined,
    roleName: undefined,
    roleKey: undefined,
    roleSort: 0,
    status: '0',
    menuIds: [],
    deptIds: [],
    menuCheckStrictly: true,
    deptCheckStrictly: true,
    remark: undefined
  }),
  titleKey: 'role.title',
  deleteTipKey: 'common.confirmDelete',
  queryParams,
  form,
  formRef: roleRefRef,
  queryRef: queryRefRef
})

/** 重置按钮操作 - 覆盖以清空 dateRange */
function resetQuery() {
  dateRange.value = []
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 角色状态修改 */
function handleStatusChange(row: SysRole) {
  const text = row.status === '0' ? t('common.enabled') : t('common.disabled')
  modal
    .confirm(t('role.tip.confirmStatusChange', { text, name: row.roleName }))
    .then(function () {
      return changeRoleStatus(row.roleId!, row.status!)
    })
    .then(() => {
      modal.msgSuccess(t('common.success'))
    })
    .catch(function () {
      row.status = row.status === '0' ? '1' : '0'
    })
}

/** 分配用户 */
function handleAuthUser(row: SysRole) {
  router.push('/system/role-auth/user/' + row.roleId)
}

/** 查询菜单树结构 */
function getMenuTreeselect() {
  menuTreeselect()
    .then((response) => {
      menuOptions.value = response.data
    })
    .catch(() => {})
}

/** 所有部门节点数据 */
function getDeptAllCheckedKeys(): number[] {
  // 目前被选中的部门节点
  const checkedKeys = deptRef.value?.getCheckedKeys() ?? []
  // 半选中的部门节点
  const halfCheckedKeys = deptRef.value?.getHalfCheckedKeys() ?? []
  // L3: 使用 spread 替代 unshift.apply 老式写法
  checkedKeys.unshift(...halfCheckedKeys)
  return checkedKeys
}

/** 重置新增的表单以及其他数据  */
function reset() {
  if (menuRef.value != undefined) {
    menuRef.value?.setCheckedKeys([])
  }
  menuExpand.value = false
  menuNodeAll.value = false
  deptExpand.value = true
  deptNodeAll.value = false
  form.value = {
    roleId: undefined,
    roleName: undefined,
    roleKey: undefined,
    roleSort: 0,
    status: '0',
    menuIds: [],
    deptIds: [],
    menuCheckStrictly: true,
    deptCheckStrictly: true,
    remark: undefined
  }
  roleRefRef.value?.resetFields()
}

/** 添加角色 */
function handleAdd() {
  reset()
  getMenuTreeselect()
  open.value = true
  title.value = t('common.add')
}

/** 修改角色 */
// M5: 用 async/await + Promise.all 重构嵌套 then + nextTick，提升可读性
async function handleUpdate(row?: SysRole) {
  reset()
  const roleId = row?.roleId || ids.value[0]
  try {
    const [roleRes, menuRes] = await Promise.all([getRole(roleId), getRoleMenuTreeselect(roleId)])
    form.value = roleRes.data!
    form.value.roleSort = Number(form.value.roleSort)
    open.value = true
    title.value = t('common.edit')
    await nextTick()
    // 等待 el-tree 渲染完成后统一设置选中节点
    for (const v of menuRes.checkedKeys) {
      menuRef.value?.setChecked(v, true, false)
    }
  } catch {
    // API 错误由 request.ts 全局拦截器处理（ElMessage 提示）
  }
}

/** 根据角色ID查询菜单树结构 */
function getRoleMenuTreeselect(roleId: number): Promise<RoleMenuTreeselectResult> {
  // 修复 P0：原 `.catch(() => {}) as Promise<...>` 在失败时返回 undefined，
  // 下游 `response.menus` 解构会抛 TypeError。现返回空对象兜底，保持类型安全。
  return roleMenuTreeselect(roleId)
    .then((response) => {
      menuOptions.value = response.menus
      return response
    })
    .catch(() => ({ menus: [], checkedKeys: [] })) as Promise<RoleMenuTreeselectResult>
}

/** 根据角色ID查询部门树结构 */
function getDeptTree(roleId: number): Promise<RoleDeptTreeResult> {
  // 修复 P0：同上，原 `.catch(() => {}) as Promise<...>` 失败时返回 undefined。
  return deptTreeSelect(roleId)
    .then((response) => {
      deptOptions.value = response.depts
      return response
    })
    .catch(() => ({ depts: [], checkedKeys: [] })) as Promise<RoleDeptTreeResult>
}

/** 树权限（展开/折叠）*/
function handleCheckedTreeExpand(value: boolean, type: string) {
  if (type == 'menu') {
    // H4: 改用公共 getNode API 替代 store.nodesMap 私有 API，避免依赖内部实现
    for (const node of menuOptions.value) {
      const treeNode = menuRef.value?.getNode(node.id)
      if (treeNode) {
        treeNode.expanded = value
      }
    }
  } else if (type == 'dept') {
    for (const node of deptOptions.value) {
      const treeNode = deptRef.value?.getNode(node.id)
      if (treeNode) {
        treeNode.expanded = value
      }
    }
  }
}

/** 树权限（全选/全不选） */
function handleCheckedTreeNodeAll(value: boolean, type: string) {
  if (type == 'menu') {
    menuRef.value?.setCheckedNodes(value ? menuOptions.value : [])
  } else if (type == 'dept') {
    deptRef.value?.setCheckedNodes(value ? deptOptions.value : [])
  }
}

/** 树权限（父子联动） */
function handleCheckedTreeConnect(value: boolean, type: string) {
  if (type == 'menu') {
    form.value.menuCheckStrictly = value
  } else if (type == 'dept') {
    form.value.deptCheckStrictly = value
  }
}

/** 所有菜单节点数据 */
function getMenuAllCheckedKeys(): number[] {
  // 目前被选中的菜单节点
  const checkedKeys = menuRef.value?.getCheckedKeys() ?? []
  // 半选中的菜单节点
  const halfCheckedKeys = menuRef.value?.getHalfCheckedKeys() ?? []
  // L3: 使用 spread 替代 unshift.apply 老式写法
  checkedKeys.unshift(...halfCheckedKeys)
  return checkedKeys
}

/** 提交按钮 */
function submitForm() {
  roleRefRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      if (form.value.roleId != undefined) {
        form.value.menuIds = getMenuAllCheckedKeys()
        updateRole(form.value)
          .then(() => {
            modal.msgSuccess(t('common.editSuccess'))
            open.value = false
            getList()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      } else {
        form.value.menuIds = getMenuAllCheckedKeys()
        addRole(form.value)
          .then(() => {
            modal.msgSuccess(t('common.addSuccess'))
            open.value = false
            getList()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      }
    }
  })
}

/** 取消按钮 */
function cancel() {
  open.value = false
  reset()
}

/** 选择角色权限范围触发 */
// L9: 移除未使用的 value 参数，直接读取 v-model 绑定的 form.value.dataScope
function dataScopeSelectChange() {
  if (form.value.dataScope !== '2') {
    deptRef.value?.setCheckedKeys([])
  }
}

/** 分配数据权限操作 */
function handleDataScope(row: SysRole) {
  reset()
  const deptTreeSelect = getDeptTree(row.roleId!)
  getRole(row.roleId!)
    .then((response) => {
      form.value = response.data!
      openDataScope.value = true
      nextTick(() => {
        deptTreeSelect
          .then((res) => {
            nextTick(() => {
              if (deptRef.value) {
                deptRef.value?.setCheckedKeys(res.checkedKeys)
              }
            })
          })
          .catch(() => {})
      })
    })
    .catch(() => {})
  title.value = t('role.form.deptTree')
}

/** 提交按钮（数据权限） */
function submitDataScope() {
  if (form.value.roleId != undefined) {
    dataScopeLoading.value = true
    form.value.deptIds = getDeptAllCheckedKeys()
    // P1 修复: 增加 loading 绑定 + catch 错误处理 + finally 重置 loading
    // 避免重复提交，且 API 失败时不关闭对话框（让用户能修改后重试）
    dataScope(form.value)
      .then(() => {
        modal.msgSuccess(t('common.editSuccess'))
        openDataScope.value = false
        getList()
      })
      .catch(() => {})
      .finally(() => {
        dataScopeLoading.value = false
      })
  }
}

/** 取消按钮（数据权限）*/
function cancelDataScope() {
  openDataScope.value = false
  reset()
}

getList()
</script>
