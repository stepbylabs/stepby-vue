/**
 * Service Worker 更新通道（b117）。
 *
 * 立的案：`registerSW({ immediate: true })` 在 autoUpdate 档会在新 SW 激活时直接
 * `window.location.reload()`（未传 `onNeedReload`）——后台发版等于把正在填表的人整页刷掉。
 * 本文件钉住通道口径：装配必须传 onNeedReload、信号只置状态不刷新、检查可重复且失败不抛、
 * 注册前不发请求、幂等装配。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  __resetSwUpdateForTest,
  applySwUpdate,
  checkSwUpdate,
  installSwUpdate,
  SW_UPDATE_CHECK_INTERVAL_MS,
  swUpdateReady,
  swUpdateSeq
} from './swUpdate'

interface Installed {
  options: {
    immediate?: boolean
    onNeedReload?: () => void
    onRegisteredSW?: (url: string, reg?: ServiceWorkerRegistration) => void
  }
  register: ReturnType<typeof vi.fn>
}

function installFake(): Installed {
  const options: Installed['options'] = {}
  const register = vi.fn((opts?: Installed['options']) => {
    Object.assign(options, opts)
    return async () => {}
  })
  installSwUpdate(register as never)
  return { options, register }
}

function fakeRegistration() {
  const update = vi.fn().mockResolvedValue(undefined)
  return { update, reg: { update } as unknown as ServiceWorkerRegistration }
}

describe('utils/swUpdate', () => {
  beforeEach(() => {
    __resetSwUpdateForTest()
  })

  it('装配：立即注册，且必须把 onNeedReload 交给插件（否则插件自己整页刷新）', () => {
    const { options, register } = installFake()
    expect(register).toHaveBeenCalledTimes(1)
    expect(options.immediate).toBe(true)
    expect(typeof options.onNeedReload).toBe('function')
  })

  it('装配幂等：重复调用只注册一次（不会叠出两个 Workbox 实例）', () => {
    const { register } = installFake()
    installSwUpdate(register as never)
    expect(register).toHaveBeenCalledTimes(1)
  })

  it('新版本就绪只置信号：不走刷新，seq 每次激活都前进（"稍后"只对本次生效）', () => {
    const { options } = installFake()
    expect(swUpdateReady.value).toBe(false)
    expect(swUpdateSeq.value).toBe(0)

    options.onNeedReload?.()
    expect(swUpdateReady.value).toBe(true)
    expect(swUpdateSeq.value).toBe(1)

    options.onNeedReload?.()
    expect(swUpdateSeq.value).toBe(2)
  })

  it('注册完成前 checkSwUpdate 不发请求（返回 false，不抛）', async () => {
    installFake()
    await expect(checkSwUpdate()).resolves.toBe(false)
  })

  it('注册完成后 checkSwUpdate 调 registration.update；失败不得抛错', async () => {
    const { options } = installFake()
    const { update, reg } = fakeRegistration()
    options.onRegisteredSW?.('/sw.js', reg)

    await expect(checkSwUpdate()).resolves.toBe(true)
    expect(update).toHaveBeenCalledTimes(1)

    update.mockRejectedValueOnce(new Error('offline'))
    await expect(checkSwUpdate()).resolves.toBe(false)
  })

  it('applySwUpdate 走整页刷新（新入口与预缓存的唯一拿到方式）', () => {
    // jsdom 的 `location.reload` 是 [LegacyUnforgeable] 成员（实例与原型都不可重定义），
    // 只能替换 `window` 这个 [Replaceable] 绑定来观察调用。
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })
    try {
      applySwUpdate()
      expect(reload).toHaveBeenCalledTimes(1)
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('检查间隔是 30 分钟（长驻 SPA 自己问；浏览器软更新只在导航时发生）', () => {
    expect(SW_UPDATE_CHECK_INTERVAL_MS).toBe(30 * 60 * 1000)
  })
})
