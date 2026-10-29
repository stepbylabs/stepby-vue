/**
 * 401「重新登录」对话框的登出注入契约（b124）
 *
 * request 不再 import user store（原循环 `user -> api/login -> request -> user`）。
 * 这条测试锁的是**替换实现后的真实行为**，而不是"注册函数存在"：
 * ① 用户确认 ⇒ 执行已注册的登出动作，然后去登录页；
 * ② 登出动作失败 ⇒ 仍去登录页（会话无论如何都要收场）；
 * ③ 未注册 ⇒ 直接去登录页，不得崩、不得静默留在原页。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AxiosError, type AxiosResponse } from 'axios'

const h = vi.hoisted(() => ({
  confirm: vi.fn(),
  goLogin: vi.fn(),
  msg: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn(), warning: vi.fn() })
}))

vi.mock('element-plus', () => ({
  ElMessageBox: { confirm: h.confirm },
  ElMessage: h.msg,
  ElLoading: { service: () => ({ close: () => {} }) }
}))
vi.mock('@/utils/navigation', () => ({ goLogin: h.goLogin }))

import service, { isRelogin } from '@/utils/request'
import { registerReloginHandler } from '@/utils/reloginHandler'
import { errorHub } from '@/utils/errorHub'

/** 让一次请求以 HTTP 401 结束（走错误拦截器的"其他页面重新登录"分支） */
async function request401(): Promise<void> {
  const prev = service.defaults.adapter
  service.defaults.adapter = async (config) => {
    const response = {
      status: 401,
      statusText: 'Unauthorized',
      headers: {},
      config,
      request: {},
      data: { code: 401, msg: '会话已过期' }
    } as unknown as AxiosResponse
    throw new AxiosError('Request failed with status code 401', AxiosError.ERR_BAD_REQUEST, config, {}, response)
  }
  try {
    await service.get('/__relogin_probe__')
  } catch {
    /* 期望被拒 */
  } finally {
    service.defaults.adapter = prev
  }
}

beforeEach(() => {
  h.confirm.mockReset()
  h.goLogin.mockReset()
  isRelogin.show = false
  errorHub.clear()
  errorHub.setToastHandler(() => {})
})
afterEach(() => {
  registerReloginHandler(null)
  errorHub.clear()
  errorHub.setToastHandler(null)
})

describe('401 重新登录对话框：登出动作由 user store 注入', () => {
  it('用户确认 ⇒ 先执行注册的登出，再去登录页', async () => {
    const order: string[] = []
    h.confirm.mockResolvedValue('confirm')
    registerReloginHandler(async () => {
      order.push('logout')
    })
    h.goLogin.mockImplementation(() => order.push('goLogin'))

    await request401()
    await vi.waitFor(() => expect(h.goLogin).toHaveBeenCalledTimes(1))
    expect(order).toEqual(['logout', 'goLogin'])
  })

  it('登出动作失败 ⇒ 仍去登录页（会话必须收场）', async () => {
    h.confirm.mockResolvedValue('confirm')
    registerReloginHandler(async () => {
      throw new Error('logout failed')
    })

    await request401()
    await vi.waitFor(() => expect(h.goLogin).toHaveBeenCalledTimes(1))
  })

  it('未注册（store 尚未加载）⇒ 直接去登录页，不崩不静默', async () => {
    h.confirm.mockResolvedValue('confirm')
    registerReloginHandler(null)

    await request401()
    await vi.waitFor(() => expect(h.goLogin).toHaveBeenCalledTimes(1))
  })

  it('用户取消 ⇒ 既不登出也不跳转（保持当前页）', async () => {
    const logout = vi.fn(async () => {})
    h.confirm.mockRejectedValue('cancel')
    registerReloginHandler(logout)

    await request401()
    // 取消分支是异步收尾的，给它一个明确的可观测窗口再断言"没有发生"
    await new Promise((r) => setTimeout(r, 20))
    expect(logout).not.toHaveBeenCalled()
    expect(h.goLogin).not.toHaveBeenCalled()
  })
})
