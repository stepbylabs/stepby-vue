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
          <!-- §27.13.2 分层视图：租户筛选仅平台操作者（tid=0）可见；租户操作者后端恒按本租户过滤 -->
          <el-form-item v-if="isPlatform" :label="t('online.search.tenantId')" prop="tenantId">
            <el-input-number
              v-model="queryParams.tenantId"
              :min="0"
              :controls="false"
              :placeholder="t('online.search.phTenantId')"
              class="w-[140px]"
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
          <!-- §27.13.2 分层视图：租户列仅平台视图展示（租户操作者全部会话同属本租户） -->
          <el-table-column
            v-if="isPlatform"
            :label="t('online.column.tenantName')"
            align="center"
            prop="tenantName"
            min-width="120"
            show-overflow-tooltip
          >
            <template #default="{ row }">
              {{ row.tenantName || (row.tenantId === 0 ? t('common.platformTenant') : `#${row.tenantId}`) }}
            </template>
          </el-table-column>
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
import type { FormInstance } from 'element-plus'
import type { SysUserOnline, OnlineQueryParams } from '@/types/api/monitor/online'
import modal from '@/plugins/modal'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useCrudTable } from '@/composables/useCrudTable'
import MySessionPanel from './MySessionPanel.vue'
import useUserStore from '@/store/modules/user'

const { t } = useI18n()
const queryRefRef = useTemplateRef('queryRef')
const userStore = useUserStore()

// 前端切片分页：在线用户列表通常数据量小，全量拉取后前端分页即可，避免每页请求
const pageNum = ref<number>(1)
const pageSize = ref<number>(10)

const form = ref<SysUserOnline>({} as SysUserOnline)
const formRef = ref<FormInstance | null>(null)

const queryParams = ref<OnlineQueryParams>({
  ipaddr: undefined,
  userName: undefined,
  tenantId: undefined
})

// §27.13.2 分层视图：平台操作者（tenantId=0）可跨租户查看并筛选；租户操作者仅本租户
const isPlatform = computed(() => (userStore.tenantId ?? 0) === 0)

// 权限判断：管理员视角需要 monitor:online:list，用户视角需要 monitor:session:list
const hasOnlinePerm = computed(() => {
  const perms = userStore.permissions || []
  return perms.includes('*:*:*') || perms.includes('monitor:online:list')
})
const hasSessionPerm = computed(() => {
  const perms = userStore.permissions || []
  return perms.includes('*:*:*') || perms.includes('monitor:session:list')
})

// 默认激活 tab：有管理员权限则显示 admin，否则显示 user
const activeTab = ref<'admin' | 'user'>(hasOnlinePerm.value ? 'admin' : 'user')

// 复用 useCrudTable：列表数据 / loading / total / 选中态 / 查询 / 重置 等样板逻辑
const {
  dataList: onlineList,
  loading,
  total,
  getList,
  handleQuery: baseHandleQuery,
  resetQuery: baseResetQuery
} = useCrudTable<SysUserOnline, OnlineQueryParams>({
  // 在线用户列表为全量返回，仅透传过滤字段（不向后端传分页参数，由前端切片分页）
  listApi: (params) =>
    initData({ ipaddr: params.ipaddr, userName: params.userName, tenantId: params.tenantId }),
  getApi: () => Promise.resolve({}),
  addApi: () => Promise.resolve({}),
  updateApi: () => Promise.resolve({}),
  deleteApi: () => Promise.resolve({}),
  idField: 'tokenId',
  defaultForm: () => ({}) as SysUserOnline,
  titleKey: 'online.title',
  deleteTipKey: 'online.tip.confirmForceLogout',
  queryParams,
  form,
  formRef,
  queryRef: queryRefRef
})

/** 搜索按钮操作（前端分页：重置到第 1 页并重新拉取全量数据） */
function handleQuery() {
  pageNum.value = 1
  baseHandleQuery()
}

/** 重置按钮操作（审计 2.5 修复：重置后必须刷新列表） */
function resetQuery() {
  queryRefRef.value?.resetFields()
  pageNum.value = 1
  baseResetQuery()
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
