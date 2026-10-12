import { describe, it, expect, vi, beforeEach } from 'vitest'

// Mock @/router：只关心 push/replace 收到的导航目标与调用顺序
const { push, replace } = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn()
}))
vi.mock('@/router', () => ({ default: { push, replace } }))

// Mock @/store/modules/user：logoutAndGoLogin 依赖 logOut()
const { logOut } = vi.hoisted(() => ({
  logOut: vi.fn()
}))
vi.mock('@/store/modules/user', () => ({
  default: () => ({ logOut })
}))

import { navigate, goLogin, logoutAndGoLogin } from './navigation'

describe('utils/navigation SPA 内跳转', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('navigate → router.push({ path, query })', () => {
    navigate('/system/user')
    expect(push).toHaveBeenCalledWith({ path: '/system/user', query: undefined })
  })

  it('navigate 带 query → query 原样透传', () => {
    navigate('/system/user', { deptId: '1', status: '0' })
    expect(push).toHaveBeenCalledWith({ path: '/system/user', query: { deptId: '1', status: '0' } })
  })

  it('goLogin → router.replace 到 /login（非整页刷新）', () => {
    goLogin()
    expect(replace).toHaveBeenCalledWith({ path: '/login', query: undefined })
    expect(push).not.toHaveBeenCalled()
  })

  it('goLogin 带 query（如 redirect）→ 原样透传', () => {
    goLogin({ redirect: '/system/user' })
    expect(replace).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/system/user' } })
  })

  it('logoutAndGoLogin → 先 await logOut 再 replace 到 /login', async () => {
    const order: string[] = []
    logOut.mockImplementation(async () => {
      order.push('logOut')
    })
    replace.mockImplementation(() => {
      order.push('replace')
    })

    await logoutAndGoLogin({ redirect: '/index' })

    expect(logOut).toHaveBeenCalledTimes(1)
    expect(order).toEqual(['logOut', 'replace'])
    expect(replace).toHaveBeenCalledWith({ path: '/login', query: { redirect: '/index' } })
  })
})
