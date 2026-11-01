<template>
  <teleport to="body">
    <transition name="palette-fade">
      <div
        v-if="visible"
        class="command-palette-mask fixed inset-0 bg-black/40 z-[3000] flex items-start justify-center pt-[12vh]"
        @click.self="close"
      >
        <div
          ref="paletteRef"
          class="command-palette"
          role="dialog"
          aria-modal="true"
          :aria-label="t('commandPalette.ariaLabel')"
          @click.self="close"
          @keydown="onPaletteKeydown"
        >
          <div class="palette-search">
            <el-icon class="search-icon"><Search /></el-icon>
            <input
              ref="inputRef"
              v-model="query"
              type="text"
              :placeholder="t('commandPalette.placeholder')"
              class="palette-input"
              @keydown="handleKeydown"
            />
            <span class="palette-esc">ESC</span>
          </div>
          <TransitionGroup
            name="list"
            tag="div"
            class="palette-list flex-1 overflow-y-auto p-1.5"
            v-if="filteredCommands.length > 0"
          >
            <div
              v-for="(cmd, idx) in filteredCommands"
              :key="cmd.id"
              class="palette-item"
              :class="{ active: idx === activeIndex }"
              :tabindex="idx === activeIndex ? 0 : -1"
              role="option"
              :aria-selected="idx === activeIndex"
              @mouseenter="activeIndex = idx"
              @click="executeCommand(cmd)"
              @keydown.enter.prevent="executeCommand(cmd)"
            >
              <div class="palette-item-icon">
                <el-icon v-if="cmd.icon"><component :is="cmd.icon" /></el-icon>
                <svg-icon v-else-if="cmd.svgIcon" :icon-class="cmd.svgIcon" />
                <span v-else class="palette-item-letter">{{ cmd.title.charAt(0) }}</span>
              </div>
              <div class="palette-item-main">
                <div class="palette-item-title">{{ cmd.title }}</div>
                <div class="palette-item-desc" v-if="cmd.description">{{ cmd.description }}</div>
              </div>
              <div class="palette-item-meta" v-if="cmd.shortcut">{{ cmd.shortcut }}</div>
              <div class="palette-item-cat">{{ cmd.category }}</div>
            </div>
          </TransitionGroup>
          <div v-else-if="searchLoading" class="palette-empty">
            <el-icon class="is-loading"><Loading /></el-icon>
            <span>{{ t('commandPalette.searching') }}</span>
          </div>
          <!-- 搜索失败与「真的没有结果」是两个事实（b142）：原实现把失败折成空数组，
               用户读到的是「未找到相关内容」——一次网络故障被当成系统里不存在该数据 -->
          <div v-else-if="searchFailed" class="palette-empty" role="alert">
            <el-icon><WarningFilled /></el-icon>
            <span>{{ t('commandPalette.searchFailed') }}</span>
            <el-button link type="primary" size="small" @click="retrySearch">
              {{ t('common.retry') }}
            </el-button>
          </div>
          <div v-else class="palette-empty">
            <el-icon><Search /></el-icon>
            <span>{{ isSearchMode ? t('commandPalette.noSearchResult') : t('commandPalette.noMatch') }}</span>
          </div>
          <!-- 本地命中仍在展示时也要说明「全局搜索这一路失败了」，否则用户会以为结果就是全部 -->
          <div
            v-if="searchFailed && filteredCommands.length > 0"
            class="flex items-center gap-2 px-3 pb-1 text-xs text-[var(--el-color-danger)]"
            role="alert"
          >
            <span>{{ t('commandPalette.searchFailed') }}</span>
            <el-button link type="primary" size="small" @click="retrySearch">
              {{ t('common.retry') }}
            </el-button>
          </div>
          <div class="palette-footer" v-if="filteredCommands.length > 0">
            <span>
              <kbd>↑</kbd>
              <kbd>↓</kbd>
              {{ t('commandPalette.category.navigation') }}
            </span>
            <span>
              <kbd>Enter</kbd>
              {{ t('commandPalette.category.action') }}
            </span>
            <span>
              <kbd>ESC</kbd>
              {{ t('commandPalette.close') }}
            </span>
          </div>
        </div>
      </div>
    </transition>
  </teleport>
</template>

<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import type { Component } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import {
  Search,
  Moon,
  Sunny,
  FullScreen,
  Lock,
  Fold,
  Expand,
  RefreshRight,
  User,
  Link,
  Loading,
  WarningFilled
} from '@element-plus/icons-vue'
import usePermissionStore from '@/store/modules/permission'
import useSettingsStore from '@/store/modules/settings'
import useAppStore from '@/store/modules/app'
import useLockStore from '@/store/modules/lock'
import useUserStore from '@/store/modules/user'
import { goLogin } from '@/utils/navigation'
import { createLatestGuard } from '@/composables/latestRequest'
import modal from '@/plugins/modal'
import { translateTitle } from '@/composables/useMenuTitle'
import { globalSearch } from '@/api/common'
import type { GlobalSearchItem } from '@/api/common'
import { isExternal, isHttp } from '@/utils/validate'
import { toggleFullscreen } from '@/utils/fullscreen'
import { isImeComposing } from '@/utils/keyboard'
import type { AppRouteRecord } from '@/types'

interface Command {
  id: string
  title: string
  description?: string
  category: string
  icon?: Component
  svgIcon?: string
  shortcut?: string
  action: () => void
}

const props = defineProps<{ visible: boolean }>()
const emit = defineEmits<{ (e: 'update:visible', v: boolean): void }>()

const { t, te } = useI18n()
const router = useRouter()
const route = useRoute()
const permissionStore = usePermissionStore()
const settingsStore = useSettingsStore()
const appStore = useAppStore()
const lockStore = useLockStore()
const userStore = useUserStore()

const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const paletteRef = ref<HTMLElement | null>(null)
// 记录触发元素，关闭后返回焦点
const triggerEl = ref<HTMLElement | null>(null)

watch(
  () => props.visible,
  (v: boolean) => {
    if (v) {
      // 记录当前焦点元素（触发按钮或其他），用于关闭后恢复焦点
      const active = document.activeElement as HTMLElement | null
      triggerEl.value = active && active !== document.body ? active : null
      query.value = ''
      activeIndex.value = 0
      nextTick(() => inputRef.value?.focus())
    } else {
      // 关闭后返回焦点到触发元素
      const el = triggerEl.value
      triggerEl.value = null
      if (el && document.contains(el)) {
        nextTick(() => el.focus())
      }
    }
  }
)

watch(query, () => {
  activeIndex.value = 0
  scheduleGlobalSearch()
})

// 收集所有可执行命令
const commands = computed<Command[]>(() => {
  const list: Command[] = []

  // 1. 菜单跳转命令（从权限路由树提取）
  const collectMenuCommands = (routes: AppRouteRecord[], basePath = '') => {
    for (const r of routes) {
      if (r.hidden) continue
      const fullPath = basePath + '/' + r.path
      const cleanPath = fullPath.replace(/\/+/g, '/')
      if (r.children && r.children.length > 0) {
        collectMenuCommands(r.children, cleanPath)
      } else if (r.path && !isExternal(r.path)) {
        list.push({
          id: `menu-${cleanPath}`,
          title: translateTitle(r.meta) || String(r.name ?? r.path),
          description: cleanPath,
          category: t('commandPalette.category.menuJump'),
          svgIcon: r.meta?.icon as string | undefined,
          action: () => router.push(cleanPath)
        })
      }
    }
  }
  collectMenuCommands(permissionStore.routes)

  // 2. 系统命令
  list.push(
    {
      id: 'cmd-toggle-dark',
      title: t('commandPalette.cmd.toggleDark'),
      category: t('commandPalette.category.systemAction'),
      icon: settingsStore.isDark ? Sunny : Moon,
      action: () => settingsStore.toggleTheme()
    },
    {
      id: 'cmd-fullscreen',
      title: t('commandPalette.cmd.toggleFullscreen'),
      category: t('commandPalette.category.systemAction'),
      icon: FullScreen,
      action: async () => {
        // b112：全屏会因策略/手势被拒绝；失败必须可见，不能"点了没反应"
        const ok = await toggleFullscreen()
        if (!ok) modal.msgWarning(t('common.fullscreenFail'))
      }
    },
    {
      id: 'cmd-toggle-sidebar',
      title: t('commandPalette.cmd.toggleSidebar'),
      category: t('commandPalette.category.systemAction'),
      icon: Fold,
      action: () => appStore.toggleSideBar()
    },
    {
      id: 'cmd-refresh',
      title: t('commandPalette.cmd.refreshPage'),
      category: t('commandPalette.category.systemAction'),
      icon: RefreshRight,
      action: () => window.location.reload()
    },
    {
      id: 'cmd-lock',
      title: t('commandPalette.cmd.lockScreen'),
      category: t('commandPalette.category.systemAction'),
      icon: Lock,
      action: () => {
        if (userStore.id) {
          lockStore.lockScreen(route.fullPath)
          router.push('/lock')
        }
      }
    },
    {
      id: 'cmd-profile',
      title: t('commandPalette.cmd.profile'),
      category: t('commandPalette.category.systemAction'),
      icon: User,
      action: () => router.push('/user/profile')
    },
    {
      id: 'cmd-github',
      title: t('commandPalette.cmd.githubRepo'),
      category: t('commandPalette.category.systemAction'),
      icon: Link,
      action: () => window.open('https://github.com/stepbylabs/stepby-vue', '_blank', 'noopener,noreferrer')
    },
    {
      id: 'cmd-logout',
      title: t('commandPalette.cmd.logout'),
      category: t('commandPalette.category.systemAction'),
      icon: Expand,
      action: () => {
        modal
          .confirm(t('commandPalette.confirmLogout'))
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
    }
  )

  return list
})

// 按查询过滤
const filteredCommands = computed<Command[]>(() => {
  const q = query.value.trim().toLowerCase()
  // 本地命令命中（标题 / 描述 / 分类）——始终参与，保证 UI 命令（如「锁屏」「切换主题」）
  // 输入其名称即可检索到，不被全局搜索模式吞掉。
  const local = q
    ? commands.value.filter(
        (c: Command) =>
          c.title.toLowerCase().includes(q) ||
          c.description?.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q)
      )
    : commands.value
  // 搜索模式（≥2 字符）：本地命中 + 全局搜索结果合并（本地优先，语义更贴近"命令面板"）
  if (isSearchMode.value) return [...local, ...searchResults.value].slice(0, 30)
  return local.slice(0, 30)
})

// ==================== 全局搜索模式（GET /common/global-search） ====================
const searchLoading = ref(false)
const searchResults = ref<Command[]>([])
/** 全局搜索失败（与「没有结果」是两个事实，不得互相冒充） */
const searchFailed = ref(false)
let searchTimer: ReturnType<typeof setTimeout> | null = null
// 请求守卫（b119 单一实现）：丢弃防抖窗口外过期响应，避免竞态覆盖
const searchGuard = createLatestGuard()

// 输入 >= 2 字符进入搜索模式
const isSearchMode = computed(() => query.value.trim().length >= 2)

/** 输入防抖 300ms 触发全局搜索 */
function scheduleGlobalSearch(): void {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
  const q = query.value.trim()
  if (q.length < 2) {
    searchResults.value = []
    searchFailed.value = false
    searchLoading.value = false
    return
  }
  searchFailed.value = false
  searchLoading.value = true
  searchTimer = setTimeout(() => {
    runGlobalSearch(q)
  }, 300)
}

/** 失败后的重试入口：立即重发，不再等防抖 */
function retrySearch(): void {
  const q = query.value.trim()
  if (q.length < 2 || searchLoading.value) return
  searchFailed.value = false
  searchLoading.value = true
  void runGlobalSearch(q)
}

/** 执行全局搜索：结果按类型转为可执行命令（回车/点击跳 url） */
async function runGlobalSearch(q: string): Promise<void> {
  const ticket = searchGuard.begin()
  try {
    const res = await globalSearch(q, 20)
    // 过期响应丢弃（期间用户可能已修改输入）
    if (!searchGuard.isCurrent(ticket)) return
    searchResults.value = (res.data || []).map(toSearchCommand)
    searchFailed.value = false
  } catch {
    if (searchGuard.isCurrent(ticket)) {
      searchResults.value = []
      // 失败必须可见：空结果 + 「未找到相关内容」会把一次网络故障说成"系统里没有"
      searchFailed.value = true
    }
  } finally {
    if (searchGuard.isCurrent(ticket)) searchLoading.value = false
  }
}

/** 结果项 → 命令：应用内路由跳转，http(s) 外链新窗口打开 */
function toSearchCommand(item: GlobalSearchItem): Command {
  return {
    id: `search-${item.type}-${item.id}`,
    title: item.title,
    description: item.subtitle,
    category: searchTypeLabel(item.type),
    action: () => {
      if (isHttp(item.url)) {
        window.open(item.url, '_blank', 'noopener,noreferrer')
      } else if (isExternal(item.url)) {
        // mailto:/tel: 交给系统处理；用 router.push 会落到 404 页（菜单配置可能用它）
        window.location.assign(item.url)
      } else {
        router.push(item.url).catch(() => {})
      }
    }
  }
}

/** 结果类型 → 分组标签：命中 i18n key 则翻译，否则原样展示（te 回退兼容未知类型） */
function searchTypeLabel(type: string): string {
  const key = `commandPalette.searchType.${type}`
  return te(key) ? t(key) : type
}

onBeforeUnmount(() => {
  if (searchTimer) {
    clearTimeout(searchTimer)
    searchTimer = null
  }
})

function handleKeydown(e: KeyboardEvent) {
  // b114：组合态里的 Enter/Escape/方向键属于输入法（上屏、取消、翻候选），
  // 此时执行命令 = 用户还在打中文就跳走了页面。全局 keyup 守卫管不到 keydown，故在此显式判。
  if (isImeComposing(e)) return
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    activeIndex.value = Math.min(activeIndex.value + 1, filteredCommands.value.length - 1)
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    activeIndex.value = Math.max(activeIndex.value - 1, 0)
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const cmd = filteredCommands.value[activeIndex.value]
    if (cmd) executeCommand(cmd)
  } else if (e.key === 'Escape') {
    close()
  }
}

/**
 * 在 palette 容器内部实现 focus trap：
 * - Tab 在最后一个可聚焦元素上时回到第一个
 * - Shift+Tab 在第一个可聚焦元素上时回到最后一个
 * 注意：输入框的 ArrowDown/Enter/Escape 等仍由 handleKeydown 处理，
 * 此处只接管 Tab，避免破坏现有键盘逻辑。
 */
function onPaletteKeydown(e: KeyboardEvent) {
  if (e.key !== 'Tab') return
  const root = paletteRef.value
  if (!root) return
  const focusables = (
    Array.from(
      root.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])'
      )
    ) as HTMLElement[]
  ).filter((el) => el.offsetParent !== null || el === document.activeElement)
  if (focusables.length === 0) return
  const first = focusables[0]
  const last = focusables[focusables.length - 1]
  const active = document.activeElement as HTMLElement | null
  if (e.shiftKey) {
    if (active === first || !root.contains(active)) {
      e.preventDefault()
      last.focus()
    }
  } else {
    if (active === last || !root.contains(active)) {
      e.preventDefault()
      first.focus()
    }
  }
}

function executeCommand(cmd: Command) {
  close()
  try {
    cmd.action()
  } catch (e) {
    modal.msgError(t('commandPalette.executeFail'))
    if (import.meta.env.DEV) console.error(e)
  }
}

function close() {
  emit('update:visible', false)
}

// Ctrl+K / Cmd+K 统一由 useGlobalHotkeys 触发 stepby:open-command-palette 事件
// （本组件只监听事件，避免与 useGlobalHotkeys 的快捷键绑定双重响应）
function onOpenPaletteEvent() {
  emit('update:visible', true)
}

onMounted(() => window.addEventListener('stepby:open-command-palette', onOpenPaletteEvent))
onBeforeUnmount(() => window.removeEventListener('stepby:open-command-palette', onOpenPaletteEvent))
</script>

<style lang="scss" scoped>
.command-palette {
  width: 640px;
  max-width: 92vw;
  max-height: 70vh;
  background: var(--el-bg-color, #fff);
  border-radius: 12px;
  box-shadow: 0 12px 48px rgba(0, 0, 0, 0.25);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.palette-search {
  display: flex;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid var(--el-border-color-lighter, #ebeef5);

  .search-icon {
    font-size: 18px;
    color: var(--el-text-color-secondary, #909399);
    margin-right: 12px;
  }

  .palette-input {
    flex: 1;
    border: none;
    outline: none;
    background: transparent;
    font-size: 16px;
    color: var(--el-text-color-primary, #303133);

    &::placeholder {
      color: var(--el-text-color-secondary, #c0c4cc);
    }
  }

  .palette-esc {
    padding: 2px 8px;
    font-size: 11px;
    color: var(--el-text-color-secondary, #909399);
    background: var(--el-fill-color-light, #f5f7fa);
    border-radius: 4px;
  }
}

.palette-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;

  &:hover,
  &.active {
    background: var(--el-fill-color-light, #f5f7fa);
  }

  .palette-item-icon {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    border-radius: 6px;
    background: var(--el-color-primary-light-9, #ecf5ff);
    color: var(--el-color-primary, #409eff);
    font-size: 14px;
    flex-shrink: 0;
  }

  .palette-item-letter {
    font-size: 13px;
    font-weight: 600;
  }

  .palette-item-main {
    flex: 1;
    min-width: 0;
  }

  .palette-item-title {
    font-size: 14px;
    color: var(--el-text-color-primary, #303133);
    line-height: 1.4;
  }

  .palette-item-desc {
    font-size: 12px;
    color: var(--el-text-color-secondary, #909399);
    margin-top: 2px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .palette-item-meta {
    font-size: 11px;
    color: var(--el-text-color-secondary, #909399);
    padding: 2px 6px;
    background: var(--el-fill-color, #f5f7fa);
    border-radius: 4px;
  }

  .palette-item-cat {
    font-size: 11px;
    color: var(--el-text-color-placeholder, #c0c4cc);
    flex-shrink: 0;
  }
}

.palette-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  padding: 40px;
  color: var(--el-text-color-secondary, #909399);

  .el-icon {
    font-size: 32px;
  }
}

.palette-footer {
  padding: 10px 16px;
  border-top: 1px solid var(--el-border-color-lighter, #ebeef5);
  display: flex;
  gap: 16px;
  font-size: 11px;
  color: var(--el-text-color-secondary, #909399);

  kbd {
    display: inline-block;
    padding: 1px 6px;
    margin: 0 2px;
    font-size: 11px;
    background: var(--el-fill-color, #f5f7fa);
    border: 1px solid var(--el-border-color, #dcdfe6);
    border-radius: 3px;
    font-family: monospace;
  }
}

.palette-fade-enter-active,
.palette-fade-leave-active {
  transition: opacity 0.2s;
}

/* 面板淡出的 200ms 里遮罩与输入框仍被命中，但组件已经卸载 ⇒ 这层是"看得见、
   点不动"的幽灵面，还会挡住底下的页面。离场期间不接受指针事件（b131 同族）。 */
.palette-fade-leave-active {
  pointer-events: none;
}

.palette-fade-enter-from,
.palette-fade-leave-to {
  opacity: 0;
}
</style>
