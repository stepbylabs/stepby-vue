/**
 * 网络状态单例（b122）。
 *
 * 关键语义：冷启动即离线时不能等 `offline` 事件（它早就发生过了）；
 * 恢复提示必须自己收起（否则"已恢复"会一直挂在顶部）；卸载监听后状态不再变化。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  NETWORK_RECOVERED_VISIBLE_MS,
  __resetNetworkStatusForTest,
  installNetworkStatus,
  useNetworkStatus
} from './useNetworkStatus'

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

describe('composables/useNetworkStatus', () => {
  beforeEach(() => {
    __resetNetworkStatusForTest()
    setNavigatorOnline(true)
  })

  afterEach(() => {
    __resetNetworkStatusForTest()
    setNavigatorOnline(true)
    vi.useRealTimers()
  })

  it('初始在线：不显示任何恢复提示', () => {
    const { online, recovered } = useNetworkStatus()
    expect(online.value).toBe(true)
    expect(recovered.value).toBe(false)
  })

  it('冷启动即离线：初始值直接来自 navigator.onLine（不等 offline 事件）', () => {
    setNavigatorOnline(false)
    const { online, recovered } = useNetworkStatus()
    expect(online.value).toBe(false)
    expect(recovered.value).toBe(false)
  })

  it('离线 → 恢复：恢复提示出现并在窗口后自动收起', () => {
    vi.useFakeTimers()
    const { online, recovered } = useNetworkStatus()
    window.dispatchEvent(new Event('offline'))
    expect(online.value).toBe(false)
    expect(recovered.value).toBe(false)

    window.dispatchEvent(new Event('online'))
    expect(online.value).toBe(true)
    expect(recovered.value).toBe(true)
    vi.advanceTimersByTime(NETWORK_RECOVERED_VISIBLE_MS - 1)
    expect(recovered.value).toBe(true)
    vi.advanceTimersByTime(1)
    expect(recovered.value).toBe(false)
  })

  it('恢复提示未收起时再次断网：立刻收起恢复提示（不得让用户读反）', () => {
    vi.useFakeTimers()
    const { online, recovered } = useNetworkStatus()
    window.dispatchEvent(new Event('offline'))
    window.dispatchEvent(new Event('online'))
    expect(recovered.value).toBe(true)
    window.dispatchEvent(new Event('offline'))
    expect(online.value).toBe(false)
    expect(recovered.value).toBe(false)
    vi.advanceTimersByTime(NETWORK_RECOVERED_VISIBLE_MS)
    expect(recovered.value).toBe(false)
  })

  it('重复安装不会叠加监听；复位后监听真的移除', () => {
    installNetworkStatus()
    installNetworkStatus()
    const { online } = useNetworkStatus()
    window.dispatchEvent(new Event('offline'))
    expect(online.value).toBe(false)
    __resetNetworkStatusForTest()
    window.dispatchEvent(new Event('offline'))
    expect(online.value).toBe(true)
  })
})
