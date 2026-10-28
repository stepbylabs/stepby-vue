/**
 * `useAutoRefresh` 薄封装的回归锁（b113）。
 *
 * 立改点：调度收敛到 `useVisiblePolling` 后，旧语义要一条不少（错误吞掉但留痕、
 * 间隔变更重排、0 档关闭、卸载即停），并补上"可见即刷新"。
 *
 * 与旧版的两处刻意差异：
 * - 这里用**真实 `visibilitychange` 事件**驱动，而不是 mock `useVisibilityPause`——
 *   mock 掉兄弟组合子时，"可见回调里到底做了什么"永远测不到（b113 的缺陷恰在这一行）；
 * - "挂载时已隐藏"的期望值改了：旧实现只保证不排期，恢复后还要等满一个间隔；
 *   新实现在恢复时**立即取一次**，所以断言"恢复前 0 次 / 恢复后 1 次"。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, nextTick, reactive } from 'vue'
import { mount } from '@vue/test-utils'

const prefs = reactive({ autoRefreshInterval: 0 })

vi.mock('@/store/modules/settings', () => ({
  default: () => ({ userPrefs: prefs })
}))

import { useAutoRefresh } from './useAutoRefresh'

function harness(cb: () => void | Promise<void>, immediate = false) {
  return defineComponent({
    setup() {
      useAutoRefresh(cb, immediate)
    },
    template: '<div />'
  })
}

async function setHidden(hidden: boolean): Promise<void> {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
  document.dispatchEvent(new Event('visibilitychange'))
  await nextTick()
}

describe('useAutoRefresh（b113）', () => {
  let errSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    prefs.autoRefreshInterval = 0
    errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    errSpy.mockRestore()
    vi.useRealTimers()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('按间隔轮询：每档一次、递归续排', async () => {
    prefs.autoRefreshInterval = 1
    const cb = vi.fn()
    const w = mount(harness(cb))
    expect(cb).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(3)
    w.unmount()
  })

  it('间隔 0 = 关闭：不排期、不取数', async () => {
    prefs.autoRefreshInterval = 0
    const cb = vi.fn()
    const w = mount(harness(cb))
    await vi.advanceTimersByTimeAsync(100000)
    expect(cb).not.toHaveBeenCalled()
    w.unmount()
  })

  it('挂载时已隐藏：不排期不取数，恢复可见立即取一次再续排', async () => {
    await setHidden(true)
    prefs.autoRefreshInterval = 1
    const cb = vi.fn()
    const w = mount(harness(cb))
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb, '隐藏期间不得取数').not.toHaveBeenCalled()

    await setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(cb, '恢复可见必须立即补一次').toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('immediate：进页面先取一次（即使间隔为 0）', async () => {
    prefs.autoRefreshInterval = 0
    const cb = vi.fn()
    const w = mount(harness(cb, true))
    await vi.advanceTimersByTimeAsync(0)
    expect(cb).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb, '间隔 0 不得继续轮询').toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('immediate 回调同步抛错：吞掉但留痕，不逸出到挂载', async () => {
    prefs.autoRefreshInterval = 0
    const cb = vi.fn(() => {
      throw new Error('sync boom')
    })
    expect(() => mount(harness(cb, true))).not.toThrow()
    await vi.advanceTimersByTimeAsync(0)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(errSpy).toHaveBeenCalled()
  })

  it('immediate 回调异步拒绝：吞掉但留痕', async () => {
    prefs.autoRefreshInterval = 0
    const cb = vi.fn(async () => {
      throw new Error('async boom')
    })
    const w = mount(harness(cb, true))
    await vi.advanceTimersByTimeAsync(0)
    expect(cb).toHaveBeenCalledTimes(1)
    expect(errSpy).toHaveBeenCalled()
    w.unmount()
  })

  it('轮询回调抛错：留痕且继续续排', async () => {
    prefs.autoRefreshInterval = 1
    let calls = 0
    const cb = vi.fn(async () => {
      calls++
      if (calls === 1) throw new Error('tick boom')
    })
    const w = mount(harness(cb))
    await vi.advanceTimersByTimeAsync(1000)
    expect(errSpy).toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('间隔变化：旧定时器被清掉，按新间隔重排', async () => {
    prefs.autoRefreshInterval = 1
    const cb = vi.fn()
    const w = mount(harness(cb))
    prefs.autoRefreshInterval = 2
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb, '旧的 1s 排期必须已清掉').not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('间隔从 0 改到 > 0 会真的启动轮询', async () => {
    prefs.autoRefreshInterval = 0
    const cb = vi.fn()
    const w = mount(harness(cb))
    await vi.advanceTimersByTimeAsync(3000)
    expect(cb).not.toHaveBeenCalled()

    prefs.autoRefreshInterval = 1
    await nextTick()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)
    w.unmount()
  })

  it('间隔改回 0：停表', async () => {
    prefs.autoRefreshInterval = 1
    const cb = vi.fn()
    const w = mount(harness(cb))
    prefs.autoRefreshInterval = 0
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb).not.toHaveBeenCalled()
    w.unmount()
  })

  it('隐藏即停、可见立即补一次再续排', async () => {
    prefs.autoRefreshInterval = 1
    const cb = vi.fn()
    const w = mount(harness(cb))
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)

    await setHidden(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb, '隐藏期间不得轮询').toHaveBeenCalledTimes(1)

    await setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(cb, '恢复可见必须立即刷新一次').toHaveBeenCalledTimes(2)
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(3)
    w.unmount()
  })

  it('卸载即停', async () => {
    prefs.autoRefreshInterval = 1
    const cb = vi.fn()
    const w = mount(harness(cb))
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)
    w.unmount()
    await vi.advanceTimersByTimeAsync(5000)
    await setHidden(true)
    await setHidden(false)
    expect(cb).toHaveBeenCalledTimes(1)
  })
})
