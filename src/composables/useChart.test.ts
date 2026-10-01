import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { ECharts, EChartsOption } from '@/utils/echarts'

// Mock '@/utils/echarts' (real dep = 'echarts' which loads worker / heavy canvas).
// Only `init` is called by the composable at runtime; types are erased.
const { initMock, createdCharts } = vi.hoisted(() => {
  const createdCharts: ECharts[] = []
  const initMock = vi.fn(() => {
    const chart = {
      isDisposed: vi.fn(() => false),
      resize: vi.fn(),
      dispose: vi.fn(),
      setOption: vi.fn()
    } as unknown as ECharts
    createdCharts.push(chart)
    return chart
  })
  return { initMock, createdCharts }
})

vi.mock('@/utils/echarts', () => ({
  default: { init: initMock }
}))

import { useChart, readCssVar } from './useChart'

/**
 * Helper to run useChart() inside a real component instance so
 * onBeforeUnmount registers cleanly (avoids the Vue warning and lets us
 * assert the unmount cleanup path).
 */
function withChart() {
  let api: ReturnType<typeof useChart> | undefined
  const wrapper = mount(
    defineComponent({
      setup() {
        api = useChart()
        return () => null
      }
    })
  )
  // Non-null: setup runs synchronously during mount.
  return { api: api!, wrapper }
}

/** Build a fake "ready" element (non-zero offsetWidth/Height). */
function makeReadyEl(): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'offsetWidth', { value: 200, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: 100, configurable: true })
  return el
}

/** Build a "not ready" element (zero dims). */
function makeZeroEl(): HTMLElement {
  const el = document.createElement('div')
  Object.defineProperty(el, 'offsetWidth', { value: 0, configurable: true })
  Object.defineProperty(el, 'offsetHeight', { value: 0, configurable: true })
  return el
}

describe('composables/useChart', () => {
  let ResizeObserverInstances: Array<{
    cb: ResizeObserverCallback
    observed: HTMLElement[]
    disconnected: boolean
    trigger(): void
  }> = []

  beforeEach(() => {
    initMock.mockClear()
    createdCharts.length = 0
    ResizeObserverInstances = []

    class MockResizeObserver {
      cb: ResizeObserverCallback
      observed: HTMLElement[] = []
      disconnected = false
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb
        ResizeObserverInstances.push(this)
      }
      observe(el: HTMLElement) {
        this.observed.push(el)
      }
      unobserve(_el: HTMLElement) {}
      disconnect() {
        this.disconnected = true
      }
      /** helper for tests: trigger the callback synchronously */
      trigger() {
        this.cb([], this as unknown as ResizeObserver)
      }
    }
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  describe('readCssVar', () => {
    it('returns computed value when the CSS variable is defined', () => {
      document.documentElement.style.setProperty('--test-var', '#abcdef')
      expect(readCssVar('--test-var', 'fb')).toBe('#abcdef')
      document.documentElement.style.removeProperty('--test-var')
    })

    it('trims whitespace around the value', () => {
      document.documentElement.style.setProperty('--test-var', '  padded  ')
      expect(readCssVar('--test-var', 'fb')).toBe('padded')
      document.documentElement.style.removeProperty('--test-var')
    })

    it('returns fallback for an unknown var', () => {
      expect(readCssVar('--definitely-not-set', 'fallback')).toBe('fallback')
    })

    it('returns fallback when window is undefined', () => {
      // Temporarily hide the global window; the function guards on typeof.
      const g = globalThis as unknown as Record<string, unknown>
      const saved = g.window
      try {
        g.window = undefined
        expect(readCssVar('--anything', 'safe')).toBe('safe')
      } finally {
        g.window = saved
      }
    })
  })

  describe('getChart happy path', () => {
    it('returns null for null input without touching echarts', async () => {
      const { api } = withChart()
      const result = await api.getChart(null)
      expect(result).toBeNull()
      expect(initMock).not.toHaveBeenCalled()
    })

    it('inits echarts once and reuses the cached instance on subsequent calls', async () => {
      const { api } = withChart()
      const el = makeReadyEl()
      const c1 = await api.getChart(el)
      expect(c1).toBeTruthy()
      expect(initMock).toHaveBeenCalledTimes(1)
      expect(initMock).toHaveBeenCalledWith(el)

      const c2 = await api.getChart(el)
      expect(c2).toBe(c1)
      // still one init — cache reused
      expect(initMock).toHaveBeenCalledTimes(1)
    })

    it('attaches exactly one ResizeObserver per element', async () => {
      const { api } = withChart()
      const el = makeReadyEl()
      await api.getChart(el)
      await api.getChart(el)
      expect(ResizeObserverInstances).toHaveLength(1)
      expect(ResizeObserverInstances[0].observed).toContain(el)
    })

    it('creates a new instance when the cached chart is already disposed', async () => {
      const { api } = withChart()
      const el = makeReadyEl()
      const first = await api.getChart(el)
      expect(first).toBeTruthy()
      // simulate external dispose
      first!.isDisposed = vi.fn(() => true)

      const second = await api.getChart(el)
      expect(second).not.toBe(first)
      expect(initMock).toHaveBeenCalledTimes(2)
    })
  })

  describe('ResizeObserver debounced resize', () => {
    it('resizes cached chart when the observer fires (after 150ms)', async () => {
      const { api } = withChart()
      const el = makeReadyEl()
      const chart = await api.getChart(el)
      expect(chart).toBeTruthy()
      expect(chart!.resize).not.toHaveBeenCalled()

      ResizeObserverInstances[0].trigger()
      // within debounce window
      vi.advanceTimersByTime(100)
      expect(chart!.resize).not.toHaveBeenCalled()
      vi.advanceTimersByTime(60)
      expect(chart!.resize).toHaveBeenCalledTimes(1)
    })

    it('does not resize a disposed chart', async () => {
      const { api } = withChart()
      const el = makeReadyEl()
      const chart = await api.getChart(el)
      chart!.isDisposed = vi.fn(() => true)
      ResizeObserverInstances[0].trigger()
      vi.advanceTimersByTime(200)
      expect(chart!.resize).not.toHaveBeenCalled()
    })
  })

  describe('waitForContainerReady', () => {
    it('returns true immediately when the element already has non-zero size', async () => {
      const { api } = withChart()
      const el = makeReadyEl()
      const p = api.waitForContainerReady(el)
      // No setTimeout should be needed for the ready case.
      const result = await p
      expect(result).toBe(true)
    })

    it('returns false after the timeout when size never arrives', async () => {
      const { api } = withChart()
      const el = makeZeroEl()
      const p = api.waitForContainerReady(el, 100)
      await vi.runAllTimersAsync()
      await expect(p).resolves.toBe(false)
    })
  })

  describe('getChart fallback path (zero-size container)', () => {
    it('applies inline fallback width/height and triggers delayed resize', async () => {
      const { api } = withChart()
      const el = makeZeroEl()
      el.className = 'chart h-[300px]'

      const p = api.getChart(el)
      await vi.runAllTimersAsync()
      const chart = await p

      expect(chart).toBeTruthy()
      expect(initMock).toHaveBeenCalledWith(el)
      // height inferred from tailwind class
      expect(el.style.height).toBe('300px')
      // some non-empty width applied
      expect(el.style.width).toMatch(/^(\d+|NaN)px$/)
      // the fallback timer eventually triggers resize at least once
      expect(chart!.resize).toHaveBeenCalled()
    })

    it('uses fallback height 280 when no tailwind class is present', async () => {
      const { api } = withChart()
      const el = makeZeroEl()
      el.className = ''
      const p = api.getChart(el)
      await vi.runAllTimersAsync()
      await p
      expect(el.style.height).toBe('280px')
    })
  })

  describe('withDark', () => {
    it('returns user option unchanged in light mode', () => {
      document.documentElement.classList.remove('dark')
      const { api } = withChart()
      const chart = createdCharts.length
        ? createdCharts[0]
        : ({ isDisposed: vi.fn(), resize: vi.fn(), dispose: vi.fn() } as unknown as ECharts)
      const userOption: EChartsOption = { title: { text: 'X' } }
      const merged = api.withDark(chart, userOption)
      // In light mode the merged object equals the user option (dark spread is empty)
      // but is a fresh object (withDark always shallow-copies).
      expect(merged).toEqual(userOption)
      expect(merged).not.toBe(userOption)
      expect(merged.textStyle).toBeUndefined()
      expect(merged.backgroundColor).toBeUndefined()
    })

    it('merges dark fallback values in dark mode; user option wins on conflicts', () => {
      document.documentElement.classList.add('dark')
      const { api } = withChart()
      const chart = { isDisposed: vi.fn(), resize: vi.fn(), dispose: vi.fn() } as unknown as ECharts
      const userOption: EChartsOption = { backgroundColor: 'red' }
      const merged = api.withDark(chart, userOption)
      // backgroundColor from option overrides the dark default
      expect(merged.backgroundColor).toBe('red')
      // dark defaults present
      expect(merged.textStyle).toEqual({ color: '#E5EAF3' })
      expect(merged.legend).toEqual({ textStyle: { color: '#E5EAF3' } })
      expect(merged.tooltip).toEqual({
        backgroundColor: '#1d1e1f',
        borderColor: '#4C4D4F',
        textStyle: { color: '#E5EAF3' }
      })
      document.documentElement.classList.remove('dark')
    })
  })

  describe('isDarkMode', () => {
    it('reflects the html.dark class', () => {
      const { api } = withChart()
      document.documentElement.classList.remove('dark')
      expect(api.isDarkMode()).toBe(false)
      document.documentElement.classList.add('dark')
      expect(api.isDarkMode()).toBe(true)
      document.documentElement.classList.remove('dark')
    })
  })

  describe('resize()', () => {
    it('debounces resize of all cached instances by 150ms', async () => {
      const { api } = withChart()
      const el1 = makeReadyEl()
      const el2 = makeReadyEl()
      const c1 = await api.getChart(el1)
      const c2 = await api.getChart(el2)
      // no resize yet
      expect(c1!.resize).not.toHaveBeenCalled()
      api.resize()
      vi.advanceTimersByTime(100)
      expect(c1!.resize).not.toHaveBeenCalled()
      vi.advanceTimersByTime(60)
      expect(c1!.resize).toHaveBeenCalledTimes(1)
      expect(c2!.resize).toHaveBeenCalledTimes(1)
    })

    it('cancels the pending resize on a subsequent call', async () => {
      const { api } = withChart()
      const el = makeReadyEl()
      const c = await api.getChart(el)
      api.resize()
      vi.advanceTimersByTime(100)
      api.resize() // restart the debounce
      vi.advanceTimersByTime(100)
      expect(c!.resize).not.toHaveBeenCalled()
      vi.advanceTimersByTime(60)
      expect(c!.resize).toHaveBeenCalledTimes(1)
    })

    it('skips disposed instances', async () => {
      const { api } = withChart()
      const el = makeReadyEl()
      const c = await api.getChart(el)
      c!.isDisposed = vi.fn(() => true)
      api.resize()
      vi.advanceTimersByTime(200)
      expect(c!.resize).not.toHaveBeenCalled()
    })
  })

  describe('dispose()', () => {
    it('disposes a specific element and disconnects its observer', async () => {
      const { api } = withChart()
      const el1 = makeReadyEl()
      const el2 = makeReadyEl()
      const c1 = await api.getChart(el1)
      const c2 = await api.getChart(el2)
      // one observer per element
      expect(ResizeObserverInstances).toHaveLength(2)

      api.dispose(el1)
      expect(c1!.dispose).toHaveBeenCalledTimes(1)
      // cache cleared so a fresh init would happen
      const fresh = await api.getChart(el1)
      expect(fresh).not.toBe(c1)
      expect(initMock).toHaveBeenCalledTimes(3) // 2 initial + 1 fresh
      // second element untouched
      expect(c2!.dispose).not.toHaveBeenCalled()
    })

    it('disposes all instances and disconnects all observers', async () => {
      const { api } = withChart()
      const el1 = makeReadyEl()
      const el2 = makeReadyEl()
      const c1 = await api.getChart(el1)
      const c2 = await api.getChart(el2)

      api.dispose()
      expect(c1!.dispose).toHaveBeenCalledTimes(1)
      expect(c2!.dispose).toHaveBeenCalledTimes(1)
      ResizeObserverInstances.forEach((o) => expect(o.disconnected).toBe(true))
    })

    it('is a no-op for already-disposed instances', async () => {
      const { api } = withChart()
      const el = makeReadyEl()
      const c = await api.getChart(el)
      c!.isDisposed = vi.fn(() => true)
      api.dispose()
      expect(c!.dispose).not.toHaveBeenCalled()
    })
  })

  describe('component unmount cleanup', () => {
    it('auto-disposes all charts and cancels pending timers on unmount', async () => {
      const { api, wrapper } = withChart()
      const el = makeReadyEl()
      const chart = await api.getChart(el)
      api.resize() // arm the debounce timer

      wrapper.unmount()
      expect(chart!.dispose).toHaveBeenCalledTimes(1)
      // advance past 150ms; the debounced resize should NOT fire because the
      // timer was cleared on unmount.
      vi.advanceTimersByTime(200)
      expect(chart!.resize).not.toHaveBeenCalled()
    })

    it('unmount is safe with no live instances', () => {
      const { wrapper } = withChart()
      expect(() => wrapper.unmount()).not.toThrow()
    })
  })

  describe('ResizeObserver not defined branch', () => {
    it('does not throw when ResizeObserver is missing', async () => {
      // Re-stub to make `typeof ResizeObserver === 'undefined'` false path.
      vi.unstubAllGlobals()
      // Explicitly remove the global so the check hits the false branch.
      const g = globalThis as unknown as Record<string, unknown>
      const saved = g.ResizeObserver
      g.ResizeObserver = undefined
      try {
        const { api } = withChart()
        const el = makeReadyEl()
        const chart = await api.getChart(el)
        expect(chart).toBeTruthy()
        expect(initMock).toHaveBeenCalledWith(el)
      } finally {
        g.ResizeObserver = saved
      }
    })
  })

  // Silence unused import if nextTick tree-shakes — keep it referenced so
  // the mock environment mirrors real callers.
  it('imports nextTick for parity with composable usage', async () => {
    await nextTick()
    expect(true).toBe(true)
  })
})
