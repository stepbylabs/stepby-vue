<template>
  <div class="app-container">
    <Transition name="expand-fade">
      <el-form :model="queryParams" ref="queryRef" v-show="showSearch" :inline="true">
        <el-form-item :label="t('user.search.username')" prop="userName">
          <el-input
            v-model="queryParams.userName"
            :placeholder="t('user.search.phUsername')"
            :maxlength="30"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item :label="t('user.search.phone')" prop="phonenumber">
          <el-input
            v-model="queryParams.phonenumber"
            :placeholder="t('user.search.phPhone')"
            :maxlength="11"
            clearable
            class="w-[240px]"
            @keyup.enter="handleQuery"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button type="primary" plain icon="Plus" @click="openSelectUser" v-hasPermi="['system:role:edit']">
          {{ t('common.add') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button
          type="danger"
          plain
          icon="CircleClose"
          :disabled="multiple"
          @click="cancelAuthUserAll"
          v-hasPermi="['system:role:edit']"
        >
          {{ t('role.authUser.batchCancel') }}
        </el-button>
      </el-col>
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Close" @click="handleClose">{{ t('common.close') }}</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <el-table
      v-loading="loading"
      :data="userList"
      :row-key="(row: SysUser) => row.userId"
      @selection-change="handleSelectionChange"
    >
      <template #empty>
        <el-empty :description="t('common.noData')" :image-size="80" />
      </template>
      <el-table-column type="selection" width="55" align="center" />
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
      <el-table-column :label="t('common.column.operation')" align="center" class-name="small-padding fixed-width">
        <template #default="scope">
          <el-button
            link
            type="primary"
            icon="CircleClose"
            @click="cancelAuthUser(scope.row)"
            v-hasPermi="['system:role:edit']"
          >
            {{ t('role.authUser.cancel') }}
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="queryParams.pageNum"
      v-model:limit="queryParams.pageSize"
      @pagination="getList"
    />
    <select-user ref="selectRef" :roleId="queryParams.roleId" @ok="handleQuery" />
  </div>
</template>

<script setup lang="ts" name="AuthUser">
import selectUser from './selectUser.vue'
import { allocatedUserList, authUserCancel, authUserCancelAll } from '@/api/system/role'
import type { SysUser, AuthUserQueryParams } from '@/types/api/system/user'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'

const route = useRoute()
const queryRefRef = useTemplateRef('queryRef')
const selectRefRef = useTemplateRef('selectRef')
const { t } = useI18n()
const { sys_normal_disable } = useDict('sys_normal_disable')

const userList = shallowRef<SysUser[]>([])
const loading = ref<boolean>(true)
const showSearch = ref<boolean>(true)
const multiple = ref<boolean>(true)
const total = ref<number>(0)
const userIds = ref<number[]>([])

const queryParams = reactive<AuthUserQueryParams>({
  pageNum: 1,
  pageSize: 10,
  roleId: Number(route.params.roleId),
  userName: undefined,
  phonenumber: undefined
})

/** 查询授权用户列表 */
function getList() {
  loading.value = true
  allocatedUserList(queryParams)
    .then((response) => {
      userList.value = response.rows
      total.value = response.total
    })
    .catch(() => {})
    .finally(() => {
      loading.value = false
    })
}

/** 返回按钮 */
function handleClose() {
  const obj = { path: '/system/role' }
  tab.closeOpenPage(obj)
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

/** 多选框选中数据 */
function handleSelectionChange(selection: SysUser[]) {
  userIds.value = selection.map((item) => item.userId!)
  multiple.value = !selection.length
}

/** 打开授权用户表弹窗 */
function openSelectUser() {
  selectRefRef.value?.show()
}

/** 取消授权按钮操作 */
function cancelAuthUser(row: SysUser) {
  modal
    .confirm(t('role.authUser.confirmCancelAuth', { name: row.userName }))
    .then(function () {
      return authUserCancel({ userId: row.userId!, roleId: queryParams.roleId })
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('role.authUser.cancelAuthSuccess'))
    })
    .catch(() => {})
}

/** 批量取消授权按钮操作 */
function cancelAuthUserAll() {
  const roleId = queryParams.roleId
  const uIds = userIds.value.join(',')
  modal
    .confirm(t('role.authUser.confirmBatchCancel'))
    .then(function () {
      return authUserCancelAll({ roleId: roleId, userIds: uIds })
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('role.authUser.cancelAuthSuccess'))
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
