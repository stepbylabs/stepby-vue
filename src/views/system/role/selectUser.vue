<template>
  <!-- 授权用户 -->
  <el-dialog
    :title="t('role.selectUser.title')"
    v-model="visible"
    :before-close="beforeClose"
    width="min(80%, 800px)"
    top="5vh"
    append-to-body
    destroy-on-close
  >
    <el-form :model="queryParams" ref="queryRef" :inline="true">
      <el-form-item :label="t('user.search.username')" prop="userName">
        <el-input
          v-model="queryParams.userName"
          :placeholder="t('user.search.phUsername')"
          :maxlength="30"
          clearable
          class="w-[180px]"
          @keyup.enter="handleQuery"
          :aria-label="t('user.search.phUsername')"
        />
      </el-form-item>
      <el-form-item :label="t('user.search.phone')" prop="phonenumber">
        <el-input
          v-model="queryParams.phonenumber"
          :placeholder="t('user.search.phPhone')"
          :maxlength="11"
          clearable
          class="w-[180px]"
          @keyup.enter="handleQuery"
          :aria-label="t('user.search.phPhone')"
        />
      </el-form-item>
      <el-form-item>
        <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
        <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
      </el-form-item>
    </el-form>
    <el-row>
      <el-table
        v-loading="loading"
        @row-click="clickRow"
        ref="refTable"
        :data="userList"
        :row-key="(row: SysUser) => row.userId"
        @selection-change="handleSelectionChange"
        height="260px"
      >
        <el-table-column type="selection" width="55"></el-table-column>
        <el-table-column :label="t('user.column.username')" prop="userName" show-overflow-tooltip />
        <el-table-column :label="t('user.column.nickName')" prop="nickName" show-overflow-tooltip />
        <el-table-column :label="t('user.form.email')" prop="email" show-overflow-tooltip />
        <el-table-column :label="t('user.column.phone')" prop="phonenumber" show-overflow-tooltip />
        <el-table-column :label="t('user.column.status')" align="center" prop="status">
          <template #default="scope">
            <dict-tag :options="sys_normal_disable" :value="scope.row.status" />
          </template>
        </el-table-column>
        <el-table-column :label="t('user.column.createTime')" align="center" prop="createTime" width="180">
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <template #empty>
          <list-empty :load-error="loadError" @retry="getList" />
        </template>
      </el-table>
      <pagination
        v-show="total > 0"
        :total="total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="getList"
      />
    </el-row>
    <template #footer>
      <div class="dialog-footer">
        <el-button type="primary" :loading="submitLoading" @click="handleSelectUser">
          {{ t('common.confirm') }}
        </el-button>
        <el-button @click="cancel">{{ t('common.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="SelectUser">
import { authUserSelectAll, unallocatedUserList } from '@/api/system/role'
import { createLatestGuard } from '@/composables/latestRequest'
import { pageAfterEmptyResult } from '@/composables/useCrudTable'
import { useDialogDirtyGuard } from '@/composables/useDialogDirtyGuard'
import type { SysUser, UserQueryParams } from '@/types/api/system/user'
import modal from '@/plugins/modal'

const props = defineProps({
  roleId: {
    type: [Number, String]
  }
})

const queryRefRef = useTemplateRef('queryRef')
const refTableRef = useTemplateRef('refTable')
const { t } = useI18n()
const { sys_normal_disable } = useDict('sys_normal_disable')

const userList = shallowRef<SysUser[]>([])
const visible = ref<boolean>(false)
const total = ref<number>(0)
const userIds = ref<number[]>([])
// 关闭语义（b135）：勾选用户后按 Esc / 点遮罩 / 点 × 原先会静默丢弃选择，用户得重新搜索再勾一遍
const { beforeClose, cancel } = useDialogDirtyGuard(visible, () => ({ ids: userIds.value }))
const loading = ref<boolean>(false)
/** 列表请求守卫：连点搜索/翻页时只让最后一次请求的结局生效（b119） */
const listGuard = createLatestGuard()
const submitLoading = ref<boolean>(false)
// 列表加载失败标记：失败置真（空态显示"加载失败 + 重试"），成功置假
const loadError = ref<boolean>(false)

const queryParams = reactive<UserQueryParams>({
  pageNum: 1,
  pageSize: 10,
  roleId: undefined,
  userName: undefined,
  phonenumber: undefined
})

// 显示弹框
function show() {
  queryParams.roleId = props.roleId
  // b135：选中集必须随每次打开归零——否则上一次没提交的勾选会被带到另一个角色的
  // "确定"里（页面上一个勾都没有，却给新角色授了上一次选的人）
  userIds.value = []
  getList()
  visible.value = true
}

/**选择行 */
function clickRow(row: SysUser) {
  refTableRef.value?.toggleRowSelection(row)
}

// 多选框选中数据
function handleSelectionChange(selection: SysUser[]) {
  userIds.value = selection.map((item) => item.userId!)
}

// 查询表数据
function getList() {
  const ticket = listGuard.begin()
  loading.value = true
  unallocatedUserList(queryParams)
    .then((res) => {
      if (!listGuard.isCurrent(ticket)) return
      const nextPage = pageAfterEmptyResult(queryParams.pageNum, res.rows?.length ?? 0, res.total ?? 0)
      if (nextPage !== queryParams.pageNum) {
        queryParams.pageNum = nextPage
        getList()
        return
      }
      loadError.value = false
      userList.value = res.rows
      total.value = res.total
    })
    .catch(() => {
      if (!listGuard.isCurrent(ticket)) return
      // 失败必须与"没有可分配用户"可区分（b105）
      loadError.value = true
      userList.value = []
      total.value = 0
    })
    .finally(() => {
      if (listGuard.isCurrent(ticket)) loading.value = false
    })
}

/** 搜索按钮操作 */
function handleQuery() {
  queryParams.pageNum = 1
  getList()
}

/** 重置按钮操作 */
function resetQuery() {
  queryRefRef.value?.resetFields()
  handleQuery()
}

const emit = defineEmits(['ok'])
/** 选择授权用户操作 */
function handleSelectUser() {
  const roleId = queryParams.roleId
  const uIds = userIds.value.join(',')
  if (uIds === '') {
    modal.msgError(t('role.selectUser.selectUser'))
    return
  }
  submitLoading.value = true
  authUserSelectAll({ roleId: roleId!, userIds: uIds })
    .then((res) => {
      modal.msgSuccess(res.msg)
      visible.value = false
      emit('ok')
    })
    .catch(() => {})
    .finally(() => {
      submitLoading.value = false
    })
}

defineExpose({
  show
})
</script>

<style scoped>
:deep(.el-table__row) {
  transition: background-color 0.2s ease;
}
</style>
