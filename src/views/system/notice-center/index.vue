<template>
  <div class="app-container notice-center-container">
    <!-- 顶部统计卡片 -->
    <el-row :gutter="16" class="mb-4">
      <el-col v-motion="staggerChildren(0)" :xs="24" :sm="12" :md="8">
        <el-card
          shadow="hover"
          class="summary-card summary-unread flex items-center p-5 rounded-lg transition-all duration-200 hover:-translate-y-1"
        >
          <div class="summary-icon w-14 h-14 rounded-full flex items-center justify-center mr-4 text-[28px] text-white">
            <svg-icon icon-class="message" />
          </div>
          <div class="summary-meta flex-1">
            <div class="summary-label text-[13px] mb-1.5 text-text-secondary">{{ t('noticeCenter.unread') }}</div>
            <div class="summary-value text-[26px] font-semibold leading-[1.2] text-text-primary">{{ unreadCount }}</div>
            <div class="summary-sub text-xs mt-1">{{ t('noticeCenter.unreadTip') }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(1)" :xs="24" :sm="12" :md="8">
        <el-card
          shadow="hover"
          class="summary-card summary-total flex items-center p-5 rounded-lg transition-all duration-200 hover:-translate-y-1"
        >
          <div class="summary-icon w-14 h-14 rounded-full flex items-center justify-center mr-4 text-[28px] text-white">
            <svg-icon icon-class="list" />
          </div>
          <div class="summary-meta flex-1">
            <div class="summary-label text-[13px] mb-1.5 text-text-secondary">{{ t('noticeCenter.total') }}</div>
            <div class="summary-value text-[26px] font-semibold leading-[1.2] text-text-primary">{{ total }}</div>
            <div class="summary-sub text-xs mt-1">{{ t('noticeCenter.totalTip') }}</div>
          </div>
        </el-card>
      </el-col>
      <el-col v-motion="staggerChildren(2)" :xs="24" :sm="12" :md="8">
        <el-card
          shadow="hover"
          class="summary-card summary-read flex items-center p-5 rounded-lg transition-all duration-200 hover:-translate-y-1"
        >
          <div class="summary-icon w-14 h-14 rounded-full flex items-center justify-center mr-4 text-[28px] text-white">
            <svg-icon icon-class="checkbox" />
          </div>
          <div class="summary-meta flex-1">
            <div class="summary-label text-[13px] mb-1.5 text-text-secondary">{{ t('noticeCenter.read') }}</div>
            <div class="summary-value text-[26px] font-semibold leading-[1.2] text-text-primary">
              {{ Math.max(0, total - unreadCount) }}
            </div>
            <div class="summary-sub text-xs mt-1">{{ t('noticeCenter.readTip') }}</div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 操作工具栏 -->
    <el-card shadow="never" class="toolbar-card mb-4">
      <div class="toolbar flex justify-between items-center flex-wrap gap-3">
        <div class="toolbar-left flex items-center">
          <el-radio-group v-model="filterType" @change="handleFilterChange">
            <el-radio-button value="all">{{ t('noticeCenter.filterAll') }}</el-radio-button>
            <el-radio-button value="unread">
              {{ t('noticeCenter.filterUnread') }}
              <Transition name="fade">
                <el-badge v-if="unreadCount > 0" :value="unreadCount" class="filter-badge ml-1" />
              </Transition>
            </el-radio-button>
            <el-radio-button value="notice">{{ t('noticeCenter.filterNotice') }}</el-radio-button>
            <el-radio-button value="announcement">{{ t('noticeCenter.filterAnnouncement') }}</el-radio-button>
          </el-radio-group>
        </div>
        <div class="toolbar-right flex items-center gap-2 flex-wrap">
          <el-input
            v-model="queryParams.noticeTitle"
            :placeholder="t('noticeCenter.searchPlaceholder')"
            :maxlength="50"
            clearable
            class="w-[220px]"
            @keyup.enter="handleQuery"
            @clear="handleQuery"
          >
            <template #prefix>
              <svg-icon icon-class="search" />
            </template>
          </el-input>
          <el-button v-hasPermi="['system:notice:center:query', 'system:notice:list']" @click="handleQuery">
            <svg-icon icon-class="search" />
            {{ t('common.search') }}
          </el-button>
          <el-button @click="resetQuery">
            <svg-icon icon-class="refresh" />
            {{ t('common.reset') }}
          </el-button>
          <el-button
            v-hasPermi="['system:notice:center:markAllRead']"
            type="primary"
            :disabled="unreadCount === 0"
            :loading="markAllLoading"
            @click="handleMarkAllRead"
          >
            <svg-icon icon-class="checkbox" />
            {{ t('noticeCenter.markAllRead') }}
          </el-button>
          <el-button
            v-hasPermi="['system:notice:center:markBatchRead']"
            type="success"
            :disabled="selectedIds.length === 0"
            :loading="batchReadLoading"
            @click="handleBatchRead"
          >
            <svg-icon icon-class="checkbox" />
            {{ t('noticeCenter.batchRead') }} ({{ selectedIds.length }})
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 未读筛选提示（仅未读筛选模式下显示） -->
    <el-alert
      v-if="filterType === 'unread' && filteredNotices.length === 0 && !loading"
      v-motion="slideInRight"
      :title="t('noticeCenter.noUnreadTip')"
      type="success"
      show-icon
      :closable="false"
      class="mb-3"
    />

    <!-- 通知列表 -->
    <el-card shadow="never" class="list-card" v-loading="loading">
      <el-table
        :data="filteredNotices"
        :row-key="(row: SysNotice) => row.noticeId"
        @selection-change="handleSelectionChange"
        @row-click="handleRowClick"
      >
        <el-table-column type="selection" width="48" :selectable="canSelect" />
        <el-table-column :label="t('noticeCenter.colStatus')" width="90">
          <template #default="{ row }">
            <Transition name="fade">
              <el-tag v-if="!isRead(row)" key="unread" type="danger" size="small" effect="dark">
                {{ t('noticeCenter.unreadTag') }}
              </el-tag>
              <el-tag v-else key="read" type="info" size="small">
                {{ t('noticeCenter.readTag') }}
              </el-tag>
            </Transition>
          </template>
        </el-table-column>
        <el-table-column :label="t('noticeCenter.colType')" width="100">
          <template #default="{ row }">
            <el-tag :type="row.noticeType === '1' ? 'warning' : 'success'" size="small">
              {{ row.noticeType === '1' ? t('noticeCenter.typeNotice') : t('noticeCenter.typeAnnouncement') }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column prop="noticeTitle" :label="t('noticeCenter.colTitle')" min-width="280" show-overflow-tooltip>
          <template #default="{ row }">
            <span :class="{ 'font-semibold text-text-primary': !isRead(row) }">{{ row.noticeTitle }}</span>
          </template>
        </el-table-column>
        <el-table-column prop="createBy" :label="t('noticeCenter.colCreateBy')" width="120" />
        <el-table-column prop="createTime" :label="t('noticeCenter.colCreateTime')" width="170" />
        <el-table-column :label="t('common.column.operation')" width="160" align="center" fixed="right">
          <template #default="{ row }">
            <el-button
              v-if="!isRead(row)"
              v-hasPermi="['system:notice:center:markRead']"
              type="primary"
              link
              size="small"
              @click.stop="handleMarkRead(row)"
            >
              {{ t('noticeCenter.markRead') }}
            </el-button>
            <el-button
              v-hasPermi="['system:notice:center:query', 'system:notice:list']"
              type="info"
              link
              size="small"
              @click.stop="handleViewDetail(row)"
            >
              {{ t('common.detail') }}
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty :description="filterType === 'unread' ? t('noticeCenter.noUnreadTip') : t('common.empty')" />
        </template>
      </el-table>

      <pagination
        v-show="total > 0"
        :total="total"
        v-model:page="queryParams.pageNum"
        v-model:limit="queryParams.pageSize"
        @pagination="getList"
      />
    </el-card>

    <!-- 详情对话框 -->
    <el-dialog
      v-model="detailVisible"
      :title="t('noticeCenter.detailTitle')"
      width="min(80%, 720px)"
      append-to-body
      destroy-on-close
    >
      <Transition mode="out-in" name="fade-slide">
        <div v-if="currentNotice" :key="currentNotice?.noticeId" class="notice-detail">
          <h2 class="notice-detail-title m-0 mb-4 text-xl text-text-primary">{{ currentNotice.noticeTitle }}</h2>
          <div class="notice-detail-meta flex items-center gap-4 text-[13px] text-text-secondary">
            <el-tag :type="currentNotice.noticeType === '1' ? 'warning' : 'success'" size="small">
              {{ currentNotice.noticeType === '1' ? t('noticeCenter.typeNotice') : t('noticeCenter.typeAnnouncement') }}
            </el-tag>
            <span class="meta-item inline-flex">{{ t('noticeCenter.colCreateBy') }}: {{ currentNotice.createBy }}</span>
            <span class="meta-item inline-flex">
              {{ t('noticeCenter.colCreateTime') }}: {{ currentNotice.createTime }}
            </span>
          </div>
          <el-divider />
          <div
            class="notice-detail-content leading-[1.8] text-text-regular min-h-[120px]"
            v-html="sanitizeHtml(currentNotice.noticeContent || t('noticeCenter.noContent'))"
          ></div>
        </div>
      </Transition>
      <template #footer>
        <el-button @click="detailVisible = false">{{ t('common.close') }}</el-button>
        <el-button
          v-if="currentNotice && !isRead(currentNotice)"
          type="primary"
          @click="handleDialogMarkRead(currentNotice)"
        >
          {{ t('noticeCenter.markRead') }}
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import modal from '@/plugins/modal'
import { listNotice, getNotice } from '@/api/system/notice'
import useNoticeStore from '@/store/modules/notice'
import { useMotionPresets } from '@/composables/useMotion'
import { sanitizeHtml } from '@/utils/index'
import type { SysNotice } from '@/types'

const { t } = useI18n()
const { staggerChildren, slideInRight } = useMotionPresets()

// P1 修复: 使用共享 notice store，readIds / unreadCount 与 HeaderNotice 联动
const noticeStore = useNoticeStore()

const loading = ref(false)
const total = ref(0)
const noticeList = shallowRef<SysNotice[]>([])
// 订阅 store 的 unreadCount（跨组件同步）
const unreadCount = computed(() => noticeStore.unreadCount)
// 订阅 store 的 readIds（跨组件同步已读状态）
const readIds = computed(() => noticeStore.readIds)
const filterType = ref<'all' | 'unread' | 'notice' | 'announcement'>('all')
const selectedIds = ref<number[]>([])
const detailVisible = ref(false)
const currentNotice = ref<SysNotice | null>(null)
// P1 修复: 加载状态绑定到按钮，防止重复点击
const markAllLoading = ref(false)
const batchReadLoading = ref(false)

const queryParams = reactive({
  pageNum: 1,
  pageSize: 10,
  noticeTitle: undefined as string | undefined,
  noticeType: undefined as string | undefined,
  createBy: undefined as string | undefined
})

// P1 修复: 修正筛选与分页的不匹配
// - 'notice'/'announcement': 通过 queryParams.noticeType 走后端查询，分页准确
// - 'unread': 前端过滤当前页未读项（后端无 isRead 查询支持）
//   未读数仍由 store.unreadCount（全量）显示，分页只反映当前页未读项
const filteredNotices = computed(() => {
  if (filterType.value === 'unread') {
    return noticeList.value.filter((n: SysNotice) => !isRead(n))
  }
  // 'all' / 'notice' / 'announcement' 已通过后端查询过滤，直接返回当前页数据
  return noticeList.value
})

// 判断通知是否已读（从 store 订阅）
function isRead(notice: SysNotice): boolean {
  return readIds.value.has(notice.noticeId as number)
}

// 可选择行（已读行不可选，避免重复标记）
function canSelect(row: SysNotice): boolean {
  return !isRead(row)
}

// 获取列表数据
async function getList() {
  loading.value = true
  try {
    const res = await listNotice(queryParams)
    noticeList.value = res.rows || []
    total.value = res.total || 0
    // P1 修复: 同步 noticeStore 的 readIds（包含当前页可见的已读状态）
    // listNotice 返回的每条记录带 isRead 字段，将其合并到 store
    const newReadIds = new Set(noticeStore.readIds)
    for (const item of noticeList.value) {
      if (item.isRead && item.noticeId != null) {
        newReadIds.add(item.noticeId)
      }
    }
    noticeStore.readIds = newReadIds
  } catch (e) {
    if (import.meta.env.DEV) console.error('Failed to load notices:', e)
  } finally {
    loading.value = false
  }
}

// 查询
function handleQuery() {
  queryParams.pageNum = 1
  getList()
}

// 重置
function resetQuery() {
  queryParams.noticeTitle = undefined
  queryParams.noticeType = undefined
  queryParams.createBy = undefined
  filterType.value = 'all'
  handleQuery()
}

// P1 修复: 筛选类型变化
// - 'notice'/'announcement' 走后端查询，分页准确
// - 'unread' 仅前端过滤当前页（后端不支持 isRead 查询）
function handleFilterChange() {
  if (filterType.value === 'notice') {
    queryParams.noticeType = '1'
  } else if (filterType.value === 'announcement') {
    queryParams.noticeType = '2'
  } else {
    // 'all' / 'unread'：清空 noticeType，避免后端过滤干扰
    queryParams.noticeType = undefined
  }
  // 重新查询（'unread' 也重新拉取全部数据后前端过滤）
  queryParams.pageNum = 1
  getList()
}

// 选择行变化
function handleSelectionChange(selection: SysNotice[]) {
  selectedIds.value = selection.map((n) => n.noticeId as number)
}

// 标记单条已读
async function handleMarkRead(row: SysNotice) {
  if (!row.noticeId) return
  try {
    // P1 修复: 通过 store 标记已读（自动更新 readIds + unreadCount + topNotices）
    await noticeStore.markRead(row.noticeId)
    // 同步更新当前页列表项的 isRead 字段（影响 canSelect / 模板渲染）
    const idx = noticeList.value.findIndex((n: SysNotice) => n.noticeId === row.noticeId)
    if (idx !== -1) {
      noticeList.value[idx] = { ...noticeList.value[idx], isRead: true }
    }
    modal.msgSuccess(t('common.success'))
  } catch {
    modal.msgError(t('common.failed'))
  }
}

// 对话框内标记已读后关闭对话框
async function handleDialogMarkRead(row: SysNotice) {
  await handleMarkRead(row)
  detailVisible.value = false
}

// 批量标记已读
async function handleBatchRead() {
  if (selectedIds.value.length === 0) return
  batchReadLoading.value = true
  try {
    await modal.confirm(t('noticeCenter.batchReadConfirm', { count: selectedIds.value.length }))
    // P1 修复: 通过 store 批量标记已读（自动更新 readIds + unreadCount + topNotices）
    await noticeStore.markBatchRead(selectedIds.value)
    // 同步更新当前页列表项的 isRead 字段
    const idSet = new Set(selectedIds.value)
    noticeList.value = noticeList.value.map((n: SysNotice) =>
      idSet.has(n.noticeId as number) ? { ...n, isRead: true } : n
    )
    selectedIds.value = []
    modal.msgSuccess(t('common.success'))
  } catch (e) {
    if (e !== 'cancel') {
      modal.msgError(t('common.failed'))
    }
  } finally {
    batchReadLoading.value = false
  }
}

// 全部标记已读
async function handleMarkAllRead() {
  if (unreadCount.value === 0) return
  markAllLoading.value = true
  try {
    await modal.confirm(t('noticeCenter.markAllReadConfirm'))
    // P1 修复: 使用服务端 markAllUnreadRead 接口，跨页未读也会被标记
    // 原 markNoticeReadAll(ids) 仅能标记当前页 IDs，跨页未读会遗漏
    const count = await noticeStore.markAllUnreadRead()
    // 同步更新当前页列表项的 isRead 字段
    noticeList.value = noticeList.value.map((n: SysNotice) => ({ ...n, isRead: true }))
    modal.msgSuccess(
      count > 0 ? t('noticeCenter.markAllReadSuccessCount', { count }) : t('noticeCenter.markAllReadSuccess')
    )
  } catch (e) {
    if (e !== 'cancel') {
      modal.msgError(t('common.failed'))
    }
  } finally {
    markAllLoading.value = false
  }
}

// 查看详情
async function handleViewDetail(row: SysNotice) {
  try {
    const res = await getNotice(row.noticeId!)
    currentNotice.value = res.data
    detailVisible.value = true
    // 如果未读，自动标记为已读
    if (!isRead(row)) {
      await handleMarkRead(row)
    }
  } catch {
    modal.msgError(t('common.failed'))
  }
}

// 点击行查看详情（排除 checkbox 列点击，避免与选择冲突）
function handleRowClick(row: SysNotice, column: { property?: string; label?: string }) {
  // 点击选择列（property 为 undefined）或操作列时不触发详情查看
  if (!column || column.property === undefined) return
  handleViewDetail(row)
}

onMounted(() => {
  getList()
})
</script>

<style lang="scss" scoped>
/* 覆盖 .app-container 的 padding: 20px（需 scoped 优先级） */
.notice-center-container {
  padding: 16px;
}

.summary-card {
  transition: all 0.3s ease;

  .summary-sub {
    color: var(--el-text-color-placeholder);
  }

  &.summary-unread .summary-icon {
    background: linear-gradient(135deg, #f56c6c, #f78989);
  }

  &.summary-total .summary-icon {
    background: linear-gradient(135deg, #409eff, #66b1ff);
  }

  &.summary-read .summary-icon {
    background: linear-gradient(135deg, #67c23a, #85ce61);
  }
}

/* 通知列表表格行 hover/状态切换过渡（标记已读时渐隐效果） */
:deep(.el-table__row) {
  transition:
    background-color 0.3s ease,
    opacity 0.3s ease,
    transform 0.2s ease;
}

/* 状态标签切换过渡 */
:deep(.el-tag) {
  transition: all 0.2s ease;
}

.filter-badge {
  :deep(.el-badge__content) {
    font-size: 11px;
  }
}

.notice-detail {
  .notice-detail-content {
    :deep(p) {
      margin: 8px 0;
    }
  }
}

// 响应式适配
@media screen and (max-width: 768px) {
  .toolbar {
    flex-direction: column;
    align-items: stretch !important;

    .toolbar-left,
    .toolbar-right {
      justify-content: center;
    }
  }
}

// 暗色模式适配：summary-sub 在暗色模式下使用 secondary 色而非 placeholder 色
html.dark .summary-sub {
  color: var(--el-text-color-secondary);
}
</style>
