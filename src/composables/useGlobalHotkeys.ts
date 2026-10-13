/**
 * 全局快捷键组合式函数
 * Copyright (c) 2026 Stepby
 *
 * 基于 @vueuse/core 的 useMagicKeys，无需新增依赖
 *
 * 支持的快捷键（默认）：
 * - ?             : 显示快捷键帮助面板
 * - Ctrl+K        : 打开命令面板（替代 HeaderSearch）
 * - Ctrl+Shift+F  : 切换全屏
 * - Ctrl+Shift+L  : 锁屏
 * - Ctrl+Shift+D  : 切换暗黑模式
 * - Ctrl+Shift+S  : 打开设置面板
 * - Ctrl+,        : 打开设置面板（macOS 风格）
 * - Ctrl+Shift+,  : 切换侧边栏折叠
 * - Alt+T         : 切换主题色（循环）
 *
 * 用户可在偏好设置中自定义快捷键
 * 用法：在 layout/index.vue 中调用 useGlobalHotkeys()
 */

import { useMagicKeys, whenever } from '@vueuse/core'
import type { Ref } from 'vue'
import { ElMessageBox } from 'element-plus'
import i18n from '@/i18n'
import useAppStore from '@/store/modules/app'
import useSettingsStore, { DEFAULT_HOTKEYS } from '@/store/modules/settings'
import useUserStore from '@/store/modules/user'
import { navigate } from '@/utils/navigation'
import useLockStore from '@/store/modules/lock'
import modal from '@/plugins/modal'

// 快捷键帮助文案（函数式确保 i18n 响应式，语言切换后立即生效）
function getHotkeyHelp(): string {
  const t = i18n.global.t
  // 使用 shortcuts.helpItem + formatHotkey 组装，避免硬编码中文
  const items: Array<{ key: string; label: string }> = [
    { key: '?', label: t('shortcuts.helpItem.help') },
    { key: 'Ctrl + K', label: t('shortcuts.helpItem.search') },
    { key: 'Ctrl + Shift + F', label: t('shortcuts.helpItem.fullscreen') },
    { key: 'Ctrl + Shift + L', label: t('shortcuts.helpItem.lockScreen') },
    { key: 'Ctrl + Shift + D', label: t('shortcuts.helpItem.toggleDark') },
    { key: 'Ctrl + Shift + S', label: t('shortcuts.helpItem.settings') },
    { key: 'Ctrl + Shift + ,', label: t('shortcuts.helpItem.toggleSidebar') },
    { key: 'Alt + T', label: t('shortcuts.helpItem.cycleTheme') }
  ]
  const rows = items.map((it) => `<p><b>${it.key}</b> &nbsp;${it.label}</p>`).join('')
  return `<div style="line-height: 2;">${rows}</div>`
}

export function useGlobalHotkeys() {
  const appStore = useAppStore()
  const settingsStore = useSettingsStore()
  const userStore = useUserStore()
  const lockStore = useLockStore()

  // 合并默认快捷键和用户自定义快捷键
  const hotkeys = computed(() => ({
    ...DEFAULT_HOTKEYS,
    ...(settingsStore.userPrefs.customHotkeys || {})
  }))

  const keys = useMagicKeys({
    passive: false,
    onEventFired(e) {
      // 防止默认行为仅在命中的组合键时触发
      // Ctrl+K（macOS 下 Cmd+K）在 Chrome 中会触发地址栏搜索，需要 preventDefault
      const searchKey = hotkeys.value.search
      const isSearchCombo =
        (e.key === 'k' || e.key === 'K') && e.type === 'keydown' && (e.ctrlKey || e.metaKey)
      if (searchKey === 'ctrl_k' && isSearchCombo) {
        e.preventDefault()
      }
    }
  })

  // 注册各快捷键处理函数（动态读取用户自定义配置）
  function bind(action: string, handler: () => void) {
    const keyName = hotkeys.value[action]
    if (!keyName || !keys[keyName as keyof typeof keys]) return
    whenever(keys[keyName as keyof typeof keys] as Ref<boolean>, handler)
  }

  // macOS 平台检测（jsdom/SSR 下 navigator 可能缺失，做安全兜底）
  const isMac =
    typeof navigator !== 'undefined' && /mac/i.test(navigator.userAgent || '')

  // macOS 下 Cmd 等效 Ctrl：useMagicKeys 不做平台映射（ctrl_k 只匹配左 Ctrl），
  // 故对 ctrl_* 快捷键额外绑定同名的 meta_* 变体（Cmd+K / Cmd+Shift+D 等）
  function bindWithMeta(action: string, handler: () => void) {
    bind(action, handler)
    if (!isMac) return
    const keyName = hotkeys.value[action]
    if (!keyName || !keyName.startsWith('ctrl_')) return
    const metaName = 'meta_' + keyName.slice('ctrl_'.length)
    const metaRef = keys[metaName as keyof typeof keys]
    if (!metaRef) return
    whenever(metaRef as Ref<boolean>, handler)
  }

  // ?：显示快捷键帮助面板
  bind('help', () => {
    ElMessageBox.alert(getHotkeyHelp(), i18n.global.t('shortcuts.keyboardShortcuts'), {
      confirmButtonText: i18n.global.t('common.gotIt'),
      dangerouslyUseHTMLString: true,
      customClass: 'hotkeys-help-dialog'
    }).catch(() => {})
  })

  // Ctrl+K（macOS 为 Cmd+K）：打开命令面板（通过自定义事件触发，
  // 命令面板组件监听该事件；不再兜底点击 HeaderSearch，避免两者同时弹出）
  bindWithMeta('search', () => {
    window.dispatchEvent(new CustomEvent('stepby:open-command-palette'))
  })

  // Ctrl+Shift+F：切换全屏
  bind('fullscreen', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.()
    } else {
      document.exitFullscreen?.()
    }
  })

  // Ctrl+Shift+L：锁屏
  bind('lockScreen', () => {
    if (userStore.id) {
      lockStore.lockScreen(location.pathname + location.search)
      navigate('/lock')
    }
  })

  // Ctrl+Shift+D：切换暗黑模式
  bind('toggleDark', () => {
    settingsStore.toggleTheme()
  })

  // Ctrl+Shift+S：打开设置面板
  bind('settings', () => {
    const settingsBtn = document.querySelector(
      '.setting-trigger, .el-drawer__container[data-setting="true"], #setting-drawer'
    ) as HTMLElement
    if (settingsBtn) {
      settingsBtn.click()
    } else {
      modal.msgInfo(i18n.global.t('shortcuts.openSettingsTip'))
    }
  })

  // Ctrl+Shift+,：切换侧边栏折叠
  bind('toggleSidebar', () => {
    appStore.toggleSideBar()
  })

  // Alt+T：循环切换主题色
  bind('cycleTheme', () => {
    const themes = ['#409EFF', '#13ce66', '#f56c6c', '#ffba00', '#909399', '#5ac8fa', '#ff5722']
    const current = settingsStore.theme
    const idx = themes.indexOf(current)
    const next = themes[(idx + 1) % themes.length]
    settingsStore.changeSetting({ key: 'theme', value: next })
  })
}

/** 校验快捷键格式（仅允许字母数字和下划线，防止注入） */
export function validateHotkey(key: string): boolean {
  return /^[a-z0-9_]+$/i.test(key)
}

/** 获取快捷键显示名称 */
export function formatHotkey(keyName: string): string {
  if (!keyName) return ''
  return keyName
    .split('_')
    .map((k) => {
      if (k === 'ctrl') return 'Ctrl'
      if (k === 'shift') return 'Shift'
      if (k === 'alt') return 'Alt'
      if (k === 'slash') return '/'
      if (k === 'comma') return ','
      return k.toUpperCase()
    })
    .join(' + ')
}
