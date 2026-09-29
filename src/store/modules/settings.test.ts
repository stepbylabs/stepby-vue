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

const { useDynamicTitle, handleThemeStyle, cacheMock, matchMediaMock } = vi.hoisted(() => {
  const stored: Record<string, string> = {}
  return {
    useDynamicTitle: vi.fn(),
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

vi.mock('@/utils/dynamicTitle', () => ({ useDynamicTitle }))
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
    useDynamicTitle.mockClear()
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
    expect(useDynamicTitle).toHaveBeenCalledTimes(1)
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
})
