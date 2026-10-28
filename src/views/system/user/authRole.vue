<template>
  <div class="app-container">
    <h4 class="form-header h4">{{ t('userView.basicInfo') }}</h4>
    <el-form :model="form" label-width="80px">
      <el-row>
        <el-col :span="8" :offset="2">
          <el-form-item :label="t('user.form.nickName')" prop="nickName">
            <el-input v-model="form.nickName" disabled :maxlength="30" />
          </el-form-item>
        </el-col>
        <el-col :span="8" :offset="2">
          <el-form-item :label="t('user.column.username')" prop="userName">
            <el-input v-model="form.userName" disabled :maxlength="30" />
          </el-form-item>
        </el-col>
      </el-row>
    </el-form>

    <h4 class="form-header h4">{{ t('user.authRole.title') }}</h4>
    <el-table
      v-loading="loading"
      :row-key="getRowKey"
      @row-click="clickRow"
      ref="roleRef"
      @selection-change="handleSelectionChange"
      :data="pagedRoles"
    >
      <template #empty>
        <!-- 失败与"该用户还没有角色"必须可分：失败由 ListEmpty 给重试入口（b110） -->
        <list-empty :load-error="loadError" @retry="loadAuthRole" />
      </template>
      <el-table-column :label="t('common.column.sort')" width="55" type="index" align="center">
        <template #default="scope">
          <span>{{ (pageNum - 1) * pageSize + scope.$index + 1 }}</span>
        </template>
      </el-table-column>
      <el-table-column
        type="selection"
        :reserve-selection="true"
        :selectable="checkSelectable"
        width="55"
      ></el-table-column>
      <el-table-column :label="t('role.column.id')" align="center" prop="roleId" />
      <el-table-column :label="t('role.column.roleName')" align="center" prop="roleName" />
      <el-table-column :label="t('role.column.roleKey')" align="center" prop="roleKey" />
      <el-table-column :label="t('role.column.createTime')" align="center" prop="createTime" width="180">
        <template #default="scope">
          <span>{{ parseTime(scope.row.createTime) }}</span>
        </template>
      </el-table-column>
    </el-table>

    <pagination
      v-show="total > 0"
      :total="total"
      v-model:page="pageNum"
      v-model:limit="pageSize"
      @pagination="handlePageChange"
    />

    <el-form label-width="100px">
      <div class="text-center -ml-[120px] mt-[30px]">
        <el-button type="primary" :loading="submitLoading" @click="submitForm()">
          {{ t('userAuthRole.submit') }}
        </el-button>
        <el-button @click="close()">{{ t('userAuthRole.back') }}</el-button>
      </div>
    </el-form>
  </div>
</template>

<script setup lang="ts" name="AuthRole">
import { getAuthRole, updateAuthRole } from '@/api/system/user'
import type { SysRole } from '@/types/api/system/role'
import type { SysUser, SysRoleWithFlag } from '@/types/api/system/user'
import modal from '@/plugins/modal'
import tab from '@/plugins/tab'
import { toPositiveInt } from '@/utils/validate'

const route = useRoute()
const roleRefRef = useTemplateRef('roleRef')
const { t } = useI18n()

const loading = ref<boolean>(true)
// 提交在途态：既是按钮的 loading，也是双击/连点的同步闸（避免重复 updateAuthRole）
const submitLoading = ref<boolean>(false)
// 列表加载失败标记：失败置真（空态显示"加载失败 + 重试"），成功置假
const loadError = ref<boolean>(false)
const total = ref<number>(0)
const pageNum = ref<number>(1)
const pageSize = ref<number>(10)
const roleIds = ref<number[]>([])
const roles = shallowRef<SysRoleWithFlag[]>([])

/** 当前页的角色数据（前端分页） */
const pagedRoles = computed(() =>
  roles.value.slice((pageNum.value - 1) * pageSize.value, pageNum.value * pageSize.value)
)
const form = ref<SysUser>({
  nickName: undefined,
  userName: undefined,
  userId: undefined
})

/** 单击选中行数据 */
function clickRow(row: SysRole) {
  if (checkSelectable(row)) {
    roleRefRef.value?.toggleRowSelection(row)
  }
}

/** 多选框选中数据 */
function handleSelectionChange(selection: SysRole[]) {
  roleIds.value = selection.map((item) => item.roleId!)
}

/** 保存选中的数据编号 */
function getRowKey(row: SysRole): number {
  return row.roleId!
}

// 检查角色状态
function checkSelectable(row: SysRole): boolean {
  return row.status === '0'
}

/** 分页变化处理（数据通过 computed 响应式更新） */
function handlePageChange() {
  // 前端分页，数据已通过 pagedRoles computed 响应式更新
}

/** 关闭按钮 */
function close() {
  const obj = { path: '/system/user' }
  tab.closeOpenPage(obj)
}

/** 提交按钮（在途期重复点击直接丢弃，不重复发请求） */
function submitForm() {
  if (submitLoading.value) return
  const userId = form.value.userId
  const rIds = roleIds.value.join(',')
  submitLoading.value = true
  updateAuthRole({ userId: userId!, roleIds: rIds })
    .then(() => {
      modal.msgSuccess(t('userAuthRole.authSuccess'))
      close()
    })
    .catch(() => {
      // 接口错误的提示由请求拦截器统一负责；这里只保证拒绝不逸出、按钮复位
    })
    .finally(() => {
      submitLoading.value = false
    })
}

/** 查询该用户的角色授权（重试入口与首次加载共用） */
function loadAuthRole() {
  const userId = toPositiveInt(route.params.userId)
  if (!userId) {
    // 深链参数非法（缺失/畸形/越界）：不发注定 400 的请求，也不留永久骨架
    loading.value = false
    loadError.value = false
    roles.value = []
    total.value = 0
    return
  }
  loading.value = true
  loadError.value = false
  getAuthRole(userId)
    .then((response) => {
      form.value = response.user
      roles.value = response.roles
      total.value = roles.value.length
      nextTick(() => {
        roles.value.forEach((row: SysRoleWithFlag) => {
          if (row.flag) {
            roleRefRef.value?.toggleRowSelection(row)
          }
        })
      })
    })
    .catch(() => {
      // 失败必须与"该用户没有角色"可区分：清空陈旧行 + 空态给重试
      loadError.value = true
      roles.value = []
      total.value = 0
    })
    .finally(() => {
      loading.value = false
    })
}

loadAuthRole()
</script>
