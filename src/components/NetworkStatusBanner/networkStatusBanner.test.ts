/**
 * 网络状态横幅（b122）。
 *
 * 判据落在"用户看得见什么"：在线时 DOM 里没有横幅；离线时文案 + role=status +
 * aria-live 都在；恢复后先给一次确认、再自动消失。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

import NetworkStatusBanner from './index.vue'
import { NETWORK_RECOVERED_VISIBLE_MS, __resetNetworkStatusForTest } from '@/composables/useNetworkStatus'

const wrappers: VueWrapper[] = []

function mountBanner(): VueWrapper {
  const w = mount(NetworkStatusBanner)
  wrappers.push(w)
  return w
}

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value })
}

describe('components/NetworkStatusBanner', () => {
  beforeEach(() => {
    __resetNetworkStatusForTest()
    setNavigatorOnline(true)
  })

  afterEach(() => {
    for (const w of wrappers) w.unmount()
    wrappers.length = 0
    __resetNetworkStatusForTest()
    setNavigatorOnline(true)
    vi.useRealTimers()
  })

  it('在线时什么都不渲染（不占位、不进 a11y 树）', () => {
    const w = mountBanner()
    expect(w.find('[data-testid="network-status-banner"]').exists()).toBe(false)
  })

  it('离线：文案 + role=status + aria-live=polite + 不拦截点击', async () => {
    const w = mountBanner()
    window.dispatchEvent(new Event('offline'))
    await nextTick()
    const banner = w.find('[data-testid="network-status-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('networkBanner.offline')
    expect(banner.attributes('role')).toBe('status')
    expect(banner.attributes('aria-live')).toBe('polite')
    expect(banner.classes()).toContain('pointer-events-none')
  })

  it('恢复：先显示确认文案，窗口结束后自动移除', async () => {
    vi.useFakeTimers()
    const w = mountBanner()
    window.dispatchEvent(new Event('offline'))
    await nextTick()
    window.dispatchEvent(new Event('online'))
    await nextTick()
    const banner = w.find('[data-testid="network-status-banner"]')
    expect(banner.exists()).toBe(true)
    expect(banner.text()).toContain('networkBanner.recovered')
    vi.advanceTimersByTime(NETWORK_RECOVERED_VISIBLE_MS)
    await nextTick()
    expect(w.find('[data-testid="network-status-banner"]').exists()).toBe(false)
  })
})
