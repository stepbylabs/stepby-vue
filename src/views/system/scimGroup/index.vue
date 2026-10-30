<template>
  <div class="app-container">
    <transition name="fade" enter-active-class="animate__animated animate__fadeInUp">
      <el-card v-if="showSearch" shadow="never" class="mb-2">
        <el-form :inline="true" :model="queryForm" @submit.prevent>
          <el-form-item :label="t('scimGroup.displayName')">
            <el-input
              v-model.trim="queryForm.displayName"
              :aria-label="t('scimGroup.displayName')"
              :placeholder="t('common.inputText')"
              clearable
              class="w-[200px]"
              @keyup.enter="handleQuery"
            />
          </el-form-item>
          <el-form-item :label="t('scimGroup.mappingType')">
            <el-select
              :aria-label="t('scimGroup.mappingType')"
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
          <el-col :span="1.5">
            <el-button
              v-hasPermi="['system:scimgroup:remove']"
              type="danger"
              plain
              icon="Delete"
              :disabled="selectedIds.length === 0"
              @click="handleBatchDelete"
            >
              {{ t('common.batchDelete') }}
            </el-button>
          </el-col>
          <right-toolbar v-model:show-search="showSearch" @query-table="getList" />
        </el-row>
        <el-alert :title="t('scimGroup.sourceTip')" type="info" :closable="false" class="mb-2" />
      </template>

      <el-table v-loading="loading" :data="groupList" @selection-change="handleSelectionChange">
        <el-table-column type="selection" width="55" align="center" />
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
            <el-button v-hasPermi="['system:scimgroup:edit']" link type="primary" icon="Edit" @click="openEdit(row)">
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
        <template #empty>
          <list-empty :load-error="loadError" @retry="getList" />
        </template>
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
      :before-close="beforeEditClose"
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
          <el-select
            :aria-label="t('scimGroup.bindRoles')"
            v-model="editForm.bindingTargetIds"
            multiple
            filterable
            class="w-full"
          >
            <el-option v-for="r in roleOptions" :key="r.roleId" :label="r.roleName" :value="r.roleId" />
          </el-select>
          <div v-if="roleOptionsTruncated" class="el-form-item__tip" data-test="scim-role-truncated">
            {{ t('common.optionsTruncated', { count: roleOptions.length, total: roleOptionsTotal }) }}
          </div>
          <div class="el-form-item__tip">{{ t('scimGroup.bindRoleTip') }}</div>
        </el-form-item>
        <el-form-item v-else :label="t('scimGroup.bindDept')">
          <el-select
            :aria-label="t('scimGroup.bindDept')"
            v-model="editForm.bindingTargetIds"
            multiple
            filterable
            class="w-full"
          >
            <el-option v-for="d in deptOptions" :key="d.deptId" :label="d.deptName" :value="d.deptId" />
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
          <el-button v-hasPermi="['system:scimgroup:edit']" type="primary" :loading="saving" @click="saveEdit">
            {{ t('common.save') }}
          </el-button>
          <el-button @click="cancelEdit">{{ t('common.cancel') }}</el-button>
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
import { useMobileFilter } from '@/composables/useMobileFilter'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import { confirmAction } from '@/utils/confirm'
import { pageAfterEmptyResult } from '@/composables/useCrudTable'
import { createLatestGuard } from '@/composables/latestRequest'
import { fetchAllPages } from '@/utils/paging'

const { t } = useI18n()
const { proxy } = getCurrentInstance() as ComponentInternalInstance

const showSearch = ref(true)
// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
const { isMobile: isMobileFilter } = useMobileFilter(showSearch)
void isMobileFilter
const loading = ref(false)
/** 列表请求守卫：连点搜索/翻页时只让最后一次请求的结局生效（b119） */
const listGuard = createLatestGuard()
// 列表加载失败标记：失败置真（空态显示"加载失败 + 重试"），成功置假
const loadError = ref(false)
const saving = ref(false)
const groupList = ref<ScimGroupAdminRow[]>([])
const total = ref(0)
const selectedIds = ref<number[]>([])
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
const roleOptionsTotal = ref(0)
const roleOptionsTruncated = ref(false)
const deptOptions = ref<SysDept[]>([])

const hasBindings = computed(() => (detail.value?.bindingTargetIds?.length ?? 0) > 0)

/**
 * 关闭语义（b136）：抽屉里的映射类型与绑定目标是**可编辑且未落库**的，
 * 而 ElDrawer 的 ×/遮罩/Esc 与其他覆盖层同源（默认 closeOnClickModal / closeOnPressEscape 均为 true）
 * ——原先按 Esc 会静默丢弃刚改的绑定。
 */
const { beforeClose: beforeEditClose, cancel: cancelEdit } = useDialogDirtyGuard(editVisible, editForm)

async function getList() {
  const ticket = listGuard.begin()
  loading.value = true
  try {
    const res = await listScimGroup(queryForm)
    if (!listGuard.isCurrent(ticket)) return
    const nextPage = pageAfterEmptyResult(queryForm.pageNum, res.rows.length, res.total)
    if (nextPage !== queryForm.pageNum) {
      queryForm.pageNum = nextPage
      return getList()
    }
    loadError.value = false
    groupList.value = res.rows
    total.value = res.total
  } catch {
    if (!listGuard.isCurrent(ticket)) return
    // b105：失败必须与"暂无数据"可区分；此前没有 catch，拒绝会逸出到全局处理器
    loadError.value = true
    groupList.value = []
    total.value = 0
  } finally {
    if (listGuard.isCurrent(ticket)) loading.value = false
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
  try {
    const res = await getScimGroup(row.groupId)
    detail.value = res.data ?? null
    editForm.mappingType = detail.value?.mappingType ?? 'role'
    editForm.bindingTargetIds = [...(detail.value?.bindingTargetIds ?? [])]
    // 并行加载角色 / 部门候选
    if (roleOptions.value.length === 0) {
      // b134：后端把 pageSize 钳到 100（此前请求 500 只会拿到 100，截断检查 `>=500` 永不成立）；
      // 角色全集按 total 分页拉齐，超过硬上限则如实提示，不让"少了几项"冒充全量
      const all = await fetchAllPages((pageNum, pageSize) => listRole({ pageNum, pageSize }))
      roleOptions.value = all.rows
      roleOptionsTotal.value = all.total
      roleOptionsTruncated.value = all.truncated
    }
    if (deptOptions.value.length === 0) {
      const dRes = await listDept()
      deptOptions.value = flattenDepts(dRes.data ?? [])
    }
    // 全部数据就绪才打开抽屉：避免半开状态（缺下拉选项/成员列表）
    editVisible.value = true
  } catch {
    // 接口均走 request 封装，响应拦截器已统一弹错，此处不再重复提示；
    // 仅清理行引用，保证失败后抽屉不打开（editVisible 仅在成功路径置 true）
    editRow.value = null
  }
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
  const ok = await confirmAction(t('scimGroup.deleteConfirm', [row.displayName]))
  if (!ok) return
  try {
    await delScimGroup(row.groupId)
    proxy?.$modal.msgSuccess(t('common.success'))
    getList()
  } catch (e) {
    // 拦截器已提示；阻止拒绝逸出（async 事件处理器的拒绝会被全局 errorHandler 接管）
    if (import.meta.env.DEV) console.error('[scimGroup] delete:', e)
  }
}

/** 多选变化（批量删除用） */
function handleSelectionChange(rows: ScimGroupAdminRow[]) {
  selectedIds.value = rows.map((r) => r.groupId)
}

/** 批量删除：后端 DELETE /system/scimGroup/{id} 支持逗号分隔多 id */
async function handleBatchDelete() {
  const ok = await confirmAction(t('scimGroup.batchDeleteConfirm', [selectedIds.value.length]))
  if (!ok) return
  try {
    await delScimGroup(selectedIds.value.join(','))
    proxy?.$modal.msgSuccess(t('common.batchDeleteSuccess'))
    getList()
  } catch (e) {
    if (import.meta.env.DEV) console.error('[scimGroup] batchDelete:', e)
  }
}

onMounted(getList)
</script>
