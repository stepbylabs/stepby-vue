<template>
  <div class="app-container">
    <transition name="fade" enter-active-class="animate__animated animate__fadeInUp">
      <el-card v-if="showSearch" shadow="never" class="mb-2">
        <el-form :inline="true" :model="queryForm" @submit.prevent>
          <el-form-item :label="t('scimGroup.displayName')">
            <el-input
              v-model.trim="queryForm.displayName"
              :placeholder="t('common.inputText')"
              clearable
              class="w-[200px]"
              @keyup.enter="handleQuery"
            />
          </el-form-item>
          <el-form-item :label="t('scimGroup.mappingType')">
            <el-select
              v-model="queryForm.mappingType"
              :placeholder="t('common.all')"
              clearable
              class="w-[160px]"
            >
              <el-option label="role" value="role" />
              <el-option label="dept" value="dept" />
            </el-select>
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
          <right-toolbar v-model:show-search="showSearch" @query-table="getList" />
        </el-row>
        <el-alert
          :title="t('scimGroup.sourceTip')"
          type="info"
          :closable="false"
          class="mb-2"
        />
      </template>

      <el-table v-loading="loading" :data="groupList">
        <el-table-column :label="t('scimGroup.displayName')" prop="displayName" min-width="160" show-overflow-tooltip />
        <el-table-column :label="t('scimGroup.externalId')" prop="externalId" min-width="160" show-overflow-tooltip>
          <template #default="{ row }">
            {{ row.externalId || '-' }}
          </template>
        </el-table-column>
        <el-table-column :label="t('scimGroup.mappingType')" prop="mappingType" width="110" align="center">
          <template #default="{ row }">
            <el-tag :type="row.mappingType === 'role' ? 'primary' : 'warning'">
              {{ row.mappingType }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('scimGroup.memberCount')" prop="memberCount" width="90" align="center" />
        <el-table-column :label="t('scimGroup.bindingCount')" prop="bindingCount" width="90" align="center" />
        <el-table-column :label="t('common.column.createTime')" prop="createTime" width="170" align="center">
          <template #default="{ row }">
            {{ (row.createTime || '').replace('T', ' ').slice(0, 19) }}
          </template>
        </el-table-column>
        <el-table-column :label="t('common.column.operation')" width="150" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              v-hasPermi="['system:scimgroup:edit']"
              link
              type="primary"
              icon="Edit"
              @click="openEdit(row)"
            >
              {{ t('common.edit') }}
            </el-button>
            <el-button
              v-hasPermi="['system:scimgroup:remove']"
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
      <pagination
        v-show="total > 0"
        v-model:page="queryForm.pageNum"
        v-model:limit="queryForm.pageSize"
        :total="total"
        @pagination="getList"
      />
    </el-card>

    <!-- 编辑抽屉：映射类型 + 绑定目标（成员只读） -->
    <el-drawer
      v-model="editVisible"
      :title="t('scimGroup.editTitle')"
      size="560px"
      destroy-on-close
    >
      <el-form label-width="110px" @submit.prevent>
        <el-form-item :label="t('scimGroup.displayName')">
          <el-input :model-value="editRow?.displayName" disabled />
        </el-form-item>
        <el-form-item :label="t('scimGroup.externalId')">
          <el-input :model-value="editRow?.externalId || '-'" disabled />
        </el-form-item>
        <el-form-item :label="t('scimGroup.mappingType')">
          <el-radio-group v-model="editForm.mappingType" :disabled="hasBindings">
            <el-radio value="role">role（{{ t('scimGroup.typeRole') }}）</el-radio>
            <el-radio value="dept">dept（{{ t('scimGroup.typeDept') }}）</el-radio>
          </el-radio-group>
          <div class="el-form-item__tip">
            {{ hasBindings ? t('scimGroup.mappingLocked') : t('scimGroup.mappingTip') }}
          </div>
        </el-form-item>
        <el-form-item v-if="editForm.mappingType === 'role'" :label="t('scimGroup.bindRoles')">
          <el-select v-model="editForm.bindingTargetIds" multiple filterable style="width: 100%">
            <el-option
              v-for="r in roleOptions"
              :key="r.roleId"
              :label="r.roleName"
              :value="r.roleId"
            />
          </el-select>
          <div class="el-form-item__tip">{{ t('scimGroup.bindRoleTip') }}</div>
        </el-form-item>
        <el-form-item v-else :label="t('scimGroup.bindDept')">
          <el-select v-model="editForm.bindingTargetIds" multiple filterable style="width: 100%">
            <el-option
              v-for="d in deptOptions"
              :key="d.deptId"
              :label="d.deptName"
              :value="d.deptId"
            />
          </el-select>
          <div class="el-form-item__tip">{{ t('scimGroup.bindDeptTip') }}</div>
        </el-form-item>
        <el-form-item :label="t('scimGroup.members')">
          <el-table :data="detail?.members || []" size="small" max-height="260">
            <el-table-column :label="t('scimGroup.userName')" prop="userName" />
            <el-table-column :label="t('scimGroup.nickName')" prop="nickName" />
          </el-table>
          <div class="el-form-item__tip">{{ t('scimGroup.memberReadonly') }}</div>
        </el-form-item>
        <el-form-item>
          <el-button
            v-hasPermi="['system:scimgroup:edit']"
            type="primary"
            :loading="saving"
            @click="saveEdit"
          >
            {{ t('common.save') }}
          </el-button>
          <el-button @click="editVisible = false">{{ t('common.cancel') }}</el-button>
        </el-form-item>
      </el-form>
    </el-drawer>
  </div>
</template>

<script setup lang="ts">
import { listScimGroup, getScimGroup, updateScimGroup, delScimGroup } from '@/api/system/scimGroup'
import { listRole } from '@/api/system/role'
import { listDept } from '@/api/system/dept'
import type { ComponentInternalInstance } from 'vue'
import type { ScimGroupAdminRow, ScimGroupAdminDetail, SysRole, SysDept } from '@/types'

const { t } = useI18n()
const { proxy } = getCurrentInstance() as ComponentInternalInstance

const showSearch = ref(true)
const loading = ref(false)
const saving = ref(false)
const groupList = ref<ScimGroupAdminRow[]>([])
const total = ref(0)
const queryForm = reactive({
  pageNum: 1,
  pageSize: 10,
  displayName: '',
  mappingType: ''
})

const editVisible = ref(false)
const editRow = ref<ScimGroupAdminRow | null>(null)
const detail = ref<ScimGroupAdminDetail | null>(null)
const editForm = reactive<{ mappingType: string; bindingTargetIds: number[] }>({
  mappingType: 'role',
  bindingTargetIds: []
})
const roleOptions = ref<SysRole[]>([])
const deptOptions = ref<SysDept[]>([])

const hasBindings = computed(() => (detail.value?.bindingTargetIds?.length ?? 0) > 0)

async function getList() {
  loading.value = true
  try {
    const res = await listScimGroup(queryForm)
    groupList.value = res.rows
    total.value = res.total
  } finally {
    loading.value = false
  }
}

function handleQuery() {
  queryForm.pageNum = 1
  getList()
}

function resetQuery() {
  queryForm.displayName = ''
  queryForm.mappingType = ''
  handleQuery()
}

async function openEdit(row: ScimGroupAdminRow) {
  editRow.value = row
  const res = await getScimGroup(row.groupId)
  detail.value = res.data ?? null
  editForm.mappingType = detail.value?.mappingType ?? 'role'
  editForm.bindingTargetIds = [...(detail.value?.bindingTargetIds ?? [])]
  // 并行加载角色 / 部门候选
  if (roleOptions.value.length === 0) {
    const r = await listRole({ pageNum: 1, pageSize: 500 })
    roleOptions.value = r.rows
  }
  if (deptOptions.value.length === 0) {
    const dRes = await listDept()
    deptOptions.value = flattenDepts(dRes.data ?? [])
  }
  editVisible.value = true
}

/** 部门树平铺（绑定选择用简单多选） */
function flattenDepts(tree: SysDept[]): SysDept[] {
  const out: SysDept[] = []
  const walk = (nodes: SysDept[]) => {
    for (const n of nodes) {
      out.push(n)
      if (n.children?.length) walk(n.children)
    }
  }
  walk(tree)
  return out
}

async function saveEdit() {
  if (!editRow.value) return
  saving.value = true
  try {
    await updateScimGroup(editRow.value.groupId, {
      mappingType: editForm.mappingType,
      bindingTargetIds: editForm.bindingTargetIds
    })
    proxy?.$modal.msgSuccess(t('common.success'))
    editVisible.value = false
    getList()
  } finally {
    saving.value = false
  }
}

async function handleDelete(row: ScimGroupAdminRow) {
  const ok = await proxy?.$modal.confirm(t('scimGroup.deleteConfirm', [row.displayName]))
  if (!ok) return
  await delScimGroup(row.groupId)
  proxy?.$modal.msgSuccess(t('common.success'))
  getList()
}

onMounted(getList)
</script>
