/**
 * SwUpdateNotice 组件（b117）。
 *
 * 覆盖真实行为：新版本未就绪时不渲染任何东西 / 就绪后给出可见提示（文案 + 两个动作）/
 * 「稍后」只压住本次激活（下一次发版必须重新提示）/ 「立即刷新」才整页刷新 /
 * 周期检查经 useVisiblePolling 排期（30 分钟后真的调用 registration.update）。
 *
 * i18n 只做键名回显（t = identity）；SW 通道用真实模块 + 假 register 驱动。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }))

// 真实通道 + 只把"刷新动作"换成可观察的桩：jsdom 的 location.reload 不可重定义，
// 而整页刷新本身由 utils/swUpdate.test.ts 直接断言（那里只替换 window 绑定、不挂组件）。
const hoisted = vi.hoisted(() => ({ applySwUpdate: vi.fn() }))
vi.mock('@/utils/swUpdate', async (orig) => {
  const actual = await orig<typeof import('@/utils/swUpdate')>()
  return { ...actual, applySwUpdate: hoisted.applySwUpdate }
})

import SwUpdateNotice from './index.vue'
import { __resetSwUpdateForTest, installSwUpdate, SW_UPDATE_CHECK_INTERVAL_MS } from '@/utils/swUpdate'

const stubs = {
  'el-button': { template: '<button><slot /></button>' },
  transition: false
}

let wrappers: VueWrapper[] = []

function mountNotice(): VueWrapper {
  const w = mount(SwUpdateNotice, { global: { stubs } })
  wrappers.push(w)
  return w
}

interface FakeOptions {
  onNeedReload?: () => void
  onRegisteredSW?: (url: string, reg?: ServiceWorkerRegistration) => void
}

function installFake() {
  const options: FakeOptions = {}
  const update = vi.fn().mockResolvedValue(undefined)
  const register = vi.fn((opts?: FakeOptions) => {
    Object.assign(options, opts)
    return async () => {}
  })
  installSwUpdate(register as never)
  options.onRegisteredSW?.('/sw.js', { update } as unknown as ServiceWorkerRegistration)
  return { options, update }
}

async function markReady(options: FakeOptions): Promise<void> {
  options.onNeedReload?.()
  await nextTick()
}

describe('components/SwUpdateNotice', () => {
  beforeEach(() => {
    __resetSwUpdateForTest()
    hoisted.applySwUpdate.mockReset()
  })

  afterEach(() => {
    for (const w of wrappers) w.unmount()
    wrappers = []
    vi.useRealTimers()
  })

  it('新版本未就绪时不渲染任何东西（不能常驻占屏）', () => {
    const w = mountNotice()
    expect(w.find('.sw-update-title').exists()).toBe(false)
  })

  it('就绪后给出可见提示：标题 / 说明 / 「稍后」「立即刷新」两个动作', async () => {
    const { options } = installFake()
    const w = mountNotice()
    await markReady(options)

    expect(w.find('.sw-update-title').text()).toBe('swUpdate.title')
    expect(w.text()).toContain('swUpdate.desc')
    const buttons = w.findAll('button')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].text()).toBe('swUpdate.later')
    expect(buttons[1].text()).toBe('swUpdate.reload')
  })

  it('「稍后」只压住本次激活；下一次发版必须重新提示（否则一次点击就永久失去入口）', async () => {
    const { options } = installFake()
    const w = mountNotice()
    await markReady(options)

    await w.findAll('button')[0].trigger('click')
    expect(w.find('.sw-update-title').exists()).toBe(false)

    await markReady(options)
    expect(w.find('.sw-update-title').exists()).toBe(true)
  })

  it('「立即刷新」才整页刷新（组件自身不改任何状态去"假装生效"）', async () => {
    const { options } = installFake()
    const w = mountNotice()
    await markReady(options)

    expect(hoisted.applySwUpdate).not.toHaveBeenCalled()
    await w.findAll('button')[1].trigger('click')
    expect(hoisted.applySwUpdate).toHaveBeenCalledTimes(1)
  })

  it('周期检查：隐藏即停（隐藏时不查）、可见立即补一次（不等满一个周期）', async () => {
    vi.useFakeTimers()
    const { update } = installFake()
    const w = mountNotice()
    await nextTick()

    // 可见：排期照常，满一个周期后检查一次
    await vi.advanceTimersByTimeAsync(SW_UPDATE_CHECK_INTERVAL_MS)
    expect(update).toHaveBeenCalledTimes(1)

    // 隐藏：清表；再走满一个周期不得发请求
    Object.defineProperty(document, 'hidden', { configurable: true, value: true })
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    await vi.advanceTimersByTimeAsync(SW_UPDATE_CHECK_INTERVAL_MS * 2)
    expect(update).toHaveBeenCalledTimes(1)

    // 可见：立即补一次
    Object.defineProperty(document, 'hidden', { configurable: true, value: false })
    document.dispatchEvent(new Event('visibilitychange'))
    await nextTick()
    await vi.advanceTimersByTimeAsync(0)
    expect(update).toHaveBeenCalledTimes(2)

    w.unmount()
    wrappers = wrappers.filter((x) => x !== w)
  })
})
