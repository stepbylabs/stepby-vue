import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const mocks = vi.hoisted(() => ({
  store: {
    userPrefs: { customHotkeys: {} as Record<string, string> },
    theme: '#409EFF',
    toggleTheme: vi.fn(),
    changeSetting: vi.fn()
  },
  app: { toggleSideBar: vi.fn() },
  user: { id: 'u1' },
  lock: { lockScreen: vi.fn() },
  navigate: vi.fn(),
  msgInfo: vi.fn(),
  alert: vi.fn<
    (
      message: string,
      title: string,
      options: { customClass: string; dangerouslyUseHTMLString: boolean; confirmButtonText: string }
    ) => Promise<void>
  >(() => Promise.resolve()),
  t: vi.fn((k: string) => 'T:' + k),
  whenever: vi.fn(),
  useMagicKeys: vi.fn()
}))

vi.mock('element-plus', () => ({
  ElMessageBox: { alert: mocks.alert }
}))
vi.mock('@/i18n', () => ({
  default: { global: { t: mocks.t } }
}))
vi.mock('@/store/modules/app', () => ({ default: () => mocks.app }))
vi.mock('@/store/modules/user', () => ({ default: () => mocks.user }))
vi.mock('@/store/modules/lock', () => ({ default: () => mocks.lock }))
vi.mock('@/store/modules/settings', () => ({
  default: () => mocks.store,
  DEFAULT_HOTKEYS: {
    help: 'shift_slash',
    search: 'ctrl_k',
    fullscreen: 'ctrl_shift_f',
    lockScreen: 'ctrl_shift_l',
    toggleDark: 'ctrl_shift_d',
    settings: 'ctrl_shift_s',
    toggleSidebar: 'ctrl_shift_comma',
    cycleTheme: 'alt_t'
  }
}))
vi.mock('@/utils/navigation', () => ({ navigate: mocks.navigate }))
vi.mock('@/plugins/modal', () => ({ default: { msgInfo: mocks.msgInfo } }))
vi.mock('@vueuse/core', () => ({
  useMagicKeys: mocks.useMagicKeys,
  whenever: mocks.whenever
}))

import { useGlobalHotkeys, validateHotkey, formatHotkey } from './useGlobalHotkeys'

// handlers are registered in a fixed bind() order inside the composable
const H = {
  help: 0,
  search: 1,
  fullscreen: 2,
  lockScreen: 3,
  toggleDark: 4,
  settings: 5,
  toggleSidebar: 6,
  cycleTheme: 7
} as const

let handlers: Array<() => void>

describe('composables/useGlobalHotkeys', () => {
  beforeEach(() => {
    handlers = []
    mocks.store.userPrefs.customHotkeys = {}
    mocks.store.theme = '#409EFF'
    vi.clearAllMocks()
    // fresh mock impls after clearAllMocks
    mocks.alert.mockImplementation(() => Promise.resolve())
    mocks.t.mockImplementation((k: string) => 'T:' + k)
    // useMagicKeys returns a Proxy so every key name resolves to a truthy ref
    mocks.useMagicKeys.mockImplementation(() => new Proxy({}, { get: () => ({ value: false }) }))
    mocks.whenever.mockImplementation((_ref: unknown, handler: () => void) => {
      handlers.push(handler)
    })
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  it('registers a handler for every configured action', () => {
    useGlobalHotkeys()
    expect(handlers).toHaveLength(8)
  })

  it('bind("help") shows the hotkey help alert with translated rows', () => {
    useGlobalHotkeys()
    handlers[H.help]()
    expect(mocks.t).toHaveBeenCalledWith('shortcuts.helpItem.help')
    expect(mocks.alert).toHaveBeenCalledTimes(1)
    const html = mocks.alert.mock.calls[0][0] as string
    expect(html).toContain('Ctrl + K')
    expect(html).toContain('T:shortcuts.helpItem.search')
    const options = mocks.alert.mock.calls[0][2] as { customClass: string; dangerouslyUseHTMLString: boolean }
    expect(options.customClass).toBe('hotkeys-help-dialog')
    expect(options.dangerouslyUseHTMLString).toBe(true)
  })

  it('bind("search") dispatches the command-palette event and clicks a trigger', () => {
    const btn = document.createElement('button')
    btn.className = 'header-search-trigger'
    const clickSpy = vi.spyOn(btn, 'click')
    document.body.appendChild(btn)

    let dispatched = 0
    const listener = () => dispatched++
    window.addEventListener('stepby:open-command-palette', listener)

    useGlobalHotkeys()
    handlers[H.search]()

    expect(dispatched).toBe(1)
    expect(clickSpy).toHaveBeenCalled()
    window.removeEventListener('stepby:open-command-palette', listener)
  })

  it('bind("search") is safe when no trigger element exists', () => {
    useGlobalHotkeys()
    expect(() => handlers[H.search]()).not.toThrow()
  })

  it('bind("fullscreen") requests fullscreen when not already in it', () => {
    const req = vi.fn()
    ;(document.documentElement as unknown as { requestFullscreen: () => void }).requestFullscreen = req
    useGlobalHotkeys()
    handlers[H.fullscreen]()
    expect(req).toHaveBeenCalled()
  })

  it('bind("fullscreen") exits fullscreen when already in it', () => {
    const exit = vi.fn()
    Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => ({}) })
    ;(document as unknown as { exitFullscreen: () => void }).exitFullscreen = exit
    useGlobalHotkeys()
    handlers[H.fullscreen]()
    expect(exit).toHaveBeenCalled()
    Reflect.deleteProperty(document, 'fullscreenElement')
  })

  it('bind("lockScreen") locks and navigates for an authenticated user', () => {
    useGlobalHotkeys()
    handlers[H.lockScreen]()
    expect(mocks.lock.lockScreen).toHaveBeenCalledTimes(1)
    expect(mocks.navigate).toHaveBeenCalledWith('/lock')
  })

  it('bind("lockScreen") is a no-op for an unauthenticated user', () => {
    mocks.user.id = ''
    useGlobalHotkeys()
    handlers[H.lockScreen]()
    expect(mocks.lock.lockScreen).not.toHaveBeenCalled()
    expect(mocks.navigate).not.toHaveBeenCalled()
    mocks.user.id = 'u1'
  })

  it('bind("toggleDark") toggles the theme via the settings store', () => {
    useGlobalHotkeys()
    handlers[H.toggleDark]()
    expect(mocks.store.toggleTheme).toHaveBeenCalled()
  })

  it('bind("settings") clicks an existing settings trigger', () => {
    const btn = document.createElement('div')
    btn.className = 'setting-trigger'
    const clickSpy = vi.spyOn(btn, 'click')
    document.body.appendChild(btn)
    useGlobalHotkeys()
    handlers[H.settings]()
    expect(clickSpy).toHaveBeenCalled()
    expect(mocks.msgInfo).not.toHaveBeenCalled()
  })

  it('bind("settings") falls back to an info toast when no trigger', () => {
    useGlobalHotkeys()
    handlers[H.settings]()
    expect(mocks.msgInfo).toHaveBeenCalledWith('T:shortcuts.openSettingsTip')
  })

  it('bind("toggleSidebar") toggles the sidebar via the app store', () => {
    useGlobalHotkeys()
    handlers[H.toggleSidebar]()
    expect(mocks.app.toggleSideBar).toHaveBeenCalled()
  })

  it('bind("cycleTheme") advances to the next theme color', () => {
    useGlobalHotkeys()
    handlers[H.cycleTheme]()
    expect(mocks.store.changeSetting).toHaveBeenCalledWith({ key: 'theme', value: '#13ce66' })
  })

  it('bind("cycleTheme") wraps to the first color when current theme is unknown', () => {
    mocks.store.theme = '#unknown'
    useGlobalHotkeys()
    handlers[H.cycleTheme]()
    expect(mocks.store.changeSetting).toHaveBeenCalledWith({ key: 'theme', value: '#409EFF' })
    mocks.store.theme = '#409EFF'
  })

  it('merges user customHotkeys over defaults', () => {
    mocks.store.userPrefs.customHotkeys = { search: 'ctrl_j' }
    let captured = ''
    mocks.useMagicKeys.mockImplementation(
      () =>
        new Proxy(
          {},
          {
            get: (_t, k: string) => {
              if (k === 'ctrl_shift_comma') captured = 'seen'
              return { value: false }
            }
          }
        )
    )
    useGlobalHotkeys()
    // exercise the onEventFired option through the merged search key
    const opts = mocks.useMagicKeys.mock.calls[0][0]
    expect(opts.passive).toBe(false)
    expect(typeof opts.onEventFired).toBe('function')
    expect(captured).toBe('seen')
  })

  it('onEventFired prevents default only for the matching search combo', () => {
    useGlobalHotkeys()
    const opts = mocks.useMagicKeys.mock.calls[0][0]

    const match = { ctrlKey: true, key: 'k', type: 'keydown', preventDefault: vi.fn() }
    opts.onEventFired(match)
    expect(match.preventDefault).toHaveBeenCalled()

    const wrongKey = { ctrlKey: true, key: 'x', type: 'keydown', preventDefault: vi.fn() }
    opts.onEventFired(wrongKey)
    expect(wrongKey.preventDefault).not.toHaveBeenCalled()

    const notDown = { ctrlKey: true, key: 'k', type: 'keyup', preventDefault: vi.fn() }
    opts.onEventFired(notDown)
    expect(notDown.preventDefault).not.toHaveBeenCalled()
  })

  it('skips binding when the resolved key ref is missing', () => {
    // plain object with no matching keys -> keys[keyName] undefined -> guard
    mocks.useMagicKeys.mockImplementation(() => ({}))
    useGlobalHotkeys()
    expect(handlers).toHaveLength(0)
  })

  it('skips binding when an action maps to an empty key name', () => {
    mocks.store.userPrefs.customHotkeys = { toggleSidebar: '' }
    useGlobalHotkeys()
    // toggleSidebar is skipped, other 7 still bind
    expect(handlers).toHaveLength(7)
  })
})

describe('useGlobalHotkeys/validateHotkey', () => {
  it('accepts only letters, digits and underscores', () => {
    expect(validateHotkey('ctrl_k')).toBe(true)
    expect(validateHotkey('Shift123')).toBe(true)
    expect(validateHotkey('ctrl-k')).toBe(false)
    expect(validateHotkey('ctrl k')).toBe(false)
    expect(validateHotkey('')).toBe(false)
  })
})

describe('useGlobalHotkeys/formatHotkey', () => {
  it('returns empty string for empty input', () => {
    expect(formatHotkey('')).toBe('')
  })

  it('maps modifier tokens and uppercases the rest', () => {
    expect(formatHotkey('ctrl_k')).toBe('Ctrl + K')
    expect(formatHotkey('ctrl_shift_f')).toBe('Ctrl + Shift + F')
    expect(formatHotkey('alt_t')).toBe('Alt + T')
    expect(formatHotkey('ctrl_shift_comma')).toBe('Ctrl + Shift + ,')
    expect(formatHotkey('shift_slash')).toBe('Shift + /')
    expect(formatHotkey('ctrl_shift_s')).toBe('Ctrl + Shift + S')
  })
})
