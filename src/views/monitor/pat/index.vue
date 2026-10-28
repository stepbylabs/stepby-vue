<template>
  <div class="app-container">
    <el-alert :title="t('pat.admin.tip')" type="info" :closable="false" show-icon class="mb8" />

    <el-form :model="queryParams" ref="queryRef" :inline="true" v-show="showSearch" label-width="80px">
      <el-form-item :label="t('pat.admin.column.userName')" prop="userId">
        <el-input
          v-model="userIdInput"
          :aria-label="t('pat.admin.column.userName')"
          :placeholder="t('pat.admin.phUserId')"
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

    <el-row :gutter="10" class="mb8">
      <right-toolbar v-model:showSearch="showSearch" @queryTable="getList"></right-toolbar>
    </el-row>

    <Transition name="fade" mode="out-in">
      <SkeletonTable v-if="loading" :columns="8" :rows="8" />
      <el-table v-else v-loading="loading" :data="tokenList" :row-key="(row: SysPat) => row.patId">
        <el-table-column :label="t('pat.column.name')" prop="name" min-width="120" show-overflow-tooltip />
        <el-table-column :label="t('pat.column.token')" prop="tokenPrefix" width="130">
          <template #default="scope">
            <code class="font-mono text-xs">{{ scope.row.tokenPrefix }}…</code>
          </template>
        </el-table-column>
        <el-table-column :label="t('pat.admin.column.userName')" prop="userName" width="120" show-overflow-tooltip />
        <el-table-column :label="t('pat.column.scopes')" min-width="200">
          <template #default="scope">
            <el-tag
              v-for="s in displayScopes(scope.row.scopes)"
              :key="s"
              size="small"
              class="my-[2px] mr-1"
              :type="s === '*:*:*' ? 'danger' : 'info'"
            >
              {{ scopeLabel(s) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('pat.column.status')" width="90" align="center">
          <template #default="scope">
            <el-tag v-if="isRevoked(scope.row.status)" type="info" size="small">{{ t('pat.status.revoked') }}</el-tag>
            <el-tag v-else type="success" size="small">{{ t('pat.status.active') }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column :label="t('pat.column.expiresAt')" width="140" align="center">
          <template #default="scope">
            <el-tag
              v-if="!isRevoked(scope.row.status)"
              :type="expiryTagType(expiryInfo(scope.row).status)"
              size="small"
            >
              {{ expiryText(scope.row) }}
            </el-tag>
            <span v-else>-</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('pat.column.lastUsedAt')" width="170" align="center">
          <template #default="scope">
            <span>{{ scope.row.lastUsedAt ? parseTime(scope.row.lastUsedAt) : t('pat.neverUsed') }}</span>
          </template>
        </el-table-column>
        <el-table-column :label="t('pat.column.createTime')" width="170" align="center">
          <template #default="scope">
            <span>{{ parseTime(scope.row.createTime) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          :label="t('pat.column.operation')"
          width="90"
          align="center"
          class-name="small-padding fixed-width"
        >
          <template #default="scope">
            <el-button
              v-if="!isRevoked(scope.row.status)"
              link
              type="danger"
              icon="Delete"
              @click="handleRevoke(scope.row)"
              v-hasPermi="['monitor:pat:revoke']"
            >
              {{ t('pat.btn.revoke') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <!-- 失败/空态分形（ListEmpty 单一实现）：本页手写 getList，用本地 loadError 接同一组件 -->
          <list-empty :load-error="loadError" @retry="getList" />
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
  </div>
</template>

<script setup lang="ts" name="Pat">
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus'
import SkeletonTable from '@/components/SkeletonTable/index.vue'
import { listPat, revokePat } from '@/api/monitor/pat'
import type { SysPat } from '@/types/api/monitor/pat'
import { useAutoRefresh } from '@/composables/useAutoRefresh'
import { useMobileFilter } from '@/composables/useMobileFilter'
import { createLatestGuard } from '@/composables/latestRequest'
import { pageAfterEmptyResult } from '@/composables/useCrudTable'
import { isRevoked, computeExpiryInfo, expiryTagType, summarizeScopes, type ExpiryStatus } from '@/utils/patUtils'

const { t } = useI18n()
const queryRef = useTemplateRef<FormInstance>('queryRef')

const loading = ref(false)
/** 列表请求守卫：连点搜索/翻页时只让最后一次请求的结局生效（b119） */
const listGuard = createLatestGuard()
const showSearch = ref(true)
// G-15a：移动端筛选收纳（<768 默认收起，断点跨越联动；桌面行为不变）
useMobileFilter(showSearch)
const tokenList = ref<SysPat[]>([])
const total = ref(0)
// 列表失败态（与 useCrudTable.loadError 同语义，本页手写取数故为本地 ref）
const loadError = ref(false)
const userIdInput = ref('')
const queryParams = reactive({ pageNum: 1, pageSize: 10 })

function getList(): void {
  const ticket = listGuard.begin()
  loading.value = true
  const uid = userIdInput.value.trim()
  const params: Record<string, unknown> = { pageNum: queryParams.pageNum, pageSize: queryParams.pageSize }
  if (uid && !Number.isNaN(Number(uid))) params.userId = Number(uid)
  listPat(params as never)
    .then((res) => {
      if (!listGuard.isCurrent(ticket)) return
      const nextPage = pageAfterEmptyResult(queryParams.pageNum, res.rows?.length ?? 0, res.total ?? 0)
      if (nextPage !== queryParams.pageNum) {
        queryParams.pageNum = nextPage
        getList()
        return
      }
      loadError.value = false
      tokenList.value = res.rows || []
      total.value = res.total || 0
    })
    // 失败不再静默吞成空列表：置 loadError，空态显示「加载失败 + 重试」
    .catch(() => {
      if (listGuard.isCurrent(ticket)) loadError.value = true
    })
    .finally(() => {
      if (listGuard.isCurrent(ticket)) loading.value = false
    })
}

function handleQuery(): void {
  queryParams.pageNum = 1
  getList()
}
function resetQuery(): void {
  userIdInput.value = ''
  queryRef.value?.resetFields()
  handleQuery()
}

function scopeLabel(scope: string): string {
  return scope === '*:*:*' ? t('pat.scopeAll') : scope
}
function displayScopes(scopes: string[]): string[] {
  return summarizeScopes(scopes || []).list
}
function expiryInfo(row: SysPat): { status: ExpiryStatus; days: number | null } {
  return computeExpiryInfo(row.expiresAt)
}
function expiryText(row: SysPat): string {
  const { status, days } = expiryInfo(row)
  if (status === 'never') return t('pat.expiry.never')
  if (status === 'expired') return t('pat.expiry.expired')
  if (status === 'soon') return t('pat.expiry.soon', { days })
  return t('pat.expiry.active', { days })
}

function handleRevoke(row: SysPat): void {
  ElMessageBox.confirm(t('pat.msg.revokeConfirm', { name: row.name }), t('common.warning'), {
    confirmButtonText: t('common.confirm'),
    cancelButtonText: t('common.cancel'),
    type: 'warning'
  })
    .then(() => revokePat(row.patId))
    .then(() => {
      ElMessage.success(t('pat.msg.revoked'))
      getList()
    })
    .catch(() => {})
}

getList()
useAutoRefresh(getList)
</script>
