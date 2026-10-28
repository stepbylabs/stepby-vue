/**
 * 全屏按钮回归锁（b112）
 *
 * 立的案：`useFullscreen().toggle()` 的拒绝无人接管 ⇒ 点按钮"毫无反应"且留 unhandledrejection。
 * 本文件钉住按钮侧的三件事：
 * 1. 切换失败 ⇒ 必须弹警告（`common.fullscreenFail`），且图标仍显示"进入全屏"；
 * 2. 切换成功 ⇒ 图标与可访问名变成"退出全屏"；
 * 3. **其他入口**（快捷键/命令面板/报表页）切换全屏时，`fullscreenchange` 必须让本图标跟住。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'

const hoisted = vi.hoisted(() => ({
  fullscreen: false,
  toggleResult: true,
  msgWarning: vi.fn(),
  toggleCalls: 0
}))

vi.mock('@/utils/fullscreen', () => ({
  isFullscreen: () => hoisted.fullscreen,
  toggleFullscreen: () => {
    hoisted.toggleCalls += 1
    return Promise.resolve(hoisted.toggleResult)
  }
}))

vi.mock('@/plugins/modal', () => ({
  default: { msgWarning: (...a: unknown[]) => hoisted.msgWarning(...a) }
}))

vi.mock('vue-i18n', async (orig) => {
  const actual = await orig<typeof import('vue-i18n')>()
  return { ...actual, useI18n: () => ({ t: (k: string) => k }) }
})

import Screenfull from './index.vue'

const stubs = { 'svg-icon': { props: ['iconClass'], template: '<i :data-icon="iconClass" />' } }

function mountButton() {
  return mount(Screenfull, { global: { stubs } })
}

beforeEach(() => {
  hoisted.fullscreen = false
  hoisted.toggleResult = true
  hoisted.toggleCalls = 0
  hoisted.msgWarning.mockClear()
})

describe('全屏按钮', () => {
  it('切换失败 ⇒ 弹警告且可访问名保持"进入全屏"', async () => {
    hoisted.toggleResult = false
    const wrapper = mountButton()
    expect(wrapper.attributes('aria-label')).toBe('layout.navbar.enterFullscreen')
    await wrapper.trigger('click')
    await flushPromises()
    expect(hoisted.toggleCalls).toBe(1)
    expect(hoisted.msgWarning).toHaveBeenCalledWith('common.fullscreenFail')
    expect(wrapper.attributes('aria-label')).toBe('layout.navbar.enterFullscreen')
    wrapper.unmount()
  })

  it('切换成功 ⇒ 图标与可访问名变成"退出全屏"', async () => {
    hoisted.toggleResult = true
    const wrapper = mountButton()
    // 通道成功后浏览器会更新 fullscreenElement，再派发 fullscreenchange
    hoisted.fullscreen = true
    await wrapper.trigger('click')
    await flushPromises()
    document.dispatchEvent(new Event('fullscreenchange'))
    await flushPromises()
    expect(wrapper.attributes('aria-label')).toBe('layout.navbar.exitFullscreen')
    expect(wrapper.find('i').attributes('data-icon')).toBe('exit-fullscreen')
    wrapper.unmount()
  })

  it('外部入口切换全屏（快捷键/命令面板）⇒ 图标必须跟住 fullscreenchange', async () => {
    const wrapper = mountButton()
    hoisted.fullscreen = true
    document.dispatchEvent(new Event('fullscreenchange'))
    await flushPromises()
    expect(wrapper.attributes('aria-label')).toBe('layout.navbar.exitFullscreen')
    hoisted.fullscreen = false
    document.dispatchEvent(new Event('fullscreenchange'))
    await flushPromises()
    expect(wrapper.attributes('aria-label')).toBe('layout.navbar.enterFullscreen')
    wrapper.unmount()
  })

  it('装载与卸载必须成对绑定同一个 fullscreenchange 处理函数（布局重建不累积回调）', () => {
    const add = vi.spyOn(document, 'addEventListener')
    const remove = vi.spyOn(document, 'removeEventListener')
    try {
      const wrapper = mountButton()
      const added = add.mock.calls.find((c) => c[0] === 'fullscreenchange')?.[1]
      wrapper.unmount()
      const removed = remove.mock.calls.find((c) => c[0] === 'fullscreenchange')?.[1]
      expect(typeof added).toBe('function')
      expect(removed).toBe(added)
    } finally {
      add.mockRestore()
      remove.mockRestore()
    }
  })
})
