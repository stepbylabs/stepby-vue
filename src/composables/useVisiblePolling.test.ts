/**
 * 轮询纪律的回归锁（b113）。
 *
 * 立的案：三处轮询三种坏法——`useAutoRefresh` 恢复后不立即取数、`monitor/server` 后台
 * 照样 2s 一请求、`report/view` 隐藏期间照跑且"隐藏时改间隔"永远不再启动。
 * 本文件钉统一实现的四条语义（全部是行为判据，不是文本断言）：
 * 1. 按 interval 轮询，且**在途不叠加**（慢请求不堆成并发）；
 * 2. 隐藏即停；可见**立即补一次**再续排；
 * 3. interval = 0 关闭（连恢复也不取数）；
 * 4. 卸载即停（可见性回调与定时器都不再驱动请求）。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { defineComponent, nextTick, ref, type Ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useVisiblePolling } from './useVisiblePolling'

function harness(cb: () => void | Promise<void>, interval: Ref<number>) {
  return defineComponent({
    setup() {
      const poller = useVisiblePolling(cb, () => interval.value)
      return { poller }
    },
    template: '<div />'
  })
}

async function setHidden(hidden: boolean): Promise<void> {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden })
  document.dispatchEvent(new Event('visibilitychange'))
  await nextTick()
}

describe('useVisiblePolling（b113）', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  afterEach(() => {
    vi.useRealTimers()
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
  })

  it('按间隔轮询；隐藏立即停、可见立即补一次再续排', async () => {
    const cb = vi.fn()
    const interval = ref(1000)
    const w = mount(harness(cb, interval))
    ;(w.vm as unknown as { poller: { start: () => void } }).poller.start()

    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(2)

    await setHidden(true)
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb, '隐藏期间不得再发请求').toHaveBeenCalledTimes(2)

    await setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(cb, '回到前台必须立即取一次，而不是再等一个周期').toHaveBeenCalledTimes(3)

    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(4)
    w.unmount()
  })

  it('在途不叠加：慢回调期间即使跨过多个周期也只发一次', async () => {
    let resolveRun: (() => void) | null = null
    const cb = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRun = resolve
        })
    )
    const interval = ref(1000)
    const w = mount(harness(cb, interval))
    ;(w.vm as unknown as { poller: { start: () => void } }).poller.start()

    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb, '第一个请求未结束前不得再发').toHaveBeenCalledTimes(1)

    resolveRun!()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('interval = 0 关闭：不排期，恢复可见也不取数', async () => {
    const cb = vi.fn()
    const interval = ref(0)
    const w = mount(harness(cb, interval))
    ;(w.vm as unknown as { poller: { start: () => void } }).poller.start()

    await vi.advanceTimersByTimeAsync(5000)
    expect(cb).not.toHaveBeenCalled()

    await setHidden(true)
    await setHidden(false)
    await vi.advanceTimersByTimeAsync(0)
    expect(cb, '关闭态不得借"恢复可见"偷偷取数').not.toHaveBeenCalled()
    w.unmount()
  })

  it('stop 后不再轮询；再次 start 恢复', async () => {
    const cb = vi.fn()
    const interval = ref(1000)
    const w = mount(harness(cb, interval))
    const vm = w.vm as unknown as { poller: { start: () => void; stop: () => void } }
    vm.poller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)

    vm.poller.stop()
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb).toHaveBeenCalledTimes(1)

    vm.poller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(2)
    w.unmount()
  })

  it('卸载即停：卸载后可见性变化与时间推进都不再触发回调', async () => {
    const cb = vi.fn()
    const interval = ref(1000)
    const w = mount(harness(cb, interval))
    ;(w.vm as unknown as { poller: { start: () => void } }).poller.start()
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(1)

    w.unmount()
    await setHidden(true)
    await setHidden(false)
    await vi.advanceTimersByTimeAsync(5000)
    expect(cb, '卸载后不得再有任何轮询').toHaveBeenCalledTimes(1)
  })

  it('回调抛错不得中断后续轮询（错误吞在实现里，排期继续）', async () => {
    const cb = vi.fn(() => {
      throw new Error('boom')
    })
    const interval = ref(1000)
    const w = mount(harness(cb, interval))
    ;(w.vm as unknown as { poller: { start: () => void } }).poller.start()

    await vi.advanceTimersByTimeAsync(1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(cb).toHaveBeenCalledTimes(2)
    w.unmount()
  })
})
