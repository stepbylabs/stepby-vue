<template>
  <div class="workbench-container app-container p-4" v-loading="loading">
    <!-- 欢迎卡片 -->
    <el-card class="welcome-card mb-4" shadow="hover">
      <div class="welcome-content flex justify-between items-center flex-wrap gap-4">
        <div class="welcome-left flex items-center gap-4">
          <el-avatar :size="64" :src="userStore.avatar || defaultAvatar" :alt="avatarAlt" @error="onAvatarError">
            <img :src="defaultAvatar" loading="lazy" :alt="avatarAlt" />
          </el-avatar>
          <div class="welcome-text">
            <h2 class="welcome-title m-0 mb-2 text-[22px] font-semibold text-text-primary">
              {{ greeting }}，{{ userStore.nickName || userStore.name }}
            </h2>
            <p class="welcome-sub m-0 text-[13px] text-text-regular flex items-center gap-1">
              <el-icon><Calendar /></el-icon>
              <span>{{ currentDate }}</span>
              <el-divider direction="vertical" />
              <el-icon><OfficeBuilding /></el-icon>
              <span>{{ userStore.deptName || t('workbench.noDept') }}</span>
              <el-divider direction="vertical" />
              <el-icon><User /></el-icon>
              <span>{{ roleText }}</span>
            </p>
          </div>
        </div>
        <div class="welcome-right flex gap-2 relative">
          <el-button type="primary" @click="goTo('/user/profile')">
            <el-icon><UserFilled /></el-icon>
            {{ t('workbench.profile') }}
          </el-button>
          <el-button @click="goTo('/system/notice-center')">
            <el-icon><Bell /></el-icon>
            {{ t('workbench.notices') }}
            <Transition name="fade">
              <el-badge v-if="unreadLoaded && unreadData.length > 0" :value="unreadData.length" class="welcome-badge" />
            </Transition>
          </el-button>
        </div>
      </div>
    </el-card>

    <!-- 三项网络统计的失败必须可见：值显示 `—`（不是 0），并给统一重试入口（b107） -->
    <el-alert v-if="statsFail" class="mb-4" type="warning" :closable="false" show-icon :title="statsFailHint">
      <el-button link type="primary" @click="reloadStats">{{ t('common.retry') }}</el-button>
    </el-alert>

    <!-- 我的统计卡片 -->
    <el-row :gutter="16" class="stats-row mb-4">
      <el-col :xs="12" :sm="12" :md="6" :lg="6">
        <!-- 统计卡片整块可点跳转：el-card 渲染成 div，不可聚焦 ⇒ 补 role/tabindex/键盘激活三件 -->
        <el-card
          class="stat-card stat-login cursor-pointer transition-all duration-300"
          shadow="hover"
          role="button"
          tabindex="0"
          @click="goTo('/monitor/logininfor')"
          @keydown.enter.prevent="goTo('/monitor/logininfor')"
          @keydown.space.prevent="goTo('/monitor/logininfor')"
        >
          <div class="stat-content flex items-center gap-4">
            <div class="stat-icon w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white">
              <el-icon><Histogram /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value text-[28px] font-bold text-text-primary leading-[1.2]">
                {{ weekLoginsLoaded ? weekLoginsData : '—' }}
              </div>
              <div class="stat-label text-[13px] text-text-secondary mt-1">{{ t('workbench.weekLogins') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6">
        <!-- 同上：未读通知统计卡片补齐键盘可达三件 -->
        <el-card
          class="stat-card stat-notice cursor-pointer transition-all duration-300"
          shadow="hover"
          role="button"
          tabindex="0"
          @click="goTo('/system/notice-center')"
          @keydown.enter.prevent="goTo('/system/notice-center')"
          @keydown.space.prevent="goTo('/system/notice-center')"
        >
          <div class="stat-content flex items-center gap-4">
            <div class="stat-icon w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white">
              <el-icon><Bell /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value text-[28px] font-bold text-text-primary leading-[1.2]">
                {{ unreadLoaded ? unreadData.length : '—' }}
              </div>
              <div class="stat-label text-[13px] text-text-secondary mt-1">{{ t('workbench.unreadNotices') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card stat-session non-clickable transition-all duration-300" shadow="hover">
          <div class="stat-content flex items-center gap-4">
            <div class="stat-icon w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white">
              <el-icon><Monitor /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value text-[28px] font-bold text-text-primary leading-[1.2]">
                {{ sessionsLoaded ? sessionsData : '—' }}
              </div>
              <div class="stat-label text-[13px] text-text-secondary mt-1">{{ t('workbench.activeSessions') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
      <el-col :xs="12" :sm="12" :md="6" :lg="6">
        <el-card class="stat-card stat-fav non-clickable transition-all duration-300" shadow="hover">
          <div class="stat-content flex items-center gap-4">
            <div class="stat-icon w-12 h-12 rounded-lg flex items-center justify-center text-2xl text-white">
              <el-icon><StarFilled /></el-icon>
            </div>
            <div class="stat-info">
              <div class="stat-value text-[28px] font-bold text-text-primary leading-[1.2]">{{ favoritesCount }}</div>
              <div class="stat-label text-[13px] text-text-secondary mt-1">{{ t('workbench.favorites') }}</div>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>

    <!-- 中部两列布局 -->
    <el-row :gutter="16" class="middle-row">
      <!-- 左列：最近访问 + 我的收藏 -->
      <el-col :xs="24" :md="14">
        <!-- 最近访问 -->
        <el-card class="section-card mb-4" shadow="never">
          <template #header>
            <div class="section-header flex justify-between items-center font-semibold">
              <span>
                <el-icon><Clock /></el-icon>
                {{ t('workbench.recentTitle') }}
              </span>
              <el-button text size="small" @click="clearRecent" :disabled="recent.recentViews.value.length === 0">
                <el-icon><Delete /></el-icon>
                {{ t('common.clear') }}
              </el-button>
            </div>
          </template>
          <Transition name="fade" mode="out-in">
            <div v-if="recent.recentViews.value.length === 0" key="empty" class="empty-tip py-4">
              <el-empty :description="t('workbench.recentEmpty')" :image-size="80" />
            </div>
            <div v-else key="list" class="recent-grid grid grid-cols-2 gap-2">
              <!-- 以下四组列表项（最近访问/收藏/未读通知/快捷入口）都是整行可跳转的 div：
                   统一补 role="button" + tabindex="0" + Enter/Space 激活三件，可访问名取行内文本 -->
              <div
                v-for="(item, idx) in recent.recentViews.value.slice(0, 8)"
                :key="item.path"
                class="recent-item flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer text-[13px]"
                role="button"
                tabindex="0"
                @click="goTo(item.fullPath)"
                @keydown.enter.prevent="goTo(item.fullPath)"
                @keydown.space.prevent="goTo(item.fullPath)"
              >
                <span
                  class="recent-idx inline-block w-5 h-5 leading-5 text-center rounded text-[12px] text-text-secondary shrink-0"
                >
                  {{ Number(idx) + 1 }}
                </span>
                <svg-icon v-if="item.icon" :icon-class="item.icon" class="recent-icon shrink-0 text-primary" />
                <span
                  class="recent-title flex-1 overflow-hidden text-ellipsis whitespace-nowrap"
                  :title="translateItemTitle(item)"
                >
                  {{ translateItemTitle(item) }}
                </span>
                <span class="recent-time shrink-0 text-[12px] text-text-placeholder">
                  {{ formatRelativeTime(item.visitedAt) }}
                </span>
              </div>
            </div>
          </Transition>
        </el-card>

        <!-- 我的收藏 -->
        <el-card class="section-card mb-4" shadow="never">
          <template #header>
            <div class="section-header flex justify-between items-center font-semibold">
              <span>
                <el-icon><StarFilled /></el-icon>
                {{ t('workbench.favTitle') }}
              </span>
              <el-button text size="small" @click="clearFav" :disabled="fav.favorites.value.length === 0">
                <el-icon><Delete /></el-icon>
                {{ t('common.clear') }}
              </el-button>
            </div>
          </template>
          <Transition name="fade" mode="out-in">
            <div v-if="fav.favorites.value.length === 0" key="empty" class="empty-tip py-4">
              <el-empty :description="t('workbench.favEmpty')" :image-size="80" />
            </div>
            <div v-else key="list" class="fav-grid grid grid-cols-4 gap-2">
              <div
                v-for="item in fav.favorites.value.slice(0, 8)"
                :key="item.path"
                class="fav-item flex flex-col items-center gap-1.5 py-3 px-2 rounded-md cursor-pointer text-center"
                role="button"
                tabindex="0"
                @click="goTo(item.path)"
                @keydown.enter.prevent="goTo(item.path)"
                @keydown.space.prevent="goTo(item.path)"
              >
                <svg-icon v-if="item.icon" :icon-class="item.icon" class="fav-icon text-2xl text-warning" />
                <span
                  class="fav-title text-xs text-text-regular overflow-hidden text-ellipsis whitespace-nowrap max-w-full"
                  :title="translateItemTitle(item)"
                >
                  {{ translateItemTitle(item) }}
                </span>
              </div>
            </div>
          </Transition>
        </el-card>
      </el-col>

      <!-- 右列：未读通知 + 快捷入口 -->
      <el-col :xs="24" :md="10">
        <!-- 未读通知 -->
        <el-card class="section-card mb-4" shadow="never">
          <template #header>
            <div class="section-header flex justify-between items-center font-semibold">
              <span>
                <el-icon><Bell /></el-icon>
                {{ t('workbench.unreadTitle') }}
              </span>
              <el-button text size="small" @click="goTo('/system/notice-center')">
                {{ t('workbench.viewAll') }}
              </el-button>
            </div>
          </template>
          <!-- 成功过再失败：列表保留但必须声明"是几点的数据"，而不是让它看起来像刚刷过（b108） -->
          <el-alert
            v-if="unreadError && unreadLoaded"
            class="mb-2"
            type="warning"
            :closable="false"
            show-icon
            :title="unreadStaleHint"
          />
          <Transition name="fade" mode="out-in">
            <div v-if="unreadError && !unreadLoaded" key="fail" class="empty-tip py-4">
              <el-empty :description="t('workbench.unreadLoadFail')" :image-size="80">
                <el-button link type="primary" @click="loadUnreadNotices">{{ t('common.retry') }}</el-button>
              </el-empty>
            </div>
            <div v-else-if="unreadData.length === 0" key="empty" class="empty-tip py-4">
              <el-empty :description="t('workbench.noUnread')" :image-size="80" />
            </div>
            <div v-else key="list" class="notice-list flex flex-col gap-1">
              <div
                v-for="notice in unreadData.slice(0, 5)"
                :key="notice.noticeId"
                class="notice-item flex items-center gap-2 py-2 px-3 rounded-md cursor-pointer"
                role="button"
                tabindex="0"
                @click="goToNotice(notice.noticeId)"
                @keydown.enter.prevent="goToNotice(notice.noticeId)"
                @keydown.space.prevent="goToNotice(notice.noticeId)"
              >
                <el-tag :type="notice.noticeType === '1' ? 'warning' : 'success'" size="small" effect="plain">
                  {{ notice.noticeType === '1' ? t('workbench.typeAnnouncement') : t('workbench.typeNotice') }}
                </el-tag>
                <span
                  class="notice-title flex-1 overflow-hidden text-ellipsis whitespace-nowrap text-[13px]"
                  :title="notice.noticeTitle"
                >
                  {{ notice.noticeTitle }}
                </span>
                <span class="notice-time shrink-0 text-[12px] text-text-placeholder">
                  {{ notice.createTime?.substring(5, 10) || '' }}
                </span>
              </div>
            </div>
          </Transition>
        </el-card>

        <!-- 快捷入口 -->
        <el-card class="section-card mb-4" shadow="never">
          <template #header>
            <div class="section-header flex justify-between items-center font-semibold">
              <span>
                <el-icon><Grid /></el-icon>
                {{ t('workbench.shortcutTitle') }}
              </span>
            </div>
          </template>
          <div class="shortcut-grid grid grid-cols-4 gap-2">
            <div
              v-for="shortcut in shortcuts"
              :key="shortcut.path"
              class="shortcut-item flex flex-col items-center gap-1.5 py-3 px-2 rounded-md cursor-pointer text-center transition-all duration-200 hover:-translate-y-1 hover:shadow-md"
              role="button"
              tabindex="0"
              @click="goTo(shortcut.path)"
              @keydown.enter.prevent="goTo(shortcut.path)"
              @keydown.space.prevent="goTo(shortcut.path)"
            >
              <el-icon class="shortcut-icon text-2xl text-primary"><component :is="shortcut.icon" /></el-icon>
              <span class="shortcut-label text-xs text-text-regular">{{ shortcut.label }}</span>
            </div>
          </div>
        </el-card>
      </el-col>
    </el-row>
  </div>
</template>

<script setup lang="ts" name="Workbench">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage, ElMessageBox } from 'element-plus'
import {
  Calendar,
  OfficeBuilding,
  User,
  UserFilled,
  Bell,
  Histogram,
  Monitor,
  StarFilled,
  Clock,
  Delete,
  Grid,
  Document,
  Setting,
  Lock,
  Edit
} from '@element-plus/icons-vue'
import useUserStore from '@/store/modules/user'
import useLockStore from '@/store/modules/lock'
import { useMenuFavorites } from '@/composables/useMenuFavorites'
import { useRecentViews } from '@/composables/useRecentViews'
import { useWidgetLoad } from '@/composables/useWidgetLoad'
import { translateTitle } from '@/composables/useMenuTitle'
import { listNoticeTop } from '@/api/system/notice'
import { list as listOnline } from '@/api/monitor/online'
import request from '@/utils/request'
import { formatClockTime } from '@/utils'
import defAva from '@/assets/images/profile.webp'
import type { SysNotice } from '@/types'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const userStore = useUserStore()
const fav = useMenuFavorites()
const recent = useRecentViews()

/** 翻译最近访问/收藏夹标题（优先 i18nKey，回退 title 原文，响应语言切换） */
function translateItemTitle(item: { title: string; i18nKey?: string }): string {
  return translateTitle({ title: item.title, i18nKey: item.i18nKey })
}

const loading = ref(false)
const currentDate = ref('')
const defaultAvatar = defAva

// 三项网络统计各自维护"是否成功过 / 是否最近失败"（b107）：
// 失败时值显示 `—` 而不是 0，并在页面顶部给统一重试入口——
// 否则服务抖动会看起来像"本周没人登录、没有未读、没有会话"。
const {
  data: weekLoginsData,
  loaded: weekLoginsLoaded,
  loadError: weekLoginsError,
  lastSuccessAt: weekLoginsLastSuccessAt,
  load: loadWeekLogins
} = useWidgetLoad<number>(async () => {
  const res = (await request({
    url: '/monitor/logininfor/stats?days=7',
    method: 'get'
  })) as { data?: Array<{ success: number; fail: number }> }
  return (res.data || []).reduce((sum, item) => sum + item.success + item.fail, 0)
}, 0)

const {
  data: unreadData,
  loaded: unreadLoaded,
  loadError: unreadError,
  lastSuccessAt: unreadLastSuccessAt,
  load: loadUnreadNotices
} = useWidgetLoad<SysNotice[]>(async () => {
  const res = await listNoticeTop()
  // listTop 返回 { data: [...], unreadCount: N }
  return res.data || []
}, [])

const {
  data: sessionsData,
  loaded: sessionsLoaded,
  loadError: sessionsError,
  lastSuccessAt: sessionsLastSuccessAt,
  load: loadActiveSessions
} = useWidgetLoad<number>(async () => {
  const res = await listOnline({ ipaddr: undefined, userName: userStore.name })
  return (res.rows || []).length
}, 0)

const statsFail = computed(() => weekLoginsError.value || unreadError.value || sessionsError.value)

// 三块里只要有一块从未成功过，横幅就说"部分统计加载失败"（那一块的值是 `—`，不能声称是某时刻的数据）；
// 三块都成功过再失败，才说得出"屏上是几点的数据"（取三块里最旧的那次，宁可把陈旧程度说重）（b108）
const statsNeverLoaded = computed(() => !weekLoginsLoaded.value || !unreadLoaded.value || !sessionsLoaded.value)
const statsFailHint = computed(() => {
  if (statsNeverLoaded.value) return t('workbench.statsPartialFail')
  const times = [weekLoginsLastSuccessAt.value, unreadLastSuccessAt.value, sessionsLastSuccessAt.value].filter(
    (v): v is number => v != null
  )
  return t('common.staleDataHintAt', { time: formatClockTime(times.length ? Math.min(...times) : null) })
})
const unreadStaleHint = computed(() =>
  t('common.staleDataHintAt', { time: formatClockTime(unreadLastSuccessAt.value) })
)
const favoritesCount = computed(() => fav.favorites.value.length)

function reloadStats(): void {
  void Promise.all([loadWeekLogins(), loadUnreadNotices(), loadActiveSessions()])
}

// 问候语（根据当前小时）
const greeting = computed(() => {
  const h = new Date().getHours()
  if (h < 6) return t('workbench.greetingNight')
  if (h < 9) return t('workbench.greetingMorning')
  if (h < 12) return t('workbench.greetingForenoon')
  if (h < 14) return t('workbench.greetingNoon')
  if (h < 18) return t('workbench.greetingAfternoon')
  return t('workbench.greetingEvening')
})

// 角色文本
const roleText = computed(() => {
  const roles = userStore.roles || []
  if (roles.length === 0) return t('workbench.noRole')
  return roles.join('、')
})

// 头像可访问名称（a11y：el-avatar 的 img 无 alt 会被 axe image-alt 判失败）
const avatarAlt = computed(() => t('layout.navbar.avatarAlt', { name: userStore.nickName || userStore.name }))

// 快捷入口（基于权限过滤）
const shortcuts = computed(() => {
  const list = [
    { path: '/user/profile', icon: User, label: t('workbench.shortcutProfile') },
    { path: '/system/notice-center', icon: Bell, label: t('workbench.shortcutNotice') },
    { path: '/monitor/logininfor', icon: Document, label: t('workbench.shortcutLogin') },
    { path: '/tool/shortcuts', icon: Grid, label: t('workbench.shortcutHotkey') },
    { path: '/tool/help', icon: Setting, label: t('workbench.shortcutHelp') },
    { path: '/tool/about', icon: Edit, label: t('workbench.shortcutAbout') },
    { path: '/lock', icon: Lock, label: t('workbench.shortcutLock') }
  ]
  return list
})

// 相对时间格式化
function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts
  if (diff < 60 * 1000) return t('workbench.justNow')
  if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + t('workbench.minutesAgo')
  if (diff < 24 * 60 * 60 * 1000) return Math.floor(diff / 3600000) + t('workbench.hoursAgo')
  if (diff < 7 * 24 * 60 * 60 * 1000) return Math.floor(diff / 86400000) + t('workbench.daysAgo')
  return new Date(ts).toLocaleDateString()
}

function goTo(path: string): void {
  // 锁屏快捷入口特殊处理：守卫在未锁定态会拒绝 /lock（permission.ts P0-62 防绕过），
  // 必须先置锁定态再跳转（对齐 Navbar.lockScreen 范式），否则点击后立即被弹回 /index（死入口）
  if (path === '/lock') {
    useLockStore().lockScreen(route.fullPath)
  }
  router.push(path).catch(() => {})
}

function goToNotice(noticeId: number): void {
  router.push({ path: '/system/notice-center', query: { id: String(noticeId) } }).catch(() => {})
}

function onAvatarError(e: Event): void {
  const img = e.target as HTMLImageElement
  if (img.src !== defAva) img.src = defAva
}

function updateCurrentDate(): void {
  const now = new Date()
  const weekKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat']
  const weekDay = t(`time.weekdays.${weekKeys[now.getDay()]}`)
  const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  currentDate.value = t('time.fullDateFormat', { date: dateStr, weekday: weekDay, time: timeStr })
}

let dateTimer: ReturnType<typeof setInterval> | null = null

async function clearRecent(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('workbench.clearRecentConfirm'), t('common.tip'), {
      type: 'warning'
    })
    // b126：存储写入失败时不得提示"清空成功"——刷新会把旧记录读回来，属于假成功
    if (recent.clearRecentViews()) {
      ElMessage.success(t('common.clearSuccess'))
    } else {
      ElMessage.error(t('common.clearFailed'))
    }
  } catch {
    // 用户取消，无需处理
  }
}

async function clearFav(): Promise<void> {
  try {
    await ElMessageBox.confirm(t('workbench.clearFavConfirm'), t('common.tip'), {
      type: 'warning'
    })
    if (fav.clearFavorites()) {
      ElMessage.success(t('common.clearSuccess'))
    } else {
      ElMessage.error(t('common.clearFailed'))
    }
  } catch {
    // 用户取消，无需处理
  }
}

onMounted(async () => {
  loading.value = true
  updateCurrentDate()
  dateTimer = setInterval(updateCurrentDate, 60 * 1000)
  await Promise.allSettled([loadUnreadNotices(), loadActiveSessions(), loadWeekLogins()])
  loading.value = false
})

onUnmounted(() => {
  if (dateTimer) {
    clearInterval(dateTimer)
    dateTimer = null
  }
})
</script>

<style lang="scss" scoped>
.workbench-container {
  .welcome-card {
    background: linear-gradient(
      135deg,
      var(--el-color-primary-light-9, #ecf5ff) 0%,
      var(--el-color-primary-light-8, #d9ecff) 100%
    );

    .welcome-text {
      .welcome-sub {
        .el-icon {
          margin-right: 2px;
        }

        .el-divider {
          margin: 0 8px;
        }
      }
    }

    .welcome-right {
      .welcome-badge {
        position: absolute;
        top: -8px;
        right: -8px;
      }
    }
  }

  .stats-row {
    .stat-card {
      &:hover {
        transform: translateY(-2px);
      }

      &.non-clickable {
        cursor: default;

        &:hover {
          transform: none;
        }
      }

      .stat-login .stat-icon {
        background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
      }
      .stat-notice .stat-icon {
        background: linear-gradient(135deg, var(--el-color-warning), var(--el-color-warning-light-3));
      }
      .stat-session .stat-icon {
        background: linear-gradient(135deg, var(--el-color-success), var(--el-color-success-light-3));
      }
      .stat-fav .stat-icon {
        background: linear-gradient(135deg, var(--el-color-danger), var(--el-color-danger-light-3));
      }
    }
  }

  .middle-row {
    .section-header {
      .el-icon {
        margin-right: 4px;
        vertical-align: middle;
      }
    }
  }

  .recent-item {
    transition: background 0.2s;

    &:hover {
      background: var(--el-fill-color-light, #f5f7fa);
    }

    .recent-idx {
      background: var(--el-fill-color, #f0f2f5);
    }
  }

  .fav-item {
    transition: all 0.2s;

    &:hover {
      background: var(--el-fill-color-light, #f5f7fa);
      transform: translateY(-1px);
    }
  }

  .notice-item {
    transition: background 0.2s;

    &:hover {
      background: var(--el-fill-color-light, #f5f7fa);
    }
  }

  .shortcut-item {
    transition: all 0.2s;

    &:hover {
      background: var(--el-fill-color-light, #f5f7fa);
      transform: translateY(-1px);
    }
  }
}

// 响应式适配
@media screen and (max-width: 768px) {
  .workbench-container {
    .welcome-card .welcome-content {
      flex-direction: column;
      align-items: stretch;
    }

    .recent-grid,
    .fav-grid,
    .shortcut-grid {
      grid-template-columns: 1fr;
    }
  }
}

// 暗色模式适配
:global(html.dark) .welcome-card {
  background: linear-gradient(
    135deg,
    var(--el-color-primary-dark-2, #1f3a5f) 0%,
    var(--el-color-primary-dark-3, #16304d) 100%
  );
}

/* 暗色模式下为头像添加亮色边框，提升与深色渐变背景的对比度 */
:global(html.dark) .welcome-left .el-avatar {
  border: 2px solid var(--el-border-color-light, #4c4d4f);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.08);
}

:global(html.dark) .welcome-title {
  color: var(--el-text-color-primary);
}

:global(html.dark) .welcome-sub {
  color: var(--el-text-color-secondary);
}

:global(html.dark) .stat-value {
  color: var(--el-text-color-primary);
}

:global(html.dark) .stat-label {
  color: var(--el-text-color-secondary);
}
</style>
