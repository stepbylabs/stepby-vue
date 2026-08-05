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
          <div v-else class="palette-empty">
            <el-icon><Search /></el-icon>
            <span>{{ t('commandPalette.noMatch') }}</span>
          </div>
          <div class="palette-footer">
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
import { Search, Moon, Sunny, FullScreen, Lock, Fold, Expand, RefreshRight, User } from '@element-plus/icons-vue'
import usePermissionStore from '@/store/modules/permission'
import useSettingsStore from '@/store/modules/settings'
import useAppStore from '@/store/modules/app'
import useLockStore from '@/store/modules/lock'
import useUserStore from '@/store/modules/user'
import { goLogin } from '@/utils/navigation'
import modal from '@/plugins/modal'
import { translateTitle } from '@/composables/useMenuTitle'
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

const { t } = useI18n()
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
      } else if (r.path && !r.path.startsWith('http')) {
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
      action: () => {
        if (!document.fullscreenElement) document.documentElement.requestFullscreen?.()
        else document.exitFullscreen?.()
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
  if (!q) return commands.value.slice(0, 30)
  return commands.value
    .filter((c: Command) => {
      return (
        c.title.toLowerCase().includes(q) ||
        c.description?.toLowerCase().includes(q) ||
        c.category.toLowerCase().includes(q)
      )
    })
    .slice(0, 30)
})

function handleKeydown(e: KeyboardEvent) {
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

// 全局键盘事件兜底
function onGlobalKeydown(e: KeyboardEvent) {
  if (e.ctrlKey && (e.key === 'k' || e.key === 'K') && !e.shiftKey) {
    e.preventDefault()
    emit('update:visible', !props.visible)
  }
}

onMounted(() => window.addEventListener('keydown', onGlobalKeydown))
onBeforeUnmount(() => window.removeEventListener('keydown', onGlobalKeydown))
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

.palette-fade-enter-from,
.palette-fade-leave-to {
  opacity: 0;
}
</style>
