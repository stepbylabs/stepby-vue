import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, reactive, nextTick } from 'vue'
import { mount } from '@vue/test-utils'

// Hoisted mutable holders so vi.mock() factories (which run before imports) can
// reference them. The settings store must be a *reactive* object so the internal
// `watch(() => settingsStore.userPrefs.autoRefreshInterval, ...)` fires.
const h = vi.hoisted(() => ({
  store: null as unknown as { userPrefs: { autoRefreshInterval: number } },
  vis: [] as Array<{ pause: () => void; resume: () => void }>
}))

vi.mock('@/store/modules/settings', () => ({
  default: () => h.store
}))

// Mock the sibling visibility composable so we can directly drive pause/resume
// without dispatching real `visibilitychange` events.
vi.mock('@/composables/useVisibilityPause', () => ({
  useVisibilityPause: () => ({
    onPauseResume: (pause: () => void, resume: () => void) => {
      h.vis.push({ pause, resume })
    }
  })
}))

import { useAutoRefresh } from './useAutoRefresh'

let hidden = false

function mountAuto(cb: () => void | Promise<void>, immediate = false) {
  return mount(
    defineComponent({
      setup() {
        useAutoRefresh(cb, immediate)
        return () => null
      }
    })
  )
}

describe('composables/useAutoRefresh', () => {
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    hidden = false
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => hidden
    })
    h.store = reactive({ userPrefs: { autoRefreshInterval: 5 } })
    h.vis.length = 0
    vi.useFakeTimers()
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errSpy.mockRestore()
    vi.useRealTimers()
  })

  it('fires the callback once per interval and reschedules recursively', async () => {
    h.store.userPrefs.autoRefreshInterval = 1 // 1000ms
    const cb = vi.fn()
    mountAuto(cb)

    expect(cb).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(3)
  })

  it('does not schedule when interval is 0 (disabled)', async () => {
    h.store.userPrefs.autoRefreshInterval = 0
    const cb = vi.fn()
    mountAuto(cb)
    await vi.advanceTimersByTimeAsync(100000)
    expect(cb).not.toHaveBeenCalled()
  })

  it('does not schedule while the tab is hidden', async () => {
    hidden = true
    h.store.userPrefs.autoRefreshInterval = 1
    const cb = vi.fn()
    mountAuto(cb)
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb).not.toHaveBeenCalled()
  })

  it('runs the callback immediately on mount when immediate=true', async () => {
    h.store.userPrefs.autoRefreshInterval = 0
    const cb = vi.fn()
    mountAuto(cb, true)
    await vi.advanceTimersByTimeAsync(0)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('logs and swallows an immediate synchronous callback error', async () => {
    const cb = vi.fn(() => {
      throw new Error('sync boom')
    })
    h.store.userPrefs.autoRefreshInterval = 0
    expect(() => mountAuto(cb, true)).not.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(errSpy).toHaveBeenCalled()
  })

  it('logs and swallows an immediate rejected callback', async () => {
    const cb = vi.fn(async () => {
      throw new Error('async boom')
    })
    h.store.userPrefs.autoRefreshInterval = 0
    mountAuto(cb, true)
    await vi.advanceTimersByTimeAsync(0)
    expect(errSpy).toHaveBeenCalled()
  })

  it('logs and swallows an interval callback error and keeps rescheduling', async () => {
    h.store.userPrefs.autoRefreshInterval = 1
    let calls = 0
    const cb = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('tick boom')
    })
    mountAuto(cb)
    await vi.advanceTimersByTimeAsync(1000)
    expect(errSpy).toHaveBeenCalled()
    // rescheduling continues after a caught error
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(2)
  })

  it('re-sets the timer when the interval preference changes', async () => {
    h.store.userPrefs.autoRefreshInterval = 1
    const cb = vi.fn()
    mountAuto(cb)

    // change to 2s -> old 1s timer cleared, new 2s timer scheduled
    h.store.userPrefs.autoRefreshInterval = 2
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000) // total 2000ms of new interval
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('stops the interval change by resetting to 0', async () => {
    h.store.userPrefs.autoRefreshInterval = 1
    const cb = vi.fn()
    mountAuto(cb)
    h.store.userPrefs.autoRefreshInterval = 0
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb).not.toHaveBeenCalled()
  })

  it('clears the timer on visibility pause and restarts on resume', async () => {
    h.store.userPrefs.autoRefreshInterval = 1
    const cb = vi.fn()
    mountAuto(cb)
    expect(h.vis).toHaveLength(1)

    h.vis[0].pause()
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb).not.toHaveBeenCalled()

    h.vis[0].resume()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)
  })

  it('stops scheduling after the component is unmounted', async () => {
    h.store.userPrefs.autoRefreshInterval = 1
    const cb = vi.fn()
    const wrapper = mountAuto(cb)
    await vi.advanceTimersByTimeAsync(1000)
    const before = cb.mock.calls.length
    wrapper.unmount()
    await vi.advanceTimersByTimeAsync(10000)
    expect(cb).toHaveBeenCalledTimes(before)
  })
})
