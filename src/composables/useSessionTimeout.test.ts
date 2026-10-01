import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'

// Shared, mutable mocks (vi.hoisted so vi.mock factories can reference them)
const mocks = vi.hoisted(() => {
  const userStore = {
    token: 'test-token' as string | '',
    logOut: vi.fn(async () => {})
  }
  const settingsStore = {
    userPrefs: { sessionTimeout: 2 as number | null | undefined }
  }
  return {
    userStore,
    settingsStore,
    useRouter: vi.fn(() => ({ currentRoute: { value: { fullPath: '/dashboard' } } })),
    goLogin: vi.fn(),
    confirm: vi.fn(),
    t: vi.fn((key: string) => `T:${key}`)
  }
})

// Heavy / side-effectful deps must be mocked to avoid the real i18n + element-plus
// "fork worker init timeout" chain when these modules load.
vi.mock('vue-router', () => ({ useRouter: mocks.useRouter }))
vi.mock('@/store/modules/user', () => ({ default: () => mocks.userStore }))
vi.mock('@/store/modules/settings', () => ({ default: () => mocks.settingsStore }))
vi.mock('@/utils/navigation', () => ({ goLogin: mocks.goLogin }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: mocks.confirm } }))
vi.mock('@/i18n', () => ({ default: { global: { t: mocks.t } } }))

import { useSessionTimeout } from './useSessionTimeout'

// Track the mounted component so lifecycle hooks (onMounted/onBeforeUnmount) fire.
let wrapper: ReturnType<typeof mount> | null = null

function mountComposable(): void {
  wrapper = mount({
    setup() {
      useSessionTimeout()
      return () => null
    }
  })
}

const DEFAULT_MS = 2 * 60 * 1000 // sessionTimeout = 2 minutes
const WARNING_MS = DEFAULT_MS - 60 * 1000 // 60s warning window -> fires at 60_000ms

describe('composables/useSessionTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0) // lastActivity anchors to Date.now() === 0
    mocks.userStore.token = 'test-token'
    mocks.userStore.logOut.mockClear().mockResolvedValue(undefined)
    mocks.settingsStore.userPrefs.sessionTimeout = 2
    mocks.goLogin.mockClear()
    mocks.confirm.mockReset().mockReturnValue(new Promise(() => {})) // dialog stays open
    mocks.t.mockClear()
  })

  afterEach(() => {
    if (wrapper) {
      wrapper.unmount()
      wrapper = null
    }
    vi.useRealTimers()
  })

  it('does nothing when the user is not logged in', async () => {
    mocks.userStore.token = ''
    mountComposable()
    await vi.advanceTimersByTimeAsync(DEFAULT_MS + 10 * 60 * 1000)
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.userStore.logOut).not.toHaveBeenCalled()
    expect(mocks.goLogin).not.toHaveBeenCalled()
  })

  it('is disabled when sessionTimeout is 0', async () => {
    mocks.settingsStore.userPrefs.sessionTimeout = 0
    mountComposable()
    await vi.advanceTimersByTimeAsync(10 * 60 * 60 * 1000) // hours later
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.userStore.logOut).not.toHaveBeenCalled()
  })

  it('shows the warning dialog once the warning threshold is crossed', async () => {
    mountComposable()
    // Before the 60s warning window: nothing yet.
    await vi.advanceTimersByTimeAsync(WARNING_MS - 10 * 1000)
    expect(mocks.confirm).not.toHaveBeenCalled()
    // Cross into the warning window.
    await vi.advanceTimersByTimeAsync(20 * 1000)
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    const message = mocks.confirm.mock.calls[0][0]
    expect(message).toBe('T:session.timeoutWarning')
    expect(mocks.userStore.logOut).not.toHaveBeenCalled()
  })

  it('logs out and redirects to login after full inactivity', async () => {
    mountComposable()
    await vi.advanceTimersByTimeAsync(DEFAULT_MS + 1000)
    expect(mocks.userStore.logOut).toHaveBeenCalledTimes(1)
    // goLogin fires 300ms after logOut resolves.
    await vi.advanceTimersByTimeAsync(500)
    expect(mocks.goLogin).toHaveBeenCalledTimes(1)
    expect(mocks.goLogin).toHaveBeenCalledWith({ redirect: '/dashboard', reason: 'session-timeout' })
  })

  it('resetting activity via a user event delays the timeout', async () => {
    mountComposable()
    // Advance most of the way to the warning threshold.
    await vi.advanceTimersByTimeAsync(WARNING_MS - 5 * 1000) // t = 55s
    window.dispatchEvent(new Event('keydown')) // activity -> lastActivity = 55s
    // Advance a bit more; elapsed is only 40s from the reset point (< 60s) -> no warning.
    await vi.advanceTimersByTimeAsync(40 * 1000) // t = 95s
    expect(mocks.confirm).not.toHaveBeenCalled()
    // Now cross the (re-based) warning threshold. First qualifying tick is t=120s
    // (elapsed 65s from the 55s reset).
    await vi.advanceTimersByTimeAsync(30 * 1000) // t = 125s
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
  })

  it('resets the clock when the user chooses to continue', async () => {
    mocks.confirm.mockResolvedValue('confirm') // user clicks continue
    mountComposable()
    await vi.advanceTimersByTimeAsync(WARNING_MS) // warning shown + continue resolved
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
    // lastActivity reset to ~60s; original logout time (120s) is now only 60s away -> no logout.
    await vi.advanceTimersByTimeAsync(55 * 1000) // t = 115s, elapsed 55s
    expect(mocks.userStore.logOut).not.toHaveBeenCalled()
    // Full timeout is now reached relative to the reset point.
    await vi.advanceTimersByTimeAsync(10 * 1000) // t = 125s -> elapsed 65s -> warning again
    expect(mocks.confirm).toHaveBeenCalledTimes(2)
  })

  it('logs out when the warning dialog is dismissed (cancel)', async () => {
    mocks.confirm.mockRejectedValue('cancel')
    mountComposable()
    await vi.advanceTimersByTimeAsync(WARNING_MS)
    // handleWarning catch -> handleLogout
    expect(mocks.userStore.logOut).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(mocks.goLogin).toHaveBeenCalledTimes(1)
  })

  it('tolerates a failing logOut() and still redirects', async () => {
    mocks.userStore.logOut.mockRejectedValueOnce(new Error('network'))
    mountComposable()
    await vi.advanceTimersByTimeAsync(DEFAULT_MS + 1000)
    await vi.advanceTimersByTimeAsync(500)
    expect(mocks.userStore.logOut).toHaveBeenCalledTimes(1)
    expect(mocks.goLogin).toHaveBeenCalledTimes(1)
  })

  it('uses the default 30-minute threshold when sessionTimeout is undefined', async () => {
    mocks.settingsStore.userPrefs.sessionTimeout = undefined
    mountComposable()
    // Just before the default warning window (30min - 60s = 1740s)
    await vi.advanceTimersByTimeAsync(1740 * 1000 - 10 * 1000)
    expect(mocks.confirm).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(20 * 1000)
    expect(mocks.confirm).toHaveBeenCalledTimes(1)
  })

  it('stops the interval after unmount (no warning/logout)', async () => {
    mountComposable()
    await vi.advanceTimersByTimeAsync(30 * 1000)
    wrapper!.unmount()
    wrapper = null
    await vi.advanceTimersByTimeAsync(10 * DEFAULT_MS)
    expect(mocks.confirm).not.toHaveBeenCalled()
    expect(mocks.userStore.logOut).not.toHaveBeenCalled()
  })

  it('clears a pending logout redirect on unmount', async () => {
    mountComposable()
    await vi.advanceTimersByTimeAsync(DEFAULT_MS + 100) // logout triggered, 300ms redirect pending
    expect(mocks.userStore.logOut).toHaveBeenCalledTimes(1)
    wrapper!.unmount()
    wrapper = null
    await vi.advanceTimersByTimeAsync(5000)
    expect(mocks.goLogin).not.toHaveBeenCalled()
  })
})
