<template>
  <!-- 授权用户 -->
  <el-dialog
    :title="t('role.selectUser.title')"
    v-model="visible"
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
          <el-empty :description="t('common.empty')" />
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
        <el-button @click="visible = false">{{ t('common.cancel') }}</el-button>
      </div>
    </template>
  </el-dialog>
</template>

<script setup lang="ts" name="SelectUser">
import { authUserSelectAll, unallocatedUserList } from '@/api/system/role'
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
const loading = ref<boolean>(false)
const submitLoading = ref<boolean>(false)

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
  loading.value = true
  unallocatedUserList(queryParams)
    .then((res) => {
      userList.value = res.rows
      total.value = res.total
    })
    .catch(() => {
      userList.value = []
      total.value = 0
    })
    .finally(() => {
      loading.value = false
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
