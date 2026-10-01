<template>
  <div class="app-container">
    <el-tabs v-model="activeTab" class="logininfor-tabs">
      <!-- Tab 1: 全部日志（管理员视角） -->
      <el-tab-pane v-if="hasLogininforPerm" :label="t('logininfor.tab.allLog')" name="admin">
        <Transition name="expand-fade">
          <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="68px">
            <el-form-item :label="t('logininfor.search.ipaddr')" prop="ipaddr">
              <el-input
                v-model="queryParams.ipaddr"
                :placeholder="t('logininfor.search.phIpaddr')"
                :maxlength="50"
                clearable
                class="w-[240px]"
                @keyup.enter="handleQuery"
              />
            </el-form-item>
            <el-form-item :label="t('logininfor.search.userName')" prop="userName">
              <el-input
                v-model="queryParams.userName"
                :placeholder="t('logininfor.search.phUserName')"
                :maxlength="30"
                clearable
                class="w-[240px]"
                @keyup.enter="handleQuery"
              />
            </el-form-item>
            <el-form-item :label="t('common.column.status')" prop="status">
              <el-select
                v-model="queryParams.status"
                :placeholder="t('logininfor.search.phStatus')"
                clearable
                class="w-[240px]"
              >
                <el-option
                  v-for="dict in sys_common_status"
                  :key="dict.value"
                  :label="dict.label"
                  :value="dict.value"
                />
              </el-select>
            </el-form-item>
            <el-form-item :label="t('logininfor.search.loginTime')" class="w-[308px]">
              <el-date-picker
                v-model="dateRange"
                value-format="YYYY-MM-DD HH:mm:ss"
                type="daterange"
                range-separator="-"
                :start-placeholder="t('common.form.startDate')"
                :end-placeholder="t('common.form.endDate')"
                :default-time="[new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 1, 1, 23, 59, 59)]"
              ></el-date-picker>
            </el-form-item>
            <el-form-item>
              <TenantFilter v-model="queryParams.tenantId" @search="handleQuery" />
            </el-form-item>
            <el-form-item>
              <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
              <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
            </el-form-item>
          </el-form>
        </Transition>

        <el-row :gutter="10" class="mb8">
          <el-col :span="1.5">
            <el-button
              type="danger"
              plain
              icon="Delete"
              :disabled="multiple"
              @click="handleDelete"
              v-hasPermi="['monitor:logininfor:remove']"
            >
              {{ t('common.delete') }}
            </el-button>
          </el-col>
          <el-col :span="1.5">
            <el-button
              type="danger"
              plain
              icon="Delete"
              @click="handleClean"
              v-hasPermi="['monitor:logininfor:remove']"
            >
              {{ t('common.clear') }}
            </el-button>
          </el-col>
          <el-col :span="1.5">
            <el-button
              type="primary"
              plain
              icon="Unlock"
              :disabled="single"
              @click="handleUnlock"
              v-hasPermi="['monitor:logininfor:unlock']"
            >
              {{ t('logininfor.btn.unlock') }}
            </el-button>
          </el-col>
          <el-col :span="1.5">
            <el-button
              type="warning"
              plain
              icon="Download"
              @click="handleExport"
              v-hasPermi="['monitor:logininfor:export']"
            >
              {{ t('common.export') }}
            </el-button>
          </el-col>
          <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
        </el-row>

        <Transition name="fade" mode="out-in">
          <SkeletonTable v-if="loading" :columns="10" :rows="8" />
          <el-table
            v-else
            ref="logininforRef"
            v-loading="loading"
            :data="logininforList"
            :row-key="(row: SysLogininfor) => row.infoId"
            @selection-change="onSelectionChange"
            :default-sort="defaultSort"
            @sort-change="handleSortChange"
          >
            <el-table-column type="selection" width="55" align="center" />
            <el-table-column :label="t('logininfor.column.infoId')" align="center" prop="infoId" />
            <TenantColumn />
            <el-table-column
              :label="t('logininfor.column.userName')"
              align="center"
              prop="userName"
              show-overflow-tooltip
              sortable="custom"
              :sort-orders="['descending', 'ascending']"
            />
            <el-table-column
              :label="t('logininfor.column.ipaddr')"
              align="center"
              prop="ipaddr"
              show-overflow-tooltip
            />
            <el-table-column
              :label="t('logininfor.column.loginLocation')"
              align="center"
              prop="loginLocation"
              show-overflow-tooltip
            />
            <el-table-column :label="t('logininfor.column.os')" align="center" prop="os" show-overflow-tooltip />
            <el-table-column
              :label="t('logininfor.column.browser')"
              align="center"
              prop="browser"
              show-overflow-tooltip
            />
            <el-table-column :label="t('logininfor.column.status')" align="center" prop="status">
              <template #default="scope">
                <dict-tag :options="sys_common_status" :value="scope.row.status" />
              </template>
            </el-table-column>
            <el-table-column :label="t('common.column.description')" align="center" prop="msg" show-overflow-tooltip />
            <el-table-column
              :label="t('logininfor.column.loginTime')"
              align="center"
              prop="loginTime"
              sortable="custom"
              :sort-orders="['descending', 'ascending']"
              width="180"
            >
              <template #default="scope">
                <span>{{ parseTime(scope.row.loginTime) }}</span>
              </template>
            </el-table-column>
            <template #empty>
              <el-empty :description="t('common.empty')" />
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
      </el-tab-pane>

      <!-- Tab 2: 我的登录（用户视角） -->
      <el-tab-pane v-if="hasMyLoginPerm" :label="t('logininfor.tab.myLogin')" name="user">
        <MyLoginPanel />
      </el-tab-pane>
    </el-tabs>
  </div>
</template>

<script setup lang="ts" name="Logininfor">
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import TenantColumn from '@/components/TenantColumn/index.vue'
import TenantFilter from '@/components/TenantFilter/index.vue'
import { list, delLogininfor, cleanLogininfor, unlockLogininfor } from '@/api/monitor/logininfor'
import type { FormInstance } from 'element-plus'
import modal from '@/plugins/modal'
import { addDateRange } from '@/utils/stepby'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useExport } from '@/composables/useExport'
import { useCrudTable } from '@/composables/useCrudTable'
import type { SysLogininfor, LogininforQueryParams } from '@/types/api/monitor/logininfor'
import MyLoginPanel from './MyLoginPanel.vue'
import useUserStore from '@/store/modules/user'

const { t } = useI18n()
const queryRef = useTemplateRef('queryRef')
const logininforRef = useTemplateRef('logininforRef')
const userStore = useUserStore()
const { sys_common_status } = useDict('sys_common_status')

const selectName = ref<string[]>([])
const dateRange = ref<string[]>([])
const defaultSort = ref({ prop: 'loginTime', order: 'descending' })

// 查询参数
const queryParams = ref<LogininforQueryParams>({
  pageNum: 1,
  pageSize: 10,
  ipaddr: undefined,
  userName: undefined,
  status: undefined,
  orderByColumn: undefined,
  isAsc: undefined
})

const form = ref<SysLogininfor>({} as SysLogininfor)
const formRef = ref<FormInstance | null>(null)

// 权限判断
const hasLogininforPerm = computed(() => {
  const perms = userStore.permissions || []
  return perms.includes('*:*:*') || perms.includes('monitor:logininfor:list')
})
const hasMyLoginPerm = computed(() => {
  const perms = userStore.permissions || []
  return perms.includes('*:*:*') || perms.includes('monitor:mylogin:list')
})

// 默认激活 tab
const activeTab = ref<'admin' | 'user'>(hasLogininforPerm.value ? 'admin' : 'user')

const {
  dataList: logininforList,
  loading,
  showSearch,
  single,
  multiple,
  total,
  getList,
  handleQuery,
  handleSelectionChange,
  handleDelete
} = useCrudTable<SysLogininfor, LogininforQueryParams>({
  listApi: (params) =>
    list(addDateRange(params as Record<string, unknown>, dateRange.value) as LogininforQueryParams),
  getApi: () => Promise.resolve({}),
  addApi: () => Promise.resolve({}),
  updateApi: () => Promise.resolve({}),
  deleteApi: (ids) => delLogininfor(ids as unknown as number | number[]),
  idField: 'infoId',
  defaultForm: () => ({}) as SysLogininfor,
  titleKey: 'logininfor.title',
  deleteTipKey: 'logininfor.tip.confirmDelete',
  queryParams,
  form,
  formRef,
  queryRef
})

/** 重置按钮操作（审计 2.5 修复：重置后必须刷新列表）
 * 清除日期范围、重置排序参数并重新触发查询；与原始行为一致（重置后重新应用默认排序）。
 */
function resetQuery() {
  dateRange.value = []
  queryParams.value.orderByColumn = undefined
  queryParams.value.isAsc = undefined
  queryParams.value.tenantId = undefined
  queryRef.value?.resetFields()
  handleQuery()
  logininforRef.value?.sort(defaultSort.value.prop, defaultSort.value.order)
}

/** 多选框选中数据（在基类基础上记录用户名用于解锁） */
function onSelectionChange(selection: SysLogininfor[]) {
  handleSelectionChange(selection)
  selectName.value = selection.map((item) => item.userName!)
}

/** 排序触发事件 */
function handleSortChange(column: { prop: string | null; order: string | null }) {
  queryParams.value.orderByColumn = column.prop
  queryParams.value.isAsc = column.order
  getList()
}

/** 清空按钮操作 */
function handleClean() {
  modal
    .confirm(t('logininfor.tip.confirmClear'))
    .then(function () {
      return cleanLogininfor()
    })
    .then(() => {
      getList()
      modal.msgSuccess(t('common.clearSuccess'))
    })
    .catch(() => {})
}

/** 解锁按钮操作 */
function handleUnlock() {
  // 单选校验：解锁仅支持单条记录
  if (selectName.value.length !== 1) {
    modal.msgWarning(t('common.selectOneToUnlock'))
    return
  }
  const username = selectName.value
  modal
    .confirm(t('logininfor.tip.confirmUnlock', { name: username }))
    .then(function () {
      return unlockLogininfor(username)
    })
    .then(() => {
      modal.msgSuccess(t('logininfor.tip.unlockSuccess', { name: username }))
    })
    .catch(() => {})
}

/** 导出按钮操作（由 useExport 提供） */
const { handleExport: rawHandleExport } = useExport('/monitor/logininfor/export', 'logininfor', {
  successKey: 'common.exportSuccess'
})
function handleExport() {
  rawHandleExport(addDateRange({ ...queryParams.value }, dateRange.value))
}

// TierS-7: 接入自动刷新（读取 userPrefs.autoRefreshInterval，0 表示禁用）
// hooks 规则：useAutoRefresh 必须在 setup 顶层调用，回调内判断权限
useAutoRefresh(() => {
  if (hasLogininforPerm.value) getList()
})

// 仅 admin tab 可见时才加载管理员数据
if (hasLogininforPerm.value) {
  getList()
}
</script>

<style scoped lang="scss">
.logininfor-tabs {
  :deep(.el-tabs__content) {
    transition: opacity 0.2s ease;
  }
}
</style>
