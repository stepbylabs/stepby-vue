<template>
  <div>
    <el-popover
      ref="noticePopover"
      placement="bottom-end"
      :width="320"
      trigger="manual"
      v-model:visible="noticeVisible"
      popper-class="notice-popover"
    >
      <!-- 弹出内容 -->
      <div class="notice-header">
        <span class="notice-title">{{ t('notice.title') }}</span>
        <span class="notice-mark-all" role="button" tabindex="0" @click="markAllRead" @keydown.enter="markAllRead">
          {{ t('noticeCenter.markAllRead') }}
        </span>
      </div>
      <!-- 注：保留 mode="out-in" 以保证 loading/empty/list 三态互不重叠。
           已知副作用：切到 list 瞬间内部 transition-group 的 enter 不会触发
           （因为外层 enter 完成后内层挂载已完成）。此处优先保证视觉清晰，
           牺牲列表项的进入动画。如需列表项淡入，可去掉 mode="out-in" 让
           loading 淡出与 list 淡入同步进行（但会有短暂重叠）。 -->
      <Transition mode="out-in" name="fade">
        <div v-if="noticeLoading" key="loading" class="notice-loading">
          <el-icon class="is-loading"><Loading /></el-icon>
          {{ t('common.loading') }}
        </div>
        <el-empty
          v-else-if="noticeList.length === 0"
          key="empty"
          :description="t('layout.headerNotice.empty')"
          :image-size="48"
        />
        <transition-group v-else name="list" tag="div" key="list">
          <div
            v-for="item in noticeList"
            :key="item.noticeId"
            class="notice-item"
            :class="{ 'is-read': item.isRead }"
            role="button"
            tabindex="0"
            :aria-label="item.noticeTitle"
            @click="previewNotice(item)"
            @keydown.enter.prevent="previewNotice(item)"
          >
            <el-tag size="small" :type="noticeTagType(item.noticeType)" class="notice-tag">
              {{ noticeTagLabel(item.noticeType) }}
            </el-tag>
            <span class="notice-item-title">{{ item.noticeTitle }}</span>
            <span class="notice-item-date">{{ item.createTime }}</span>
          </div>
        </transition-group>
      </Transition>

      <!-- 触发器 -->
      <template #reference>
        <div
          class="right-menu-item hover-effect notice-trigger"
          role="button"
          tabindex="0"
          :aria-label="
            unreadCount > 0
              ? t('layout.headerNotice.ariaWithUnread', { count: unreadCount })
              : t('layout.headerNotice.ariaNoUnread')
          "
          @mouseenter="onNoticeEnter"
          @mouseleave="onNoticeLeave"
          @click="toggleNotice"
          @keydown.enter.prevent="toggleNotice"
        >
          <svg-icon icon-class="bell" />
          <Transition name="fade">
            <span v-if="unreadCount > 0" class="notice-badge" aria-hidden="true">{{ unreadCount }}</span>
          </Transition>
        </div>
      </template>
    </el-popover>

    <!-- 预览弹窗 -->
    <notice-detail-view ref="noticeViewRef" />
  </div>
</template>

<script setup lang="ts">
import NoticeDetailView from './DetailView.vue'
import type { SysNotice } from '@/types/api/system/notice'
import useNotificationStore from '@/store/modules/notification'
import useNoticeStore from '@/store/modules/notice'
import modal from '@/plugins/modal'
// 动效优化：通知列表增删/已读时 FLIP 过渡（Vue 原生 transition-group，零依赖）

interface PopperElement extends HTMLElement {
  _noticeBound?: boolean
  _noticeMouseEnterHandler?: () => void
  _noticeMouseLeaveHandler?: () => void
}

const noticePopover = useTemplateRef<InstanceType<(typeof import('element-plus'))['ElPopover']>>('noticePopover')
const noticeViewRef = useTemplateRef('noticeViewRef')
const { t } = useI18n()
// P1 修复: 使用共享 notice store，确保 HeaderNotice 与 notice-center / notice CRUD 联动
const noticeStore = useNoticeStore()
// 直接订阅 store 状态，保持响应式
const noticeList = computed(() => noticeStore.topNotices)
const unreadCount = computed(() => noticeStore.unreadCount)
const noticeLoading = computed(() => noticeStore.loading)
const noticeVisible = ref<boolean>(false)
const noticeLeaveTimer = ref<ReturnType<typeof setTimeout> | null>(null)
// FE-004：保存 popper 元素引用，用于卸载时移除事件监听器
let boundPopper: PopperElement | null = null

// 通知类型与 DetailView 三元分类保持一致：1=通知、2=公告、3=消息
type ElTagType = '' | 'success' | 'info' | 'warning' | 'danger'
function noticeTagType(noticeType: string | undefined): ElTagType {
  if (noticeType === '1') return 'warning'
  if (noticeType === '2') return 'success'
  return 'info'
}
function noticeTagLabel(noticeType: string | undefined): string {
  if (noticeType === '1') return t('noticeCenter.typeNotice')
  if (noticeType === '2') return t('noticeCenter.typeAnnouncement')
  return t('noticeCenter.typeMessage')
}

onMounted(() => {
  // P1 修复: 仅在 store 未加载过时拉取，避免重复请求
  if (noticeStore.topNotices.length === 0 && !noticeStore.loading) {
    noticeStore.refreshTopNotices().catch(() => {})
  }
})

// P1-2: Esc 键关闭通知 popover（键盘可访问性）
function onNoticeKeydown(e: KeyboardEvent): void {
  if (e.key === 'Escape' && noticeVisible.value) {
    noticeVisible.value = false
  }
}

watch(noticeVisible, (visible: boolean) => {
  if (visible) {
    document.addEventListener('keydown', onNoticeKeydown)
    // P1 修复: 弹出时拉取最新状态，确保用户看到的是最新公告
    noticeStore.refreshTopNotices().catch(() => {})
  } else {
    document.removeEventListener('keydown', onNoticeKeydown)
  }
})

// FE-004：组件卸载时清理定时器和事件监听器，防止内存泄漏
onBeforeUnmount(() => {
  if (noticeLeaveTimer.value !== null) {
    clearTimeout(noticeLeaveTimer.value)
    noticeLeaveTimer.value = null
  }
  // P1-2: 清理 Esc 键监听器
  document.removeEventListener('keydown', onNoticeKeydown)
  if (boundPopper && boundPopper._noticeMouseEnterHandler && boundPopper._noticeMouseLeaveHandler) {
    boundPopper.removeEventListener('mouseenter', boundPopper._noticeMouseEnterHandler)
    boundPopper.removeEventListener('mouseleave', boundPopper._noticeMouseLeaveHandler)
    boundPopper._noticeBound = false
    boundPopper = null
  }
})

// 鼠标移入铃铛区域
function onNoticeEnter(): void {
  clearTimeout(noticeLeaveTimer.value ?? undefined)
  noticeVisible.value = true
  nextTick(() => {
    const popper = noticePopover.value?.popperRef?.contentRef as PopperElement | undefined
    if (popper && !popper._noticeBound) {
      popper._noticeBound = true
      popper._noticeMouseEnterHandler = () => clearTimeout(noticeLeaveTimer.value ?? undefined)
      popper._noticeMouseLeaveHandler = () => {
        noticeLeaveTimer.value = setTimeout(() => {
          noticeVisible.value = false
        }, 100)
      }
      popper.addEventListener('mouseenter', popper._noticeMouseEnterHandler)
      popper.addEventListener('mouseleave', popper._noticeMouseLeaveHandler)
      boundPopper = popper
    }
  })
}

// 键盘 Enter 切换可见性（无障碍支持）
function toggleNotice(): void {
  // U13 优化：用户首次点击/Enter 铃铛时按需请求浏览器通知权限（替代加载时自动请求）
  // 改为 click/Enter 触发，符合 Chrome 86+ user activation 策略
  if (!noticeVisible.value) {
    useNotificationStore()
      .requestBrowserPermission()
      .catch(() => {})
  }
  noticeVisible.value = !noticeVisible.value
}

// 鼠标离开铃铛区域
function onNoticeLeave(): void {
  noticeLeaveTimer.value = setTimeout(() => {
    noticeVisible.value = false
  }, 150)
}

// 预览公告详情
async function previewNotice(item: SysNotice): Promise<void> {
  // P1 修复: 通过 store 标记已读（乐观更新 + 失败回滚由 store 处理）
  if (!item.isRead && item.noticeId) {
    try {
      await noticeStore.markRead(item.noticeId)
    } catch {
      modal.msgError(t('noticeCenter.markReadFail'))
    }
  }
  noticeViewRef.value?.open(item.noticeId)
}

// 全部已读
async function markAllRead(): Promise<void> {
  // P1 修复: 使用服务端 markAllUnreadRead 接口，确保跨页未读也被清除
  // 原 markNoticeReadAll(ids) 仅能标记当前页可见的 ID，跨页未读会遗漏
  if (noticeStore.unreadCount === 0) return
  try {
    await noticeStore.markAllUnreadRead()
    modal.msgSuccess(t('noticeCenter.markAllReadSuccess'))
  } catch {
    // 失败时不改变本地状态，由拦截器统一提示
  }
}
</script>

<style lang="scss" scoped>
.notice-trigger {
  position: relative;
  transform: translateX(-6px);
  .svg-icon {
    width: 1.2em;
    height: 1.2em;
    vertical-align: -0.2em;
  }
  .notice-badge {
    position: absolute;
    top: 7px;
    right: -3px;
    background: var(--el-color-danger);
    color: var(--el-color-white);
    border-radius: 10px;
    font-size: 10px;
    height: 16px;
    line-height: 16px;
    padding: 0 4px;
    min-width: 16px;
    text-align: center;
    white-space: nowrap;
    pointer-events: none;
  }
}
.notice-popover {
  padding: 0 !important;
}
.notice-popover .notice-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
  font-size: 13px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}
.notice-popover .notice-mark-all {
  font-size: 12px;
  color: var(--el-color-primary);
  font-weight: normal;
  cursor: pointer;
}
.notice-popover .notice-mark-all:hover {
  color: var(--el-color-primary-light-3);
}
.notice-popover .notice-loading,
.notice-popover .notice-empty {
  padding: 24px;
  text-align: center;
  color: var(--el-text-color-secondary);
  font-size: 12px;
  line-height: 1.8;
}
.notice-popover .notice-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition:
    background 0.15s ease,
    opacity 0.2s ease,
    filter 0.2s ease;
}
.notice-popover .notice-item:last-child {
  border-bottom: none;
}
.notice-popover .notice-item:hover {
  background: var(--el-fill-color-light);
}
.notice-popover .notice-item.is-read .notice-tag,
.notice-popover .notice-item.is-read .notice-item-title,
.notice-popover .notice-item.is-read .notice-item-date {
  opacity: 0.45;
  filter: grayscale(1);
  color: var(--el-text-color-secondary);
}
.notice-popover .notice-tag {
  flex-shrink: 0;
}
.notice-popover .notice-item-title {
  flex: 1;
  font-size: 12px;
  color: var(--el-text-color-primary);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.notice-popover .notice-item-date {
  flex-shrink: 0;
  font-size: 11px;
  color: var(--el-text-color-secondary);
}
</style>
