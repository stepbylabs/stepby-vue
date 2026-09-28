<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch">
        <el-form-item :label="t('dept.search.deptName')" prop="deptName">
          <el-input
            v-model="queryParams.deptName"
            :placeholder="t('dept.search.phDeptName')"
            clearable
            class="w-[200px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('dept.search.status')" prop="status">
          <el-select v-model="queryParams.status" :placeholder="t('dept.search.status')" clearable class="w-[200px]">
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
        <el-button type="primary" plain icon="Plus" @click="handleAdd" v-hasPermi="['system:dept:add']">
          {{ t('common.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="warning"
          plain
          icon="Check"
          :loading="sortLoading"
          @click="handleSaveSort"
          v-hasPermi="['system:dept:edit']"
        >
          {{ t('common.save') }}{{ t('dept.column.order') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="info" plain icon="Sort" @click="toggleExpandAll">
          {{ t('common.expand') }}/{{ t('common.collapse') }}
        </el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-if="refreshTable"
      v-loading="loading"
      :data="deptList"
      row-key="deptId"
      :default-expand-all="isExpandAll"
      :tree-props="{ children: 'children', hasChildren: 'hasChildren' }"
    >
      <el-table-column prop="deptName" :label="t('dept.column.name')" width="260"></el-table-column>
      <el-table-column prop="orderNum" :label="t('dept.column.order')" width="120">
        <template #default="scope">
          <el-input-number v-model="scope.row.orderNum" controls-position="right" :min="0" class="w-[88px]" />
        </template>
      </el-table-column>
      <el-table-column prop="status" :label="t('common.column.status')" width="100">
        <template #default="scope">
          <dict-tag :options="sys_normal_disable" :value="scope.row.status" />
        </template>
      </el-table-column>
      <el-table-column :label="t('common.column.createTime')" align="center" prop="createTime" width="200">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
      <el-table-column :label="t('common.column.operation')" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button link type="primary" icon="Edit" @click="handleUpdate(scope.row)" v-hasPermi="['system:dept:edit']">
            {{ t('common.edit') }}
          </el-button>
          <el-button link type="primary" icon="Plus" @click="handleAdd(scope.row)" v-hasPermi="['system:dept:add']">
            {{ t('common.add') }}
          </el-button>
          <el-button
            v-if="scope.row.parentId !== 0"
            link
            type="primary"
            icon="Delete"
            @click="handleDelete(scope.row)"
            v-hasPermi="['system:dept:remove']"
          >
            {{ t('common.delete') }}
          </el-button>
        </template>
      </el-table-column>
      <template #empty>
        <el-empty :description="t('common.empty')" />
      </template>
    </el-table>

    <!-- 添加或修改部门对话框 -->
    <el-dialog :title="title" v-model="open" width="min(90%, 600px)" append-to-body destroy-on-close>
      <el-form ref="deptRef" :model="form" :rules="rules" label-width="80px">
        <el-row>
          <Transition name="expand-fade">
            <el-col :span="24" v-if="form.parentId !== 0">
              <el-form-item :label="t('dept.form.parentDept')" prop="parentId">
                <el-tree-select
                  v-model="form.parentId"
                  :data="deptOptions"
                  :props="{ value: 'deptId', label: 'deptName', children: 'children' }"
                  value-key="deptId"
                  :placeholder="t('dept.form.parentDept')"
                  check-strictly
                />
              </el-form-item>
            </el-col>
          </Transition>
          <el-col :span="12">
            <el-form-item :label="t('dept.form.deptName')" prop="deptName">
              <el-input
                v-model.trim="form.deptName"
                :placeholder="t('dept.search.phDeptName')"
                :maxlength="30"
                show-word-limit
              />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('dept.form.order')" prop="orderNum">
              <el-input-number v-model="form.orderNum" controls-position="right" :min="0" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('dept.form.leader')" prop="leader">
              <el-input v-model="form.leader" :placeholder="t('dept.form.leader')" maxlength="20" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('dept.form.phone')" prop="phone">
              <el-input v-model="form.phone" :placeholder="t('dept.form.phone')" maxlength="11" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('dept.form.email')" prop="email">
              <el-input v-model="form.email" :placeholder="t('dept.form.email')" maxlength="50" />
            </el-form-item>
          </el-col>
          <el-col :span="12">
            <el-form-item :label="t('dept.form.status')">
              <el-radio-group v-model="form.status">
                <el-radio v-for="dict in sys_normal_disable" :key="dict.value" :value="dict.value">
                  {{ dict.label }}
                </el-radio>
              </el-radio-group>
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
  </div>
</template>

<script setup lang="ts" name="Dept">
import {
  listDept,
  getDept,
  delDept,
  addDept,
  updateDept,
  updateDeptSort,
  listDeptExcludeChild
} from '@/api/system/dept'
import { refreshDeptTreeSelect } from '@/api/system/user'
import type { SysDept, DeptQueryParams } from '@/types/api/system/dept'
import type { TreeSelect } from '@/types/api/common'
import modal from '@/plugins/modal'
import { handleTree } from '@/utils/stepby'
import { useTreeTableSort } from '@/composables/useTreeTableSort'

const { t } = useI18n()
const deptRefRef = useTemplateRef('deptRef')
const queryRefRef = useTemplateRef('queryRef')
const { sys_normal_disable } = useDict('sys_normal_disable')

const deptList = ref<SysDept[]>([])
const open = ref<boolean>(false)
const loading = ref<boolean>(true)
const submitLoading = ref<boolean>(false)
const showSearch = ref<boolean>(true)
const title = ref<string>('')
const deptOptions = ref<TreeSelect[]>([])

const { isExpandAll, refreshTable, toggleExpandAll, recordOriginalOrders, sortLoading, handleSaveSort } =
  useTreeTableSort<SysDept>({
    listRef: deptList,
    idField: 'deptId',
    sortApi: (p) => updateDeptSort({ deptIds: p.ids, orderNums: p.orderNums }),
    noSortChangeKey: 'dept.tip.noSortChange',
    sortSavedKey: 'dept.tip.sortSaved',
    defaultExpand: true
  })

const data = reactive({
  form: {} as SysDept,
  queryParams: {
    deptName: undefined,
    status: undefined
  } as DeptQueryParams,
  rules: {
    parentId: [{ required: true, message: t('dept.validate.parentDeptRequired'), trigger: 'blur' }],
    deptName: [{ required: true, message: t('dept.validate.deptNameRequired'), trigger: 'blur' }],
    orderNum: [{ required: true, message: t('dept.validate.orderNumRequired'), trigger: 'blur' }],
    email: [{ type: 'email', message: t('dept.validate.emailFormat'), trigger: ['blur', 'change'] }],
    phone: [{ pattern: /^1[3|4|5|6|7|8|9][0-9]\d{8}$/, message: t('dept.validate.phoneFormat'), trigger: 'blur' }]
  }
})

const { queryParams, form, rules } = toRefs(data)

/** 查询部门列表 */
function getList() {
  loading.value = true
  listDept(queryParams.value)
    .then((response) => {
      deptList.value = handleTree(response.data!, 'deptId')
      recordOriginalOrders(deptList.value)
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

/** 取消按钮 */
function cancel() {
  open.value = false
  reset()
}

/** 表单重置 */
function reset() {
  form.value = {
    deptId: undefined,
    parentId: 0,
    deptName: undefined,
    orderNum: 0,
    leader: undefined,
    phone: undefined,
    email: undefined,
    status: '0'
  }
  deptRefRef.value?.resetFields()
}

/** 搜索按钮操作 */
function handleQuery() {
  getList()
}

/** 重置按钮操作 */
function resetQuery() {
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 新增按钮操作 */
function handleAdd(row?: SysDept) {
  reset()
  listDept()
    .then((response) => {
      deptOptions.value = handleTree(response.data!, 'deptId')
    })
    .catch(() => {})
  if (row !== undefined) {
    form.value.parentId = row.deptId
  }
  open.value = true
  title.value = t('common.add') + t('dept.title')
}

/** 展开/折叠操作（由 useTreeTableSort 提供 toggleExpandAll） */

/** 修改按钮操作 */
function handleUpdate(row: SysDept) {
  reset()
  listDeptExcludeChild(row.deptId!)
    .then((response) => {
      deptOptions.value = handleTree(response.data!, 'deptId')
    })
    .catch(() => {})
  getDept(row.deptId!)
    .then((response) => {
      form.value = response.data!
      open.value = true
      title.value = t('common.edit') + t('dept.title')
    })
    .catch(() => {})
}

/** 提交按钮 */
function submitForm() {
  deptRefRef.value?.validate((valid: boolean) => {
    if (valid) {
      submitLoading.value = true
      if (form.value.deptId != undefined) {
        updateDept(form.value)
          .then(() => {
            modal.msgSuccess(t('common.editSuccess'))
            open.value = false
            getList()
            // V-1 修复: 部门变更后失效下拉树缓存，确保用户管理/角色管理等页面拿到最新部门树
            refreshDeptTreeSelect()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      } else {
        addDept(form.value)
          .then(() => {
            modal.msgSuccess(t('common.addSuccess'))
            open.value = false
            getList()
            // V-1 修复: 部门变更后失效下拉树缓存
            refreshDeptTreeSelect()
          })
          .catch(() => {})
          .finally(() => {
            submitLoading.value = false
          })
      }
    }
  })
}

/** recordOriginalOrders / handleSaveSort 由 useTreeTableSort 提供 */

/** 删除按钮操作 */
function handleDelete(row: SysDept) {
  modal
    .confirm(t('dept.tip.confirmDelete', { name: row.deptName }))
    .then(function () {
      return delDept(row.deptId!)
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
      // V-1 修复: 部门删除后失效下拉树缓存
      refreshDeptTreeSelect()
    })
    .catch(() => {})
}

getList()
</script>

<style scoped>
:deep(.el-table__row) {
  transition: background-color 0.2s ease;
}
</style>
