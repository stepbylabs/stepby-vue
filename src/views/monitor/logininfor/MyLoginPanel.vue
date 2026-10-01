<template>
  <div class="my-login-panel">
    <!-- 顶部信息卡片：当前会话 + 异常提醒 -->
    <el-row :gutter="16" class="summary-cards mb-4">
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="summary-card summary-current flex items-center p-4 mb-3 rounded-lg">
          <div class="summary-icon w-12 h-12 rounded-full flex items-center justify-center mr-3.5 shrink-0">
            <svg-icon icon-class="user" />
          </div>
          <div class="summary-meta flex-1 min-w-0">
            <div class="summary-label text-xs text-text-secondary mb-1">{{ t('myLogin.currentUser') }}</div>
            <div class="summary-value text-xl font-semibold text-text-primary leading-tight break-all">
              {{ userStore.name }}
            </div>
            <div class="summary-sub text-xs text-text-placeholder mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
              {{ t('myLogin.currentSession') }}: {{ currentSession?.loginTime || '-' }}
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="summary-card summary-total flex items-center p-4 mb-3 rounded-lg">
          <div class="summary-icon w-12 h-12 rounded-full flex items-center justify-center mr-3.5 shrink-0">
            <svg-icon icon-class="log" />
          </div>
          <div class="summary-meta flex-1 min-w-0">
            <div class="summary-label text-xs text-text-secondary mb-1">{{ t('myLogin.recentCount') }}</div>
            <div class="summary-value text-xl font-semibold text-text-primary leading-tight break-all">{{ total }}</div>
            <div class="summary-sub text-xs text-text-placeholder mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
              {{ t('myLogin.successFail', { success: successCount, fail: failCount }) }}
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card shadow="hover" class="summary-card summary-ips flex items-center p-4 mb-3 rounded-lg">
          <div class="summary-icon w-12 h-12 rounded-full flex items-center justify-center mr-3.5 shrink-0">
            <svg-icon icon-class="international" />
          </div>
          <div class="summary-meta flex-1 min-w-0">
            <div class="summary-label text-xs text-text-secondary mb-1">{{ t('myLogin.commonIps') }}</div>
            <div class="summary-value text-xl font-semibold text-text-primary leading-tight break-all">
              {{ uniqueIps.length }}
            </div>
            <div class="summary-sub text-xs text-text-placeholder mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
              {{ topIpsText }}
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="24" :sm="12" :md="6">
        <el-card
          shadow="hover"
          :class="[
            'summary-card flex items-center p-4 mb-3 rounded-lg',
            hasAnomaly ? 'summary-anomaly-warn' : 'summary-anomaly-ok'
          ]"
        >
          <div class="summary-icon w-12 h-12 rounded-full flex items-center justify-center mr-3.5 shrink-0">
            <svg-icon icon-class="bug" />
          </div>
          <div class="summary-meta flex-1 min-w-0">
            <div class="summary-label text-xs text-text-secondary mb-1">{{ t('myLogin.anomaly') }}</div>
            <div class="summary-value text-xl font-semibold text-text-primary leading-tight break-all">
              {{ hasAnomaly ? t('myLogin.anomalyYes') : t('myLogin.anomalyNo') }}
            </div>
            <div class="summary-sub text-xs text-text-placeholder mt-1 whitespace-nowrap overflow-hidden text-ellipsis">
              {{ anomalyText }}
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 异常登录提醒横幅 -->
    <Transition name="fade-slide">
      <el-alert
        v-if="hasAnomaly"
        :title="t('myLogin.anomalyBannerTitle')"
        :description="anomalyDetail"
        type="warning"
        show-icon
        :closable="false"
        class="anomaly-banner mb-4"
      />
    </Transition>

    <!-- 查询条件 -->
    <Transition name="expand-fade">
      <el-form
        :model="queryParams"
        ref="queryRef"
        :inline="true"
        v-show="showSearch"
        label-width="80px"
        class="query-form px-4 pt-4 rounded mb-3"
      >
        <el-form-item :label="t('myLogin.searchStatus')" prop="status">
          <el-select v-model="queryParams.status" :placeholder="t('myLogin.allStatus')" clearable class="w-[160px]">
            <el-option v-for="dict in sys_common_status" :key="dict.value" :label="dict.label" :value="dict.value" />
          </el-select>
        </el-form-item>
        <el-form-item :label="t('myLogin.searchTime')" class="w-[380px]">
          <el-date-picker
            v-model="dateRange"
            value-format="YYYY-MM-DD HH:mm:ss"
            type="daterange"
            range-separator="-"
            :start-placeholder="t('myLogin.startDate')"
            :end-placeholder="t('myLogin.endDate')"
            :default-time="[new Date(2000, 1, 1, 0, 0, 0), new Date(2000, 1, 1, 23, 59, 59)]"
          />
        </el-form-item>
        <el-form-item>
          <el-button type="primary" icon="Search" @click="handleQuery">{{ t('common.search') }}</el-button>
          <el-button icon="Refresh" @click="resetQuery">{{ t('common.reset') }}</el-button>
        </el-form-item>
      </el-form>
    </Transition>

    <!-- 操作按钮 -->
    <el-row :gutter="10" class="mb8">
      <el-col :span="1.5">
        <el-button type="warning" plain icon="Warning" @click="refreshAnalysis">{{ t('myLogin.reanalyze') }}</el-button>
      </el-col>
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList" />
    </el-row>

    <!-- 登录历史列表 -->
    <el-table v-loading="loading" :data="loginList" @sort-change="handleSortChange" highlight-current-row>
      <el-table-column :label="t('myLogin.columnTime')" align="center" prop="loginTime" width="170" sortable="custom" />
      <el-table-column :label="t('myLogin.columnStatus')" align="center" width="90" sortable="custom" prop="status">
        <template #default="scope">
          <el-tag :type="scope.row.status === '0' ? 'success' : 'danger'" size="small">
            {{ scope.row.status === '0' ? t('myLogin.success') : t('myLogin.failed') }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column :label="t('myLogin.columnIp')" align="center" prop="ipaddr" width="140" />
      <el-table-column
        :label="t('myLogin.columnLocation')"
        align="center"
        prop="loginLocation"
        show-overflow-tooltip
        min-width="140"
      />
      <el-table-column
        :label="t('myLogin.columnBrowser')"
        align="center"
        prop="browser"
        show-overflow-tooltip
        min-width="140"
      />
      <el-table-column :label="t('myLogin.columnOs')" align="center" prop="os" show-overflow-tooltip min-width="120" />
      <el-table-column
        :label="t('myLogin.columnMsg')"
        align="center"
        prop="msg"
        show-overflow-tooltip
        min-width="120"
      />
      <el-table-column :label="t('myLogin.columnSession')" align="center" width="100">
        <template #default="scope">
          <Transition mode="out-in" name="fade">
            <el-tag v-if="isCurrentSession(scope.row)" type="primary" size="small">
              {{ t('myLogin.sessionTag') }}
            </el-tag>
            <span v-else>-</span>
          </Transition>
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
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { list as listLogininfor } from '@/api/monitor/logininfor'
import type { SysLogininfor, TableDataInfo, LogininforQueryParams } from '@/types'
import useUserStore from '@/store/modules/user'
import { addDateRange } from '@/utils/stepby'
import modal from '@/plugins/modal'

const { t } = useI18n()
const userStore = useUserStore()
const { sys_common_status } = useDict('sys_common_status')
const queryRefRef = useTemplateRef('queryRef')

const loginList = shallowRef<SysLogininfor[]>([])
const loading = ref(true)
const showSearch = ref(true)
const total = ref(0)
const dateRange = ref<string[]>([])
const successCount = ref(0)
const failCount = ref(0)

const queryParams = reactive<LogininforQueryParams>({
  pageNum: 1,
  pageSize: 10,
  userName: userStore.name,
  status: undefined,
  orderByColumn: 'loginTime',
  isAsc: 'desc'
})

/** 当前会话标识（基于 IP + 浏览器 + 最近时间匹配） */
const currentSession = computed(() => loginList.value.find((r: SysLogininfor) => r.status === '0'))

/** 唯一 IP 列表 */
const uniqueIps = computed(() => {
  const set = new Set<string>()
  loginList.value.forEach((r: SysLogininfor) => r.ipaddr && set.add(r.ipaddr))
  return Array.from(set)
})

/** 最常用的 IP（取出现次数最多的前 2 个） */
const topIpsText = computed(() => {
  if (uniqueIps.value.length === 0) return '-'
  const counter: Record<string, number> = {}
  loginList.value.forEach((r: SysLogininfor) => {
    if (r.ipaddr) counter[r.ipaddr] = (counter[r.ipaddr] || 0) + 1
  })
  return Object.entries(counter)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 2)
    .map(([ip]) => ip)
    .join('、')
})

/** 异常登录检测 */
const hasAnomaly = computed(() => failCount.value >= 5 || uniqueIps.value.length > 5)
const anomalyText = computed(() =>
  hasAnomaly.value
    ? t('myLogin.anomalyTextWarn', { fail: failCount.value, ips: uniqueIps.value.length })
    : t('myLogin.anomalyTextOk')
)
const anomalyDetail = computed(() =>
  t('myLogin.anomalyBannerDetail', {
    total: total.value,
    fail: failCount.value,
    ips: uniqueIps.value.length
  })
)

/** 查询登录日志列表 */
async function getList(): Promise<void> {
  loading.value = true
  try {
    const params = addDateRange(queryParams, dateRange.value)
    const res: TableDataInfo<SysLogininfor> = await listLogininfor(params)
    loginList.value = res.rows || []
    total.value = res.total || 0
    successCount.value = loginList.value.filter((r: SysLogininfor) => r.status === '0').length
    failCount.value = loginList.value.filter((r: SysLogininfor) => r.status === '1').length
  } catch {
    // 静默处理错误
  } finally {
    loading.value = false
  }
}

/** 搜索 */
function handleQuery(): void {
  queryParams.pageNum = 1
  getList()
}

/** 重置 */
function resetQuery(): void {
  dateRange.value = []
  queryParams.status = undefined
  // 重置排序状态到默认值
  queryParams.orderByColumn = 'loginTime'
  queryParams.isAsc = 'desc'
  queryRefRef.value?.resetFields()
  handleQuery()
}

/** 排序变更 */
function handleSortChange(column: { prop: string | null; order: string | null }): void {
  // 排序被清除时（column.order === null），重置排序参数
  if (column.order === null) {
    queryParams.orderByColumn = undefined
    queryParams.isAsc = undefined
  } else {
    queryParams.orderByColumn = column.prop || 'loginTime'
    queryParams.isAsc = column.order === 'ascending' ? 'asc' : 'desc'
  }
  getList()
}

/** 是否当前会话 */
function isCurrentSession(row: SysLogininfor): boolean {
  if (!currentSession.value) return false
  return row === currentSession.value
}

/** 重新分析异常（重新查询） */
function refreshAnalysis(): void {
  getList()
  modal.msgSuccess(t('myLogin.reanalyzeSuccess'))
}

onMounted(async () => {
  await getList()
})
</script>

<style scoped>
.summary-card {
  border: none;
  transition: all 0.3s ease;
}

.summary-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 6px 16px rgba(0, 0, 0, 0.08);
}

.summary-icon {
  font-size: 22px;
  color: var(--el-color-white);
}

.summary-current .summary-icon {
  background: linear-gradient(135deg, #409eff, #66b1ff);
}

.summary-total .summary-icon {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}

.summary-ips .summary-icon {
  background: linear-gradient(135deg, #e6a23c, #f0b87a);
}

.summary-anomaly-ok .summary-icon {
  background: linear-gradient(135deg, #67c23a, #85ce61);
}

.summary-anomaly-warn .summary-icon {
  background: linear-gradient(135deg, #f56c6c, #f89898);
}

.summary-anomaly-warn {
  border-left: 4px solid var(--el-color-danger) !important;
}

.query-form {
  background: var(--el-bg-color);
}

:deep(html.dark) .summary-value {
  color: var(--el-text-color-primary);
}

:deep(html.dark) .summary-label,
:deep(html.dark) .summary-sub {
  color: var(--el-text-color-secondary);
}

:deep(.el-tag) {
  transition: all 0.2s ease;
}
</style>
