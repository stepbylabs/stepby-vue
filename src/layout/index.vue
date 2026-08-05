<template>
  <div
    :class="classObj"
    class="app-wrapper relative h-full w-full"
    :style="{
      '--current-color': theme,
      '--current-color-light': theme + '1a',
      '--current-color-dark-bg': theme + '33'
    }"
    v-watermark="watermarkValue"
  >
    <!-- 无障碍：跳过导航到主内容 -->
    <a href="#main-content" class="skip-link">{{ safeT('layout.navbar.skipToContent') }}</a>
    <Transition name="fade">
      <div
        v-if="device === 'mobile' && sidebar.opened"
        class="drawer-bg w-full h-full absolute top-0"
        @click="handleClickOutside"
      />
    </Transition>
    <Transition name="expand-fade">
      <Sidebar v-if="!sidebar.hide" key="sidebar" class="sidebar-container" />
    </Transition>
    <div :class="{ hasTagsView: needTagsView, sidebarHide: sidebar.hide }" class="main-container">
      <div :class="{ 'fixed-header': fixedHeader }">
        <!-- 系统公告横幅 -->
        <announcement-banner />
        <navbar @setLayout="setLayout" />
        <Transition name="expand-fade">
          <tags-view v-if="needTagsView" key="tags-view" />
        </Transition>
      </div>
      <app-main />
      <settings ref="settingRef" />
    </div>
    <!-- 新手引导 Tour -->
    <Tour v-model:visible="tourVisible" :steps="tourSteps" storage-key="yebot-layout-tour" />
    <!-- 任务进度浮层（监听 WS taskProgress 事件） -->
    <TaskProgress />
  </div>
</template>

<script setup lang="ts">
import { useWindowSize } from '@vueuse/core'
import Sidebar from './components/Sidebar/index.vue'
import { AppMain, Navbar, Settings, TagsView } from './components'
import AnnouncementBanner from '@/components/AnnouncementBanner/index.vue'
import TaskProgress from '@/components/TaskProgress/index.vue'
import useAppStore from '@/store/modules/app'
import useSettingsStore from '@/store/modules/settings'
import useUserStore from '@/store/modules/user'
import { goLogin } from '@/utils/navigation'
import useNotificationStore from '@/store/modules/notification'
import { useGlobalHotkeys } from '@/composables/useGlobalHotkeys'
import { useRecentViews } from '@/composables/useRecentViews'
import { translateTitle } from '@/composables/useMenuTitle'
import { useFaviconBadge } from '@/composables/useFaviconBadge'
import { useSessionTimeout } from '@/composables/useSessionTimeout'
import { safeT } from '@/utils/safeI18n'
import { wsService, type WsMessage } from '@/utils/websocket'
import Tour from '@/components/Tour/index.vue'
import type { TourStep } from '@/components/Tour/index.vue'
import { ElMessage } from 'element-plus'
import cache from '@/plugins/cache'
import useDictStore from '@/store/modules/dict'

const settingsStore = useSettingsStore()
const appStore = useAppStore()
const theme = computed(() => settingsStore.theme)
const sidebar = computed(() => appStore.sidebar)
const device = computed(() => appStore.device)
const needTagsView = computed(() => settingsStore.tagsView)
const fixedHeader = computed(() => settingsStore.fixedHeader)
const route = useRoute()

// TierA-2: Favicon 红点 - 监听通知未读数，动态在 favicon 上显示红点
const { updateBadge } = useFaviconBadge()
const notificationStore = useNotificationStore()
watch(
  () => notificationStore.unreadCount,
  (count: number) => {
    updateBadge(count)
  },
  { immediate: true }
)

// TierS-4: 全局水印 - 用户偏好开启时，叠加用户名+日期水印到 app-wrapper
// 关闭时传入空字符串，水印指令会跳过绘制（buildWatermark 内 text 为空时 return）
const watermarkValue = computed(() => {
  if (!settingsStore.userPrefs.watermarkEnabled) return ''
  const userStore = useUserStore()
  return `${userStore.name}\n${new Date().toLocaleDateString()}`
})

// 启用全局快捷键（Ctrl+K 搜索、Ctrl+Shift+F 全屏、Ctrl+Shift+L 锁屏等）
useGlobalHotkeys()

// TierB-2: 会话超时 - 无操作自动登出（阈值可在偏好设置中调整）
useSessionTimeout()

// 最近访问页面记录
const { recordVisit } = useRecentViews()
watch(
  () => route.fullPath,
  () => {
    if (route.meta && route.meta.title) {
      recordVisit({
        path: route.path,
        fullPath: route.fullPath,
        title: route.meta.title as string,
        icon: route.meta.icon as string | undefined,
        i18nKey: route.meta.i18nKey as string | undefined
      })
    }
  },
  { immediate: false }
)

// 语言切换时同步更新浏览器标签页标题（document.title）
// settingsStore.title 存储的是翻译后的快照，切换语言后需重新翻译当前路由标题
const { locale } = useI18n()
watch(locale, () => {
  if (route.meta && route.meta.title) {
    settingsStore.setTitle(translateTitle(route.meta as { title?: string; i18nKey?: string }))
  }
  // P0-M4 修复：locale 切换时清空字典缓存，下次渲染触发重新拉取对应语言的 label
  // 原 useDict 在拉取时根据 getLanguage() 一次性计算 label，切换语言后 DictTag 仍显示旧语言
  useDictStore().cleanDict()
})

// 新手引导：仅未完成时自动显示
const tourVisible = ref(false)
// P3-2：持有 setTimeout 句柄，组件卸载时清理避免内存泄漏与对已卸载组件的写操作
const tourTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const logoutTimer = ref<ReturnType<typeof setTimeout> | null>(null)
const tourSteps = computed<TourStep[]>(() => [
  {
    selector: '.sidebar-container',
    title: safeT('layout.tour.sidebarTitle'),
    content: safeT('layout.tour.sidebarContent'),
    placement: 'right'
  },
  {
    selector: '.navbar',
    title: safeT('layout.tour.navbarTitle'),
    content: safeT('layout.tour.navbarContent'),
    placement: 'bottom'
  },
  {
    selector: '.tags-view-container, .tags-view',
    title: safeT('layout.tour.tagsViewTitle'),
    content: safeT('layout.tour.tagsViewContent'),
    placement: 'bottom'
  },
  {
    selector: '.app-main',
    title: safeT('layout.tour.appMainTitle'),
    content: safeT('layout.tour.appMainContent'),
    placement: 'top'
  }
])

onMounted(() => {
  // 初始化系统暗色模式监听（用户偏好设置中开启时生效）
  settingsStore.initSystemDarkWatcher()
  // 首次访问自动显示引导
  const tourStatus = cache.local.get('yebot-layout-tour')
  if (!tourStatus) {
    tourTimer.value = setTimeout(() => {
      tourVisible.value = true
    }, 1000)
  }
  // 监听强制下线 WS 事件（管理员通过在线用户页面强退）
  wsService.on('forceLogout', handleForceLogout)
})

onBeforeUnmount(() => {
  wsService.off('forceLogout', handleForceLogout)
  // P3-2：清理待执行的 setTimeout，避免对已卸载组件写入或重复跳转
  if (tourTimer.value) {
    clearTimeout(tourTimer.value)
    tourTimer.value = null
  }
  if (logoutTimer.value) {
    clearTimeout(logoutTimer.value)
    logoutTimer.value = null
  }
})

/** 处理强制下线：弹出提示并退出登录 */
async function handleForceLogout(_msg: WsMessage) {
  try {
    ElMessage.error(safeT('layout.forceLogoutMessage'))
  } catch {
    // ignore
  }
  const userStore = useUserStore()
  // M9: logOut 失败时仍需跳转登录页，用 try-finally 确保跳转不被阻断
  try {
    await userStore.logOut()
  } catch (e) {
    if (import.meta.env.DEV) console.error('[handleForceLogout] logOut failed', e)
  } finally {
    // 跳转到登录页
    logoutTimer.value = setTimeout(() => {
      goLogin()
    }, 500)
  }
}

const classObj = computed(() => ({
  hideSidebar: !sidebar.value.opened,
  openSidebar: sidebar.value.opened,
  withoutAnimation: sidebar.value.withoutAnimation,
  mobile: device.value === 'mobile'
}))

const { width } = useWindowSize()
const WIDTH = 992 // refer to Bootstrap's responsive design

watch(
  () => device.value,
  () => {
    if (device.value === 'mobile' && sidebar.value.opened) {
      appStore.closeSideBar({ withoutAnimation: false })
    }
  }
)

watchEffect(() => {
  if (width.value - 1 < WIDTH) {
    appStore.toggleDevice('mobile')
    appStore.closeSideBar({ withoutAnimation: true })
  } else {
    appStore.toggleDevice('desktop')
  }
})

function handleClickOutside(): void {
  appStore.closeSideBar({ withoutAnimation: false })
}

const settingRef = useTemplateRef('settingRef')
function setLayout() {
  settingRef.value?.openSetting()
}
</script>

<style lang="scss" scoped>
@use '@/assets/styles/mixin.scss' as mix;
@use '@/assets/styles/variables.module.scss' as vars;

/* 无障碍：跳过导航链接（默认隐藏，聚焦时显示） */
.skip-link {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 9999;
  padding: 8px 16px;
  background: var(--el-color-primary);
  color: var(--el-color-white);
  text-decoration: none;
  border-radius: 0 0 4px 0;
  font-size: 14px;
  transform: translateY(-100%);
  transition: transform 0.2s ease;

  &:focus {
    transform: translateY(0);
  }
}

.app-wrapper {
  @include mix.clearfix;

  &.mobile.openSidebar {
    position: fixed;
    top: 0;
  }
}

.main-container:has(.fixed-header) {
  height: 100vh;
  overflow: hidden;
}

.drawer-bg {
  background: var(--el-overlay-color-lighter);
  z-index: 999;
}

.fixed-header {
  position: fixed;
  top: 0;
  right: 0;
  z-index: 9;
  width: calc(100% - #{vars.$base-sidebar-width});
  transition: width 0.28s;
}

.hideSidebar .fixed-header {
  width: calc(100% - 54px);
}

.sidebarHide .fixed-header {
  width: 100%;
}

.mobile .fixed-header {
  width: 100%;
}
</style>
