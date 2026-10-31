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
            :aria-label="t('role.search.phRoleName')"
          />
        </el-form-item>
        <el-form-item :label="t('role.search.roleKey')" prop="roleKey">
          <el-input
            v-model="queryParams.roleKey"
            :placeholder="t('role.search.phRoleKey')"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
            :aria-label="t('role.search.phRoleKey')"
          />
        </el-form-item>
        <el-form-item :label="t('role.search.status')" prop="status">
          <el-select
            :aria-label="t('role.search.status')"
            v-model="queryParams.status"
            :placeholder="t('role.search.phStatus')"
            clearable
            class="w-[240px]"
          >
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
            :aria-label="t('common.form.startDate')"
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
        ref="roleTableRef"
        v-loading="loading"
        :data="dataList"
        :row-key="(row: SysRole) => row.roleId"
        @selection-change="handleSelectionChange"
        @sort-change="handleSortChange"
        :default-sort="sortArrow"
      >
        <el-table-column type="selection" width="55" align="center" />
        <el-table-column
          :label="t('role.column.id')"
          prop="roleId"
          width="80"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('role.column.roleName')"
          prop="roleName"
          show-overflow-tooltip
          width="150"
          v-if="columns.roleName.visible"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('role.column.roleKey')"
          prop="roleKey"
          show-overflow-tooltip
          width="150"
          v-if="columns.roleKey.visible"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('role.column.sort')"
          prop="roleSort"
          width="100"
          v-if="columns.roleSort.visible"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        />
        <el-table-column
          :label="t('role.column.status')"
          align="center"
          prop="status"
          width="100"
          v-if="columns.status.visible"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <el-switch
              :aria-label="`${scope.row.roleName} ${t('role.column.status')}`"
              v-hasPermi="['system:role:edit']"
              v-model="scope.row.status"
              :loading="statusLoadingIds.includes(scope.row.roleId!)"
              active-value="0"
              inactive-value="1"
              @change="handleStatusChange(scope.row)"
            ></el-switch>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('role.column.createTime')"
          align="center"
          prop="createTime"
          sortable="custom"
          :sort-orders="['descending', 'ascending']"
        >
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('common.column.operation')"
          align="center"
          width="220"
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
            <!-- M3 字段级权限：打开该角色的字段授权矩阵（独立读权限位）。
                 v-if 额外消费后端 showFieldPerm（getInfo 下发，与矩阵接口开关链同源）：
                 平台开关或租户能力位关闭时矩阵接口 403，按钮必须同步隐藏（防假入口）。 -->
            <el-tooltip
              :content="t('role.fieldPerm.title')"
              placement="top"
              v-if="scope.row.roleId !== 1 && userStore.showFieldPerm"
            >
              <el-button
                link
                type="primary"
                icon="Hide"
                :aria-label="t('role.fieldPerm.title')"
                @click="handleFieldPerm(scope.row)"
                v-hasPermi="['system:role:fieldPerm']"
              ></el-button>
            </el-tooltip>
          </template>
        </el-table-column>
        <template #empty>
          <!-- 失败/空态分形（ListEmpty 单一实现）：加载失败显示「重试」，成功无数据保留原 CTA 空态 -->
          <list-empty :load-error="loadError" @retry="retryLoad">
            <EmptyState
              :description="t('common.noData')"
              :action-text="hasQueryFilter ? t('common.emptyActionReset') : t('common.emptyActionCreate')"
              :action-icon="hasQueryFilter ? 'RefreshLeft' : 'Plus'"
              :show-reset="hasQueryFilter"
              :reset-text="t('common.emptyActionReset')"
              @action="hasQueryFilter ? resetQuery() : handleAdd()"
              @reset="resetQuery"
            />
          </list-empty>
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
    <el-dialog
      :title="title"
      :before-close="beforeDialogClose"
      v-model="open"
      width="min(90%, 500px)"
      append-to-body
      destroy-on-close
    >
      <el-form ref="roleRef" :model="form" :rules="rules" label-width="100px">
        <el-form-item :label="t('role.form.roleName')" prop="roleName">
          <el-input
            v-model.trim="form.roleName"
            :placeholder="t('role.search.phRoleName')"
            :aria-label="t('role.search.phRoleName')"
          />
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
          <el-input
            v-model="form.roleKey"
            :placeholder="t('role.search.phRoleKey')"
            :maxlength="100"
            show-word-limit
            :aria-label="t('role.search.phRoleKey')"
          />
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
            :empty-text="t('common.noData')"
            :props="{ label: 'label', children: 'children' }"
          ></el-tree>
        </el-form-item>
        <el-form-item :label="t('role.form.remark')">
          <el-input
            v-model="form.remark"
            type="textarea"
            :placeholder="t('common.form.inputPlaceholder')"
            :aria-label="t('role.form.remark')"
          ></el-input>
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
    <data-scope-dialog
      v-model:open="openDataScope"
      :title="title"
      :form="form"
      :dept-options="deptOptions"
      :tree-loaded="deptTreeLoaded"
      @success="getList"
      @cancel="reset"
      ref="dataScopeRef"
    />

    <!-- M3 字段级权限：角色字段授权矩阵对话框（首期 tableKey 固定 sys_user，tableKey 参数已预留多表） -->
    <el-dialog
      :title="`${t('role.fieldPerm.title')} - ${fieldPermRole?.roleName ?? ''}`"
      v-model="openFieldPerm"
      :before-close="beforeFieldPermClose"
      width="min(90%, 560px)"
      append-to-body
      destroy-on-close
    >
      <el-table v-loading="fieldPermLoading" :data="fieldPermFields" :empty-text="t('common.noData')">
        <el-table-column :label="t('role.fieldPerm.colFieldName')" min-width="140">
          <template #default="scope">
            <span>{{ t(scope.row.labelKey) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('role.fieldPerm.colFieldKey')"
          prop="fieldKey"
          min-width="130"
          show-overflow-tooltip
        />
        <el-table-column :label="t('role.fieldPerm.colHidden')" align="center" width="90">
          <template #default="scope">
            <!-- 勾选 = 对该角色隐藏该字段 -->
            <el-checkbox
              :model-value="fieldPermChecked[scope.row.fieldKey] ?? false"
              :aria-label="`${t(scope.row.labelKey)} ${t('role.fieldPerm.colHidden')}`"
              @change="handleFieldPermCheck(scope.row.fieldKey, $event)"
            />
          </template>
        </el-table-column>
      </el-table>
      <div class="mt-2 text-xs text-text-secondary">
        {{ t('role.fieldPerm.tipHidden', { table: fieldPermTableKey }) }}
      </div>
      <template #footer>
        <div class="dialog-footer">
          <el-button type="primary" :loading="fieldPermSaving" @click="submitFieldPerm">
            {{ t('common.confirm') }}
          </el-button>
          <el-button @click="cancelFieldPerm">{{ t('common.cancel') }}</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts" name="Role">
import { applySortChange } from '@/utils/sortDirection'
import { useSortArrow } from '@/composables/useSortArrow'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import DataScopeDialog from './DataScopeDialog.vue'
import { addRole, changeRoleStatus, delRole, getRole, listRole, updateRole, deptTreeSelect } from '@/api/system/role'
import { roleMenuTreeselect, treeselect as menuTreeselect } from '@/api/system/menu'
import { getFieldPerm, saveFieldPerm } from '@/api/system/fieldPerm'
import { FIELD_PERM_TABLES, toCheckedMap, buildHiddenFields } from '@/utils/fieldPerm'
import type { SysRole, RoleQueryParams } from '@/types/api/system/role'
import type { FieldPermFieldDef } from '@/utils/fieldPerm'
import type { TreeSelect, TableShowColumns } from '@/types/api/common'
import type { RoleDeptTreeResult } from '@/types/api/system/role'
import type { RoleMenuTreeselectResult } from '@/types/api/system/menu'
import type { TreeInstance } from 'element-plus'
import useUserStore from '@/store/modules/user'
import { resetQueryDefaults, useCrudTable } from '@/composables/useCrudTable'
import { useColumnPreferences } from '@/composables/useColumnPreferences'
import { useMobileFilter } from '@/composables/useMobileFilter'
import { useRowActionGuard } from '@/composables/useRowActionGuard'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import modal from '@/plugins/modal'
import { addDateRange } from '@/utils/stepby'

const router = useRouter()
const { t } = useI18n()
const userStore = useUserStore()
const roleRefRef = useTemplateRef('roleRef')
const queryRefRef = useTemplateRef('queryRef')
const roleTableRef = useTemplateRef('roleTableRef')
const { sys_normal_disable } = useDict('sys_normal_disable')

// UX-7：列显隐偏好持久化（与用户管理页同一模式：RightToolbar 面板 + userPrefs 存储）
// 读写 glue 收敛到 useColumnPreferences（合并写，避免覆盖其它页面偏好）
const ROLE_TABLE_KEY = 'system:role'
const columnPrefs = useColumnPreferences(ROLE_TABLE_KEY)
const columns = ref<Record<string, TableShowColumns>>({
  roleName: { label: t('role.column.roleName'), visible: true },
  roleKey: { label: t('role.column.roleKey'), visible: true },
  roleSort: { label: t('role.column.sort'), visible: true },
  status: { label: t('role.column.status'), visible: true },
  createTime: { label: t('role.column.createTime'), visible: true }
})
columnPrefs.applyTo(columns)
columnPrefs.watchColumns(columns)

const dateRange = ref<string[]>([])
const menuOptions = ref<TreeSelect[]>([])
const menuExpand = ref<boolean>(false)
const menuNodeAll = ref<boolean>(false)
const deptOptions = ref<TreeSelect[]>([])
// 授权树"读成功"的闸：保存前必须为真（b133——读失败时不得把空树当成"没有授权"保存）
const menuTreeLoaded = ref<boolean>(false)
const deptTreeLoaded = ref<boolean>(false)
const openDataScope = ref<boolean>(false)
const menuRef = useTemplateRef<TreeInstance>('menuRef')
const dataScopeRef = useTemplateRef<InstanceType<typeof DataScopeDialog>>('dataScopeRef')

const data = reactive({
  form: {} as SysRole,
  queryParams: {
    pageNum: 1,
    pageSize: 10,
    roleName: undefined,
    roleKey: undefined,
    status: undefined,
    orderByColumn: undefined,
    isAsc: undefined
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
  loadError,
  retryLoad,
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

// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter

/** 重置按钮操作 - 覆盖以清空 dateRange */
function resetQuery() {
  dateRange.value = []
  queryParams.value.orderByColumn = undefined
  queryParams.value.isAsc = undefined
  queryRefRef.value?.resetFields()
  // 批六十四修复（F137⑤ 实证）：EP form-item initialValue 被「URL 同步 + fullPath 重挂载」
  // 污染为搜索值，resetFields 只会“重置回搜索值”——必须显式恢复页面定义的干净默认快照
  resetQueryDefaults(queryParams)
  handleQuery()
  roleTableRef.value?.clearSort()
}

/** 箭头由页面实际下发的排序参数派生（成因见 composables/useSortArrow） */
const sortArrow = useSortArrow(queryParams)

/** 排序触发事件（服务端排序：透传 orderByColumn/isAsc，仅白名单列可触发） */
function handleSortChange(column: { prop: string | null; order: string | null }) {
  applySortChange(queryParams.value, column)
  getList()
}

/** 角色状态修改 */
/**
 * 启停切换（**行级**互斥 + 在途态，b106）：`v-model` 乐观更新，被挡掉/取消/失败三出口都回滚。
 * 原实现连点会叠确认框并发出两次状态请求，返回顺序不定 ⇒ 界面终态可反于服务端。
 */
const { runningIds: statusLoadingIds, guarded } = useRowActionGuard<number>()

async function handleStatusChange(row: SysRole): Promise<void> {
  const oldVal = row.status === '0' ? '1' : '0'
  const text = row.status === '0' ? t('common.enabled') : t('common.disabled')
  const executed = await guarded(
    row.roleId!,
    () => modal.confirm(t('role.tip.confirmStatusChange', { text, name: row.roleName })),
    async () => {
      try {
        await changeRoleStatus(row.roleId!, row.status!)
        modal.msgSuccess(t('common.success'))
      } catch (e) {
        row.status = oldVal
        throw e
      }
    }
  )
  if (!executed) row.status = oldVal
}

/** 分配用户 */
function handleAuthUser(row: SysRole) {
  router.push('/system/role-auth/user/' + row.roleId)
}

/**
 * 查询菜单树结构（新增角色用）。
 *
 * 返回值是"这棵树到底加载成功没有"——失败时**不得**把空数组当成"该角色没有任何菜单"，
 * 否则新增对话框在空树上勾不出任何节点，保存出来的角色就是无授权角色（b133）。
 */
async function getMenuTreeselect(): Promise<boolean> {
  try {
    const response = await menuTreeselect()
    menuOptions.value = response.data
    menuTreeLoaded.value = true
    return true
  } catch {
    // 拦截器已提示；清空并标记未就绪，由调用方决定"不开对话框"
    menuOptions.value = []
    menuTreeLoaded.value = false
    return false
  }
}

/** 重置新增的表单以及其他数据  */
function reset() {
  if (menuRef.value != undefined) {
    menuRef.value?.setCheckedKeys([])
  }
  menuExpand.value = false
  menuNodeAll.value = false
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
async function handleAdd() {
  reset()
  // 树没加载成功就不开对话框：空树 + 保存 = 创建出一个没有任何菜单授权的角色
  if (!(await getMenuTreeselect())) return
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
    // 菜单树没拿到就不开对话框（b133）：空树 + 保存会把该角色的 menuIds 写成 []，
    // 一次加载失败就静默清空全部菜单授权——失败必须是失败，不能变成一次破坏性写入。
    if (!menuRes) return
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

/**
 * 根据角色ID查询菜单树结构。
 * 失败返回 `null`（而不是空对象兜底）：调用方据此**不打开对话框**，
 * 从结构上杜绝"空树 ⇒ 保存清空授权"（b133）。
 */
async function getRoleMenuTreeselect(roleId: number): Promise<RoleMenuTreeselectResult | null> {
  try {
    const response = await roleMenuTreeselect(roleId)
    menuOptions.value = response.menus
    menuTreeLoaded.value = true
    return response
  } catch {
    menuOptions.value = []
    menuTreeLoaded.value = false
    return null
  }
}

/**
 * 根据角色ID查询部门树结构。
 * 同 `getRoleMenuTreeselect`：失败返回 `null`，数据权限对话框不得在空树上打开。
 */
async function getDeptTree(roleId: number): Promise<RoleDeptTreeResult | null> {
  try {
    const response = await deptTreeSelect(roleId)
    deptOptions.value = response.depts
    deptTreeLoaded.value = true
    return response
  } catch {
    deptOptions.value = []
    deptTreeLoaded.value = false
    return null
  }
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
  }
}

/** 树权限（全选/全不选） */
function handleCheckedTreeNodeAll(value: boolean, type: string) {
  if (type == 'menu') {
    menuRef.value?.setCheckedNodes(value ? menuOptions.value : [])
  }
}

/** 树权限（父子联动） */
function handleCheckedTreeConnect(value: boolean, type: string) {
  if (type == 'menu') {
    form.value.menuCheckStrictly = value
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
      // 纵深防御（b133）：即便某个入口在树未就绪时把对话框打开了，也不许把空树写进数据库
      if (!menuTreeLoaded.value) {
        modal.msgError(t('role.tip.treeNotLoaded'))
        return
      }
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

/** 分配数据权限操作 */
async function handleDataScope(row: SysRole) {
  reset()
  // 两路都拿到才开对话框（b133）：部门树失败时若照开，屏幕上是一棵空树，
  // 点确定就会把该角色的 deptIds 覆盖成空——读失败变成了写破坏。
  try {
    const [roleRes, treeRes] = await Promise.all([getRole(row.roleId!), getDeptTree(row.roleId!)])
    if (!treeRes) return
    form.value = roleRes.data!
    title.value = t('role.form.deptTree')
    openDataScope.value = true
    await nextTick()
    dataScopeRef.value?.setCheckedKeys(treeRes.checkedKeys)
  } catch {
    // 角色详情请求失败：拦截器已提示，不打开对话框（拒绝不得逸出事件处理器）
  }
}

// ===== M3 字段级权限：角色字段授权矩阵 =====
// 首期 tableKey 固定 sys_user；结构上保留 tableKey 参数，后续多表只需加切换 UI
const FIELD_PERM_TABLE_KEY = 'sys_user'
const fieldPermTableKey = FIELD_PERM_TABLE_KEY
/** 矩阵对话框可见性 */
const openFieldPerm = ref<boolean>(false)
/** 矩阵加载态 */
const fieldPermLoading = ref<boolean>(false)
/** 保存按钮独立 loading，防重复提交 */
const fieldPermSaving = ref<boolean>(false)
/** 当前操作的目标角色（矩阵标题 + 保存参数） */
const fieldPermRole = ref<SysRole | undefined>(undefined)
/** 勾选状态映射（fieldKey → 是否勾选隐藏），来自后端 hidden 态初始化 */
const fieldPermChecked = ref<Record<string, boolean>>({})
/** 白名单字段定义（fieldKey + 中文名 i18n key），首期固定 sys_user */
const fieldPermFields = computed<FieldPermFieldDef[]>(() => FIELD_PERM_TABLES[fieldPermTableKey] ?? [])

// 关闭语义（b135）：矩阵勾选改了一半按 Esc / 点遮罩 / 点 × 原先会静默丢弃
const {
  snapshot: snapshotFieldPerm,
  beforeClose: beforeFieldPermClose,
  cancel: cancelFieldPerm
} = useDialogDirtyGuard(openFieldPerm, () => fieldPermChecked.value)

/** 打开字段权限矩阵：加载该角色当前隐藏态（开关未开启时接口报业务错误，由全局拦截器提示） */
function handleFieldPerm(row: SysRole) {
  fieldPermRole.value = row
  fieldPermChecked.value = {}
  openFieldPerm.value = true
  fieldPermLoading.value = true
  getFieldPerm(row.roleId!, fieldPermTableKey)
    .then((res) => {
      fieldPermChecked.value = toCheckedMap(res.data?.fields)
      // 后端隐藏态是"打开时用户看到的值"的基准：不回填基准的话，载入完成即被判成脏
      snapshotFieldPerm()
    })
    .catch(() => {
      // 失败（含"字段级权限未启用"）时关闭对话框，避免在空矩阵上误保存；错误提示由拦截器完成
      openFieldPerm.value = false
    })
    .finally(() => {
      fieldPermLoading.value = false
    })
}

/** 矩阵勾选变更（el-checkbox change 事件转发；勾选 = 隐藏） */
function handleFieldPermCheck(fieldKey: string, val: unknown) {
  fieldPermChecked.value[fieldKey] = val === true
}

/** 保存字段权限：全量覆盖，二次确认影响范围（该角色所有用户的列表可见性） */
function submitFieldPerm() {
  const roleId = fieldPermRole.value?.roleId
  if (roleId == undefined) return
  const hiddenFields = buildHiddenFields(
    fieldPermFields.value.map((f: FieldPermFieldDef) => f.fieldKey),
    fieldPermChecked.value
  )
  modal
    .confirm(t('role.fieldPerm.confirmSave'))
    .then(() => {
      fieldPermSaving.value = true
      saveFieldPerm(roleId, fieldPermTableKey, { hiddenFields })
        .then(() => {
          modal.msgSuccess(t('role.fieldPerm.saveSuccess'))
          openFieldPerm.value = false
        })
        .catch(() => {}) // 保存失败由全局拦截器提示，保持对话框打开可重试
        .finally(() => {
          fieldPermSaving.value = false
        })
    })
    .catch(() => {}) // 用户取消二次确认
}

getList()
</script>
