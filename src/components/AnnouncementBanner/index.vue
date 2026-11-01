<template>
  <transition name="banner-slide-down">
    <div
      v-if="visible"
      class="announcement-banner flex items-center justify-between py-2 px-5 text-[13px] border-b border-transparent"
      :class="`banner-${severity}`"
    >
      <div class="banner-content flex items-center gap-2 flex-1 min-w-0">
        <el-icon class="banner-icon text-base shrink-0">
          <component :is="iconMap[severity]" />
        </el-icon>
        <span class="banner-text truncate">{{ message }}</span>
        <el-button v-if="noticeId" link type="primary" class="banner-link ml-2 shrink-0" @click="handleLink">
          {{ t('announcementBanner.viewDetails') }}
        </el-button>
      </div>
      <!-- 关闭按钮：原先是挂 @click 的 el-icon（渲染成 <i>）——只有指针通道，键盘 Tab 不到、
           回车也没反应（b89 项 9 扩面后才被静态守卫看见）。改成原生 button + el-icon，
           语义、焦点环与读屏可访问名一并到位；视觉沿用同一组工具类。 -->
      <button
        type="button"
        class="banner-close inline-flex items-center justify-center cursor-pointer text-sm p-1 rounded border-0 bg-transparent text-inherit transition-colors duration-200 hover:bg-black/5"
        :aria-label="t('announcementBanner.dismissAriaLabel')"
        @click="dismiss"
      >
        <el-icon><Close /></el-icon>
      </button>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
const { t } = useI18n()
import { WarningFilled, InfoFilled, SuccessFilled, Close } from '@element-plus/icons-vue'
import { listNotice } from '@/api/system/notice'
import cache from '@/plugins/cache'
import { navigate } from '@/utils/navigation'
import useNotificationStore from '@/store/modules/notification'
import { createLatestGuard } from '@/composables/latestRequest'

interface Props {
  /** 显示时长（小时），超过则不再显示，0 表示每次都显示 */
  dismissHours?: number
}

const props = withDefaults(defineProps<Props>(), {
  dismissHours: 24
})

const visible = ref(false)
const message = ref('')
const noticeId = ref<number | null>(null)
const severity = ref<'info' | 'warning' | 'success'>('info')

const iconMap = {
  info: InfoFilled,
  warning: WarningFilled,
  success: SuccessFilled
}

const DISMISS_KEY = 'announcement-banner-dismissed'

const notificationStore = useNotificationStore()
// 后发先回守卫（b119 单一实现）：公告变更可能连发（发布后紧接着被改/被删），早发的响应不得覆盖晚发的
const loadGuard = createLatestGuard()

onMounted(async () => {
  await loadAnnouncement()
})

// b116：公告数据变更（WS notice 帧 / 重连后补帧）时重取"最新一条公告"。
// 只认这个信号、不监听通用刷新：铃铛弹层打开、标记已读等也会刷新顶部公告，
// 若一并跟随，全站每次导航会多打一次 pageSize=1 请求（request-storm 记成密度退步）。
watch(
  () => notificationStore.noticeEventSeq,
  () => {
    void loadAnnouncement()
  }
)

function hideBanner() {
  visible.value = false
  message.value = ''
  noticeId.value = null
}

async function loadAnnouncement() {
  const ticket = loadGuard.begin()
  try {
    // 拉取"公告"类型（notice_type='2'、status='0'）的**最新** 1 条。
    // 改造前这里写的是 noticeType='F'——公告类型只有 '1'/'2'，'F' 永不命中，
    // 于是横幅**从来没有内容可显示**（假功能），而 e2e 25.8 的旧判据 `rows >= 0` 恒真看不见它；
    // 同时缺排序 ⇒ 默认 notice_id ASC 取到的是"最旧"一条，与注释里的"最新"相反。
    // status='0' 此前也被后端静默丢弃（DTO 无该字段），b80 起才真正生效。
    const res = await listNotice({
      noticeType: '2',
      status: '0',
      pageNum: 1,
      pageSize: 1,
      orderByColumn: 'createTime',
      isAsc: 'desc'
    })
    if (!loadGuard.isCurrent(ticket)) return
    const notice = (res.rows || [])[0]
    // 最新公告被删除/关闭（或从未有过）：必须收回横幅，
    // 否则屏幕上留着一条已不存在的公告，且"查看详情"会跳到查不到它的列表。
    if (!notice) {
      hideBanner()
      return
    }
    noticeId.value = notice.noticeId
    message.value = notice.noticeTitle || notice.noticeContent || ''
    // 简单判断严重级别（标题含"紧急/重要/警告"使用 warning）
    severity.value = /紧急|重要|警告|alert|urgent|important|warning|critical/i.test(notice.noticeTitle || '')
      ? 'warning'
      : 'info'
    // 检查是否在 dismiss 时效内
    const dismissed = cache.local.getJSON(DISMISS_KEY) as { noticeId?: number; at?: number } | null
    if (dismissed && dismissed.noticeId === notice.noticeId) {
      const elapsed = Date.now() - (dismissed.at ?? 0)
      if (elapsed < props.dismissHours * 3600 * 1000) {
        // 回落到一条已被用户关闭过的公告时也要收回：留着的是上一条的旧文案
        hideBanner()
        return
      }
    }
    visible.value = true
  } catch (e) {
    if (!loadGuard.isCurrent(ticket)) return
    // 保留上一次成功的内容（失败清空会把"曾经有公告"变成"没有公告"），仅留痕
    if (import.meta.env.DEV) console.warn('Failed to load announcements:', e)
  }
}

function dismiss() {
  visible.value = false
  if (noticeId.value) {
    cache.local.setJSON(DISMISS_KEY, { noticeId: noticeId.value, at: Date.now() })
  }
}

function handleLink() {
  // 跳转到通知公告页面
  if (noticeId.value) {
    navigate('/system/notice')
  }
}
</script>

<style lang="scss" scoped>
.banner-info {
  background: linear-gradient(
    90deg,
    var(--el-color-primary-light-9, #ecf5ff) 0%,
    var(--el-color-primary-light-8, #f0f9ff) 100%
  );
  color: var(--el-color-primary);
  border-bottom-color: var(--el-color-primary-light-7);
}

.banner-warning {
  background: linear-gradient(
    90deg,
    var(--el-color-warning-light-9, #fdf6ec) 0%,
    var(--el-color-danger-light-9, #fef0f0) 100%
  );
  color: var(--el-color-warning);
  border-bottom-color: var(--el-color-warning-light-7);
}

.banner-success {
  background: linear-gradient(
    90deg,
    var(--el-color-success-light-9, #f0f9ff) 0%,
    var(--el-color-success-light-8, #f4f9f4) 100%
  );
  color: var(--el-color-success);
  border-bottom-color: var(--el-color-success-light-7);
}

.banner-slide-down-enter-active,
.banner-slide-down-leave-active {
  transition: all 0.3s ease;
  max-height: 50px;
  overflow: hidden;
}

/* 淡出期间的横幅已经不含任何有效处理器（组件在 leave 开始时就卸载），
   但它仍占着 50px 并可被命中 ⇒ 压掉指针事件，让点击落到下面的页面（b131 同族）。 */
.banner-slide-down-leave-active {
  pointer-events: none;
}

.banner-slide-down-enter-from,
.banner-slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
