import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { nextTick } from 'vue'

const DEFAULT_SETTINGS = {
  title: 'App',
  sideTheme: 'theme-auto',
  showSettings: true,
  navType: 1,
  tagsView: true,
  tagsViewPersist: false,
  tagsIcon: false,
  tagsViewStyle: 'card',
  fixedHeader: true,
  sidebarLogo: true,
  dynamicTitle: false,
  footerVisible: false,
  footerContent: 'Footer'
}

vi.mock('@/settings', () => ({ default: { ...DEFAULT_SETTINGS } }))

// darkRef + toggleDark are shared across re-imports (the mock factory closes over them).
// darkRef must be a real reactive Vue ref so the Pinia `isDark` getter tracks it.
const { holder, toggleDark } = vi.hoisted(() => ({
  holder: { darkRef: { value: false } as { value: boolean } },
  toggleDark: vi.fn((val?: boolean) => {
    holder.darkRef.value = val === undefined ? !holder.darkRef.value : val
  })
}))
vi.mock('@vueuse/core', async () => {
  const { ref } = await import('vue')
  holder.darkRef = ref(false) as unknown as { value: boolean }
  toggleDark.mockImplementation((val?: boolean) => {
    holder.darkRef.value = val === undefined ? !holder.darkRef.value : val
  })
  return { useDark: () => holder.darkRef, useToggle: () => toggleDark }
})

const { applyDynamicTitle, handleThemeStyle, cacheMock, matchMediaMock } = vi.hoisted(() => {
  const stored: Record<string, string> = {}
  return {
    applyDynamicTitle: vi.fn(),
    handleThemeStyle: vi.fn(),
    cacheMock: {
      local: {
        _store: stored,
        set: vi.fn((k: string, v: string) => {
          stored[k] = v
        }),
        setJSON: vi.fn((k: string, v: unknown) => {
          stored[k] = JSON.stringify(v)
        }),
        get: vi.fn((k: string) => (k in stored ? stored[k] : null))
      }
    },
    matchMediaMock: vi.fn(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    }))
  }
})

vi.mock('@/utils/dynamicTitle', () => ({ applyDynamicTitle }))
vi.mock('@/utils/theme', () => ({ handleThemeStyle }))
vi.mock('@/plugins/cache', () => ({ default: cacheMock }))

import { DEFAULT_USER_PREFS } from '@/utils/userPrefs'

async function loadSettingsStore() {
  setActivePinia(createPinia())
  vi.resetModules()
  const mod = await import('./settings')
  return mod.default()
}

describe('store/modules/settings', () => {
  beforeEach(() => {
    localStorage.clear()
    holder.darkRef.value = false
    toggleDark.mockClear()
    applyDynamicTitle.mockClear()
    handleThemeStyle.mockClear()
    cacheMock.local.set.mockClear()
    cacheMock.local.setJSON.mockClear()
    for (const k of Object.keys(cacheMock.local._store)) delete cacheMock.local._store[k]
    vi.stubGlobal('matchMedia', matchMediaMock)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('initializes from defaultSettings when no localStorage layout-setting', async () => {
    const store = await loadSettingsStore()
    expect(store.theme).toBe('#409EFF')
    expect(store.sideTheme).toBe('theme-auto')
    expect(store.navType).toBe(1)
    expect(store.tagsView).toBe(true)
    expect(store.tagsViewPersist).toBe(false)
    expect(store.footerContent).toBe('Footer')
    expect(store.userPrefs).toEqual(DEFAULT_USER_PREFS)
  })

  it('applies persisted layout-setting overrides on load', async () => {
    localStorage.setItem(
      'layout-setting',
      JSON.stringify({ theme: '#ff0000', navType: 0, tagsView: false, fixedHeader: false, sideTheme: 'theme-dark' })
    )
    const store = await loadSettingsStore()
    expect(store.theme).toBe('#ff0000')
    // navType 0 is defined (not undefined) so it must win over the default 1
    expect(store.navType).toBe(0)
    expect(store.tagsView).toBe(false)
    expect(store.fixedHeader).toBe(false)
    expect(store.sideTheme).toBe('theme-dark')
  })

  it('merges persisted user-prefs over defaults and drops unknown keys', async () => {
    localStorage.setItem('user-prefs', JSON.stringify({ defaultPageSize: 50, hackerInjected: 'x' }))
    const store = await loadSettingsStore()
    expect(store.userPrefs.defaultPageSize).toBe(50)
    expect(store.userPrefs.timezone).toBe(DEFAULT_USER_PREFS.timezone)
    expect((store.userPrefs as Record<string, unknown>).hackerInjected).toBeUndefined()
  })

  it('survives corrupt layout-setting JSON by falling back to defaults', async () => {
    localStorage.setItem('layout-setting', '{ this is not json')
    const store = await loadSettingsStore()
    expect(store.theme).toBe('#409EFF')
  })

  it('changeSetting updates an allowed key, applies theme style and persists', async () => {
    const store = await loadSettingsStore()
    store.changeSetting({ key: 'theme', value: '#123456' })
    expect(store.theme).toBe('#123456')
    expect(handleThemeStyle).toHaveBeenCalledWith('#123456')
    const persisted = JSON.parse(cacheMock.local._store['layout-setting'])
    expect(persisted.theme).toBe('#123456')
  })

  it('changeSetting on a non-theme key does not call handleThemeStyle but still persists', async () => {
    const store = await loadSettingsStore()
    handleThemeStyle.mockClear()
    store.changeSetting({ key: 'tagsView', value: false })
    expect(store.tagsView).toBe(false)
    expect(handleThemeStyle).not.toHaveBeenCalled()
    expect(cacheMock.local.set).toHaveBeenCalledWith('layout-setting', expect.stringContaining('"tagsView":false'))
  })

  it('changeSetting ignores unknown keys (no state mutation / no persist)', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const store = await loadSettingsStore()
    cacheMock.local.set.mockClear()
    store.changeSetting({ key: 'evilProto', value: 'boom' })
    expect(store.evilProto).toBeUndefined()
    expect(cacheMock.local.set).not.toHaveBeenCalled()
    expect(warn).toHaveBeenCalled()
    warn.mockRestore()
  })

  it('persistLayoutSetting serializes the documented layout keys', async () => {
    const store = await loadSettingsStore()
    store.persistLayoutSetting()
    const persisted = JSON.parse(cacheMock.local._store['layout-setting'])
    expect(Object.keys(persisted).sort()).toEqual(
      [
        'dynamicTitle',
        'fixedHeader',
        'sideTheme',
        'tagsIcon',
        'tagsView',
        'tagsViewPersist',
        'tagsViewStyle',
        'theme',
        'footerVisible',
        'sidebarLogo'
      ].sort()
    )
  })

  it('setTitle stores title and refreshes the dynamic document title', async () => {
    const store = await loadSettingsStore()
    store.setTitle('Hello')
    expect(store.title).toBe('Hello')
    expect(applyDynamicTitle).toHaveBeenCalledTimes(1)
    // b124：值由 store 传入（util 不再反向 import store）——传什么必须可断言
    expect(applyDynamicTitle).toHaveBeenCalledWith({ dynamicTitle: store.dynamicTitle, title: 'Hello' })
  })

  it('toggleTheme flips dark mode and reapplies theme style on nextTick', async () => {
    const store = await loadSettingsStore()
    expect(store.isDark).toBe(false)
    store.toggleTheme()
    expect(toggleDark).toHaveBeenCalled()
    expect(store.isDark).toBe(true)
    await nextTick()
    expect(handleThemeStyle).toHaveBeenCalledWith(store.theme)
  })

  it('updateUserPrefs merges and persists; followSystemDark=true registers the watcher', async () => {
    const store = await loadSettingsStore()
    store.updateUserPrefs({ defaultPageSize: 25, followSystemDark: true })
    expect(store.userPrefs.defaultPageSize).toBe(25)
    expect(store.userPrefs.followSystemDark).toBe(true)
    expect(cacheMock.local.setJSON).toHaveBeenCalledWith('user-prefs', store.userPrefs)
    expect(matchMediaMock).toHaveBeenCalledWith('(prefers-color-scheme: dark)')
  })

  it('updateUserPrefs with followSystemDark=false unregisters an existing watcher', async () => {
    const removeEventListener = vi.fn()
    matchMediaMock.mockImplementation(() => ({
      matches: false,
      addEventListener: vi.fn(),
      removeEventListener
    }))
    const store = await loadSettingsStore()
    store.updateUserPrefs({ followSystemDark: true })
    store.updateUserPrefs({ followSystemDark: false })
    expect(store.userPrefs.followSystemDark).toBe(false)
    // second call to updateUserPrefs must tear down the previously registered listener
    expect(removeEventListener).toHaveBeenCalled()
  })

  it('initSystemDarkWatcher registers by default (followSystemDark=true) and respects explicit disable', async () => {
    matchMediaMock.mockClear()
    const store = await loadSettingsStore()
    store.initSystemDarkWatcher()
    // 真机核查修复：默认跟随系统暗色（页面自适配，避免国产浏览器夜间模式强制反色）
    expect(store.userPrefs.followSystemDark).toBe(true)
    expect(matchMediaMock).toHaveBeenCalled()

    store.updateUserPrefs({ followSystemDark: false })
    matchMediaMock.mockClear()
    store.initSystemDarkWatcher()
    expect(matchMediaMock).not.toHaveBeenCalled()
  })

  // ==================== 批八十六 N-1：sys.index.sideTheme 真旋钮 ====================

  it('setUserSideTheme 收合法值：落值、落盘、并打「用户显式选择」标记', async () => {
    const store = await loadSettingsStore()
    cacheMock.local.set.mockClear()
    expect(store.setUserSideTheme('theme-dark')).toBe(true)
    expect(store.sideTheme).toBe('theme-dark')
    expect(localStorage.getItem('stepby_sidetheme_user_set')).toBe('1')
    expect(cacheMock.local.set).toHaveBeenCalledWith('layout-setting', expect.any(String))
    expect(handleThemeStyle).toHaveBeenCalled()
  })

  it('setUserSideTheme 拒非法值：状态、存档、标记三者都不许动（不写未知类名）', async () => {
    const store = await loadSettingsStore()
    const before = store.sideTheme
    cacheMock.local.set.mockClear()
    for (const bad of ['skin-blue', 'theme-auto ', 'Theme-dark', '', 'javascript:alert(1)']) {
      expect(store.setUserSideTheme(bad)).toBe(false)
    }
    expect(store.sideTheme).toBe(before)
    expect(localStorage.getItem('stepby_sidetheme_user_set')).toBeNull()
    expect(cacheMock.local.set).not.toHaveBeenCalled()
  })

  it('changeSetting(sideTheme) 经同一通道：绕过标记就没有"尊重用户选择"这回事', async () => {
    const store = await loadSettingsStore()
    store.changeSetting({ key: 'sideTheme', value: 'theme-light' })
    expect(store.sideTheme).toBe('theme-light')
    expect(localStorage.getItem('stepby_sidetheme_user_set')).toBe('1')
  })

  it('applyPlatformSideTheme 在用户从未选择过时生效，且刻意不写存档', async () => {
    const store = await loadSettingsStore()
    cacheMock.local.set.mockClear()
    expect(store.applyPlatformSideTheme('theme-dark')).toBe(true)
    expect(store.sideTheme).toBe('theme-dark')
    // 平台缺省不是用户的选择：写进存档就等于把它冻成"用户显式选择"，
    // 之后平台再改就永远不生效（这条是"假旋钮复活"的唯一机械判据）
    expect(cacheMock.local.set).not.toHaveBeenCalled()
    expect(localStorage.getItem('stepby_sidetheme_user_set')).toBeNull()
  })

  it('applyPlatformSideTheme 在用户显式选过之后一律无效', async () => {
    const store = await loadSettingsStore()
    store.setUserSideTheme('theme-light')
    expect(store.applyPlatformSideTheme('theme-dark')).toBe(false)
    expect(store.sideTheme).toBe('theme-light')
  })

  it('applyPlatformSideTheme 对值域外的下发值不生效（边界防御，含历史脏值）', async () => {
    const store = await loadSettingsStore()
    const before = store.sideTheme
    for (const bad of ['skin-blue', 'Theme-Auto', 'theme-dark ', null, undefined, 42, { x: 1 }]) {
      expect(store.applyPlatformSideTheme(bad)).toBe(false)
      expect(store.sideTheme).toBe(before)
    }
    // 正控：合法值必须真能落上（否则上面五条可以是"永远返回 false"的实现）
    expect(store.applyPlatformSideTheme('theme-light')).toBe(true)
    expect(store.sideTheme).toBe('theme-light')
  })

  it('存档里被注入未知 sideTheme 时回落出厂缺省（不写进类名）', async () => {
    localStorage.setItem('layout-setting', JSON.stringify({ sideTheme: 'evil-class' }))
    const store = await loadSettingsStore()
    expect(store.sideTheme).toBe(DEFAULT_SETTINGS.sideTheme)
  })
})
