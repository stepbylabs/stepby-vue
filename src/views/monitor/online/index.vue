<template>
  <div class="app-container">
    <el-tabs v-model="activeTab" class="online-tabs">
      <!-- Tab 1: 全部在线（管理员视角） -->
      <el-tab-pane v-if="hasOnlinePerm" :label="t('online.tab.allOnline')" name="admin">
        <el-form :model="queryParams" ref="queryRef" :inline="true">
          <el-form-item :label="t('online.search.ipaddr')" prop="ipaddr">
            <el-input
              v-model="queryParams.ipaddr"
              :placeholder="t('online.search.phIpaddr')"
              :maxlength="50"
              clearable
              class="w-[200px]"
              @keyup.enter="handleQuery"
            />
          </el-form-item>
          <el-form-item :label="t('online.search.userName')" prop="userName">
            <el-input
              v-model="queryParams.userName"
              :placeholder="t('online.search.phUserName')"
              :maxlength="30"
              clearable
              class="w-[200px]"
              @keyup.enter="handleQuery"
            />
          </el-form-item>
          <el-form-item>
            <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
            <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
          </el-form-item>
        </el-form>
        <!-- 前端 slice 分页：在线用户列表通常数据量小，全量拉取后前端分页即可，避免每页请求 -->
        <el-table
          v-loading="loading"
          :data="onlineList.slice((pageNum - 1) * pageSize, pageNum * pageSize)"
          class="w-full"
        >
          <el-table-column :label="t('common.column.sort')" width="50" type="index" align="center">
            <template #default="scope">
              <span>{{ (pageNum - 1) * pageSize + scope.$index + 1 }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('online.column.tokenId')"
            align="center"
            prop="tokenId"
            min-width="180"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('online.column.userName')"
            align="center"
            prop="userName"
            min-width="120"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('online.column.deptName')"
            align="center"
            prop="deptName"
            min-width="120"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('online.column.ipaddr')"
            align="center"
            prop="ipaddr"
            min-width="130"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('online.column.loginLocation')"
            align="center"
            prop="loginLocation"
            min-width="120"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('online.column.os')"
            align="center"
            prop="os"
            min-width="130"
            show-overflow-tooltip
          />
          <el-table-column
            :label="t('online.column.browser')"
            align="center"
            prop="browser"
            min-width="130"
            show-overflow-tooltip
          />
          <el-table-column :label="t('online.column.loginTime')" align="center" prop="loginTime" width="180">
            <template #default="scope">
              <span>{{ parseTime(scope.row.loginTime) }}</span>
            </template>
          </el-table-column>
          <el-table-column
            :label="t('common.column.operation')"
            align="center"
            width="120"
            class-name="small-padding fixed-width"
          >
            <template #default="scope">
              <el-button
                link
                type="primary"
                icon="Delete"
                class="transition-transform duration-100 active:scale-95"
                @click="handleForceLogout(scope.row)"
                v-hasPermi="['monitor:online:forceLogout']"
              >
                {{ t('online.btn.forceLogout') }}
              </el-button>
            </template>
          </el-table-column>
          <template #empty>
            <el-empty :description="t('common.empty')" />
          </template>
        </el-table>

        <pagination
          v-show="total > 0"
          :total="total"
          v-model:page="pageNum"
          v-model:limit="pageSize"
          @pagination="getList"
        />
      </el-tab-pane>

      <!-- Tab 2: 我的会话（用户视角） -->
      <el-tab-pane v-if="hasSessionPerm" :label="t('online.tab.mySession')" name="user">
        <MySessionPanel />
      </el-tab-pane>
      <!-- 都无权限时的空状态提示 -->
      <el-tab-pane v-if="!hasOnlinePerm && !hasSessionPerm" :label="t('common.tip')" name="empty">
        <el-empty :description="t('common.noPermission')" />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts" name="Online">
import { forceLogout, list as initData } from '@/api/monitor/online'
import type { SysUserOnline, OnlineQueryParams } from '@/types/api/monitor/online'
import modal from '@/plugins/modal'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import MySessionPanel from './MySessionPanel.vue'
import useUserStore from '@/store/modules/user'

const { t } = useI18n()
const queryRefRef = useTemplateRef('queryRef')
const userStore = useUserStore()

const onlineList = shallowRef<SysUserOnline[]>([])
const total = ref<number>(0)
const pageNum = ref<number>(1)
const pageSize = ref<number>(10)

const queryParams = ref<OnlineQueryParams>({
  ipaddr: undefined,
  userName: undefined
})

// 权限判断：管理员视角需要 monitor:online:list，用户视角需要 monitor:session:list
const hasOnlinePerm = computed(() => {
  const perms = userStore.permissions || []
  return perms.includes('*:*:*') || perms.includes('monitor:online:list')
})
const hasSessionPerm = computed(() => {
  const perms = userStore.permissions || []
  return perms.includes('*:*:*') || perms.includes('monitor:session:list')
})

// loading 仅作用于 admin tab（el-table 在 admin tab pane 内），无 admin 权限时不会渲染
const loading = ref<boolean>(hasOnlinePerm.value)

// 默认激活 tab：有管理员权限则显示 admin，否则显示 user
const activeTab = ref<'admin' | 'user'>(hasOnlinePerm.value ? 'admin' : 'user')

/** 查询在线用户列表 */
function getList() {
  loading.value = true
  initData(queryParams.value)
    .then((response) => {
      onlineList.value = response.rows
      total.value = response.total
    })
    .catch((err) => {
      modal.msgError(err.message)
    })
    .finally(() => {
      loading.value = false
    })
}

/** 搜索按钮操作 */
function handleQuery() {
  pageNum.value = 1
  getList()
}

/** 重置按钮操作 */
function resetQuery() {
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 强退按钮操作 */
function handleForceLogout(row: SysUserOnline) {
  modal
    .confirm(t('online.tip.confirmForceLogout', { name: row.userName }))
    .then(function () {
      return forceLogout(row.tokenId!)
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('common.deleteSuccess'))
    })
    .catch(() => {})
}

// TierS-7: 接入自动刷新（读取 userPrefs.autoRefreshInterval，0 表示禁用）
// hooks 规则：useAutoRefresh 必须在 setup 顶层调用，回调内判断权限
useAutoRefresh(() => {
  if (hasOnlinePerm.value) getList()
})

// 仅 admin tab 可见时才加载管理员数据
if (hasOnlinePerm.value) {
  getList()
}
</script>

<style lang="scss" scoped>
/* 在线用户表格行 hover 过渡 */
:deep(.el-table__row) {
  transition:
    background-color 0.2s ease,
    transform 0.2s ease;
}

.online-tabs {
  :deep(.el-tabs__content) {
    transition: opacity 0.2s ease;
  }
}
</style>
