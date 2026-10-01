<template>
  <div class="navbar flex items-center relative overflow-hidden box-border" :class="'nav' + settingsStore.navType">
    <hamburger
      id="hamburger-container"
      :is-active="appStore.sidebar.opened"
      class="hamburger-container"
      @toggleClick="toggleSideBar"
    />
    <Transition mode="out-in" name="fade">
      <breadcrumb v-if="settingsStore.navType == 1" :key="1" id="breadcrumb-container" class="breadcrumb-container" />
      <top-nav v-else-if="settingsStore.navType == 2" :key="2" id="topmenu-container" class="topmenu-container" />
      <div v-else-if="settingsStore.navType == 3" :key="3" class="nav3-wrap">
        <logo v-show="settingsStore.sidebarLogo" :collapse="false"></logo>
        <top-bar id="topbar-container" class="topbar-container flex-1 min-w-0 flex items-center overflow-hidden ml-2" />
      </div>
    </Transition>

    <div class="right-menu flex items-center h-full ml-auto">
      <template v-if="appStore.device !== 'mobile'">
        <!-- 菜单搜索（放大镜语义） -->
        <header-search id="header-search" class="right-menu-item" />

        <!-- 命令面板触发器（使用 Operation 图标区分菜单搜索的放大镜） -->
        <el-tooltip :content="safeT('layout.navbar.commandPalette')" effect="dark" placement="bottom">
          <div
            class="right-menu-item hover-effect cmd-trigger"
            role="button"
            tabindex="0"
            :aria-label="safeT('layout.navbar.commandPalette')"
            @click="cmdVisible = true"
            @keydown.enter.prevent="cmdVisible = true"
            @keydown.space.prevent="cmdVisible = tru" >
            <el-icon><Operation /></el-icon>
          </div>
        </el-tooltip>

        <!-- 收藏夹下拉 -->
        <el-tooltip :content="safeT('layout.navbar.favorites')" effect="dark" placement="bottom">
          <el-dropdown trigger="click" placement="bottom-start" @command="handleFavClick">
            <div
              class="right-menu-item hover-effect fav-trigger"
              role="button"
              tabindex="0"
              :aria-label="safeT('layout.navbar.favorites')" >
              <el-icon><StarFilled /></el-icon>
              <Transition name="fade">
                <!-- 注：fav.favorites 是 useMenuFavorites 返回的 Ref，模板中作为对象属性访问不会自动解包，故显式 .value -->
                <span v-if="fav.favorites.value.length" class="fav-count">{{ fav.favorites.value.length }}</span>
              </Transition>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <div v-if="fav.favorites.value.length === 0" class="fav-empty">
                  <el-icon><Star /></el-icon>
                  <span>{{ safeT('layout.navbar.favEmpty') }}</span>
                  <div class="fav-tip">{{ safeT('layout.navbar.favTip') }}</div>
                </div>
                <el-dropdown-item v-for="item in fav.favorites.value" :key="item.path" :command="item.path">
                  <svg-icon v-if="item.icon" :icon-class="item.icon" class="mr-1.5" />
                  {{ translateFavoriteTitle(item) }}
                </el-dropdown-item>
                <el-dropdown-item v-if="fav.favorites.value.length > 0" divided command="__clear__">
                  <el-icon><Delete /></el-icon>
                  {{ safeT('layout.navbar.clearFavorites') }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-tooltip>

        <!-- 最近访问下拉 -->
        <el-tooltip :content="safeT('layout.navbar.recent')" effect="dark" placement="bottom">
          <el-dropdown trigger="click" placement="bottom-start" @command="handleRecentClick">
            <div
              class="right-menu-item hover-effect recent-trigger"
              role="button"
              tabindex="0"
              :aria-label="safeT('layout.navbar.recent')" >
              <el-icon><Clock /></el-icon>
            </div>
            <template #dropdown>
              <el-dropdown-menu>
                <div v-if="recent.recentViews.value.length === 0" class="fav-empty">
                  <el-icon><Clock /></el-icon>
                  <span>{{ safeT('layout.navbar.recentEmpty') }}</span>
                </div>
                <el-dropdown-item
                  v-for="(item, idx) in recent.recentViews.value"
                  :key="item.path"
                  :command="item.fullPat" >
                  <span class="recent-idx">{{ Number(idx) + 1 }}</span>
                  <svg-icon v-if="item.icon" :icon-class="item.icon" class="mr-1.5" />
                  {{ translateRecentTitle(item) }}
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </el-tooltip>

        <!-- 消息通知（紧贴用户内容区，便于察觉） -->
        <el-tooltip :content="safeT('layout.navbar.notifications')" effect="dark" placement="bottom">
          <header-notice id="header-notice" class="right-menu-item hover-effect" />
        </el-tooltip>

        <!-- 显示控制：全屏 → 主题 → 语言 → 尺寸（个人偏好类靠后成组） -->
        <screenfull id="screenfull" class="right-menu-item hover-effect" />

        <el-tooltip :content="safeT('layout.navbar.themeMode')" effect="dark" placement="bottom">
          <div
            class="right-menu-item hover-effect theme-switch-wrapper"
            role="button"
            tabindex="0"
            :aria-label="safeT('layout.navbar.themeMode')"
            @click="toggleTheme"
            @keydown.enter.prevent="toggleTheme"
            @keydown.space.prevent="toggleThem" >
            <Transition name="fade" mode="out-in">
              <svg-icon v-if="settingsStore.isDark" key="dark" icon-class="sunny" />
              <svg-icon v-else key="light" icon-class="moon" />
            </Transition>
          </div>
        </el-tooltip>

        <el-tooltip :content="safeT('layout.navbar.language')" effect="dark" placement="bottom">
          <lang-select id="lang-select" class="right-menu-item hover-effect" />
        </el-tooltip>

        <el-tooltip :content="safeT('layout.navbar.layoutSize')" effect="dark" placement="bottom">
          <size-select id="size-select" class="right-menu-item hover-effect" />
        </el-tooltip>

        <!-- 问题监控（错误/警告聚合角标）：视图/偏好类之后的运维向入口 -->
        <el-tooltip :content="safeT('error.monitor.title')" effect="dark" placement="bottom">
          <error-monitor id="error-monitor" class="right-menu-item hover-effect" />
        </el-tooltip>

        <!-- 外部链接（低频，最末）：源码仓库 / 使用文档 -->
        <el-tooltip :content="safeT('layout.navbar.sourceCode')" effect="dark" placement="bottom">
          <stepby-git id="stepby-git" class="right-menu-item hover-effect" />
        </el-tooltip>

        <el-tooltip :content="safeT('layout.navbar.docs')" effect="dark" placement="bottom">
          <stepby-doc id="stepby-doc" class="right-menu-item hover-effect" />
        </el-tooltip>
      </template>

      <el-dropdown @command="handleCommand" class="avatar-container right-menu-item hover-effect" trigger="click">
        <div
          class="avatar-wrapper"
          role="button"
          tabindex="0"
          :aria-label="safeT('layout.navbar.avatarAlt', { name: userStore.nickName })" >
          <img
            :src="userStore.avatar"
            class="user-avatar"
            :alt="safeT('layout.navbar.avatarAlt', { name: userStore.nickName })"
            @error="onAvatarError"
            loading="lazy"
          />
          <span class="user-nickname">{{ userStore.nickName }}</span>
        </div>
        <template #dropdown>
          <el-dropdown-menu>
            <router-link to="/user/profile">
              <el-dropdown-item>{{ safeT('common.profile') }}</el-dropdown-item>
            </router-link>
            <el-dropdown-item command="setLayout" v-if="settingsStore.showSettings">
              <span>{{ safeT('layout.navbar.layoutSettings') }}</span>
            </el-dropdown-item>
            <el-dropdown-item command="userPrefs">
              <span>{{ safeT('layout.navbar.preferences') }}</span>
            </el-dropdown-item>
            <el-dropdown-item command="lockScreen">
              <span>{{ safeT('layout.navbar.lockScreen') }}</span>
            </el-dropdown-item>
            <el-dropdown-item divided command="logout">
              <span>{{ safeT('common.logout') }}</span>
            </el-dropdown-item>
          </el-dropdown-menu>
        </template>
      </el-dropdown>
    </div>

    <!-- 命令面板 -->
    <command-palette v-model:visible="cmdVisible" />
    <!-- 用户偏好设置对话框 -->
    <user-prefs-dialog ref="userPrefsRef" />
  </div>
</template>

<script setup lang="ts">
import modal from '@/plugins/modal'
import Breadcrumb from '@/components/Breadcrumb/index.vue'
import TopNav from './TopNav/index.vue'
import TopBar from './TopBar/index.vue'
import Logo from './Sidebar/Logo.vue'
import Hamburger from '@/components/Hamburger/index.vue'
import Screenfull from '@/components/Screenfull/index.vue'
import SizeSelect from '@/components/SizeSelect/index.vue'
import HeaderSearch from '@/components/HeaderSearch/index.vue'
import StepbyGit from '@/components/Stepby/Git/index.vue'
import StepbyDoc from '@/components/Stepby/Doc/index.vue'
import LangSelect from '@/components/LangSelect/index.vue'
import CommandPalette from '@/components/CommandPalette/index.vue'
import UserPrefsDialog from '@/components/UserPrefsDialog/index.vue'
import { useMenuFavorites } from '@/composables/useMenuFavorites'
import { useRecentViews } from '@/composables/useRecentViews'
import { translateTitle } from '@/composables/useMenuTitle'
import defAva from '@/assets/images/profile.webp'
import useAppStore from '@/store/modules/app'
import useUserStore from '@/store/modules/user'
import { goLogin } from '@/utils/navigation'
import useLockStore from '@/store/modules/lock'
import useSettingsStore from '@/store/modules/settings'
import HeaderNotice from './HeaderNotice/index.vue'
import ErrorMonitor from './ErrorMonitor/index.vue'
import { safeT } from '@/utils/safeI18n'

const route = useRoute()
const router = useRouter()
const appStore = useAppStore()
const userStore = useUserStore()
const lockStore = useLockStore()
const settingsStore = useSettingsStore()

// 命令面板可见性
const cmdVisible = ref(false)
// 用户偏好设置对话框（仅通过头像下拉菜单触发，避免与 Navbar 图标重复入口）
const userPrefsRef = ref<InstanceType<typeof UserPrefsDialog> | null>(null)

// 菜单收藏夹
const fav = useMenuFavorites()
// 最近访问
const recent = useRecentViews()

/** 翻译收藏夹标题（优先 i18nKey，回退 title 原文） */
function translateFavoriteTitle(item: { title: string; i18nKey?: string }): string {
  return translateTitle({ title: item.title, i18nKey: item.i18nKey })
}

/** 翻译最近访问标题（优先 i18nKey，回退 title 原文） */
function translateRecentTitle(item: { title: string; i18nKey?: string }): string {
  return translateTitle({ title: item.title, i18nKey: item.i18nKey })
}

function handleFavClick(path: string): void {
  if (path === '__clear__') {
    fav.clearFavorites()
    return
  }
  router.push(path)
}

function handleRecentClick(fullPath: string): void {
  router.push(fullPath)
}

function toggleSideBar(): void {
  appStore.toggleSideBar()
}

/** 头像加载失败时回退到默认头像，避免显示破裂图标（与 lock.vue 行为对齐） */
function onAvatarError(e: Event): void {
  const img = e.target as HTMLImageElement
  if (img.src !== defAva) {
    img.src = defAva
  }
}

function handleCommand(command: string): void {
  switch (command) {
    case 'setLayout':
      setLayout()
      break
    case 'userPrefs':
      userPrefsRef.value?.open()
      break
    case 'lockScreen':
      lockScreen()
      break
    case 'logout':
      logout()
      break
    default:
      break
  }
}

function logout(): void {
  modal
    .confirm(safeT('common.logoutConfirm'))
    .then(() => {
      userStore
        .logOut()
        .then(() => {
          goLogin()
        })
        .catch(() => {
          goLogin()
        })
    })
    .catch(() => {})
}

const emits = defineEmits(['setLayout'])
function setLayout(): void {
  emits('setLayout')
}

function lockScreen() {
  const currentPath = route.fullPath
  lockStore.lockScreen(currentPath)
  router.push('/lock')
}

// P2 修复: 跟踪主题切换锁释放定时器，组件卸载时清理，避免内存泄漏
let themeLockTimer: ReturnType<typeof setTimeout> | null = null

async function toggleTheme(event?: MouseEvent): Promise<void> {
  const wasDark = settingsStore.isDark

  const isReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  const hasViewTransition = typeof document.startViewTransition === 'function'

  // 无 View Transition API 或用户偏好减少动效：直接切换
  if (!hasViewTransition || isReducedMotion) {
    settingsStore.toggleTheme()
    return
  }

  // 防止快速连续切换导致 transition 状态冲突
  if (document.__themeTransitionInProgress) {
    return
  }
  document.__themeTransitionInProgress = true

  try {
    const x = event?.clientX || window.innerWidth / 2
    const y = event?.clientY || window.innerHeight / 2

    const transition = document.startViewTransition!(() => {
      settingsStore.toggleTheme()
    })

    // 不 await transition.ready，避免 InvalidStateError 中断流程
    // 直接注册动画，浏览器会自动在 ready 后执行
    const endRadius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    const clipPath = [`circle(0px at ${x}px ${y}px)`, `circle(${endRadius}px at ${x}px ${y}px)`]
    const isDarkening = !wasDark // 切换后是否为暗色

    transition.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: isDarkening ? clipPath : [...clipPath].reverse()
          },
          {
            duration: 650,
            easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
            fill: 'forwards',
            pseudoElement: isDarkening ? '::view-transition-new(root)' : '::view-transition-old(root)'
          }
        )
      })
      .catch(() => {
        // transition.ready reject（InvalidStateError），主题已在回调中切换，无需处理
      })
  } catch (error) {
    // startViewTransition 抛出异常：确保主题已切换
    if (settingsStore.isDark === wasDark) {
      settingsStore.toggleTheme()
    }
    if (import.meta.env.DEV) console.warn('Theme toggle failed:', error)
  } finally {
    // 短暂延迟后释放锁，避免动画未完成时再次触发
    if (themeLockTimer) clearTimeout(themeLockTimer)
    themeLockTimer = setTimeout(() => {
      document.__themeTransitionInProgress = false
      themeLockTimer = null
    }, 700)
  }
}

onBeforeUnmount(() => {
  if (themeLockTimer) {
    clearTimeout(themeLockTimer)
    themeLockTimer = null
    document.__themeTransitionInProgress = false
  }
})
</script>

<style lang="scss" scoped>
.navbar.nav3 {
  .hamburger-container {
    display: none !important;
  }
}

// navType=3 包裹层：使用 display:contents 让子元素仍作为 navbar flex 直接子项布局
.nav3-wrap {
  display: contents;
}

.navbar {
  height: 50px;
  background: var(--navbar-bg);
  box-shadow: 0 1px 4px rgba(0, 21, 41, 0.08);
  // padding: 0 8px;

  .hamburger-container {
    line-height: 46px;
    height: 100%;
    cursor: pointer;
    transition: background 0.3s;
    -webkit-tap-highlight-color: transparent;
    display: flex;
    align-items: center;
    flex-shrink: 0;
    margin-right: 8px;

    &:hover {
      background: var(--navbar-hover);
    }
  }

  .breadcrumb-container {
    flex-shrink: 0;
  }

  .topmenu-container {
    position: absolute;
    left: 50px;
  }

  .right-menu {
    line-height: 50px;

    &:focus {
      outline: none;
    }

    .right-menu-item {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0 8px;
      height: 100%;
      font-size: 18px;
      color: var(--navbar-text, #5a5e66);
      position: relative;
      flex-shrink: 0;

      &.hover-effect {
        cursor: pointer;
        transition: background 0.3s;

        &:hover {
          background: var(--navbar-hover);
        }
      }

      &.theme-switch-wrapper {
        svg {
          transition: transform 0.3s;

          &:hover {
            transform: scale(1.15);
          }
        }
      }

      &.fav-trigger,
      &.recent-trigger,
      &.cmd-trigger {
        position: relative;
      }

      .fav-count {
        position: absolute;
        top: 6px;
        right: 2px;
        background: var(--el-color-danger, #f56c6c);
        color: var(--el-color-white);
        font-size: 10px;
        line-height: 1;
        padding: 1px 4px;
        border-radius: 8px;
        min-width: 14px;
        text-align: center;
      }
    }

    .fav-empty {
      padding: 16px 20px;
      text-align: center;
      color: var(--el-text-color-secondary, #909399);
      font-size: 13px;

      .el-icon {
        font-size: 24px;
        margin-bottom: 8px;
        display: block;
      }

      .fav-tip {
        font-size: 11px;
        margin-top: 6px;
        color: var(--el-text-color-placeholder, #c0c4cc);
      }
    }

    .recent-idx {
      display: inline-block;
      width: 18px;
      height: 18px;
      line-height: 18px;
      text-align: center;
      background: var(--el-fill-color, #f5f7fa);
      border-radius: 4px;
      font-size: 11px;
      color: var(--el-text-color-secondary, #909399);
      margin-right: 6px;
    }

    .avatar-container {
      margin-right: 0px;
      padding-right: 0px;

      .avatar-wrapper {
        display: flex;
        align-items: center;
        padding: 0 8px;

        .user-avatar {
          cursor: pointer;
          width: 30px;
          height: 30px;
          margin-right: 8px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .user-nickname {
          font-size: 14px;
          font-weight: bold;
          line-height: 1;
          white-space: nowrap;
        }

        i {
          cursor: pointer;
          font-size: 12px;
        }
      }
    }
  }
}
</style>
