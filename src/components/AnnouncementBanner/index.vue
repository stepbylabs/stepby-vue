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
      <el-icon
        class="banner-close cursor-pointer text-sm p-1 rounded transition-colors duration-200 hover:bg-black/5"
        @click="dismiss"
      >
        <Close />
      </el-icon>
    </div>
  </transition>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
const { t } = useI18n()
import { WarningFilled, InfoFilled, SuccessFilled, Close } from '@element-plus/icons-vue'
import { listNotice } from '@/api/system/notice'
import cache from '@/plugins/cache'
import { navigate } from '@/utils/navigation'

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

onMounted(async () => {
  await loadAnnouncement()
})

async function loadAnnouncement() {
  try {
    // 拉取公告类型（notice_type='F'）的最新 1 条
    const res = await listNotice({ noticeType: 'F', status: '0', pageNum: 1, pageSize: 1 })
    const rows = res.rows || []
    if (rows.length === 0) return
    const notice = rows[0]
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
      if (elapsed < props.dismissHours * 3600 * 1000) return
    }
    visible.value = true
  } catch (e) {
    // 静默失败，不影响主流程
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

.banner-slide-down-enter-from,
.banner-slide-down-leave-to {
  opacity: 0;
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
}
</style>
