/**
 * utils/auth 单元测试（b71 T4 补测：token Cookie 安全属性逻辑）
 *
 * 覆盖：token 存取删往返 / COOKIE_OPTIONS 注入断言（sameSite=lax 恒定、
 * secure 随 HTTPS 协议切换）。secure 判定在模块加载时求值，HTTPS 场景
 * 用 resetModules + 重定义 window.location 后动态 import 验证。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

describe('utils/auth token cookie', () => {
  let setSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    vi.resetModules()
    document.cookie = 'Admin-Token=;expires=Thu, 01 Jan 1970 00:00:00 GMT'
  })

  afterEach(() => {
    setSpy?.mockRestore()
    document.cookie = 'Admin-Token=;expires=Thu, 01 Jan 1970 00:00:00 GMT'
    vi.unstubAllGlobals()
  })

  it('http 环境（jsdom 默认）：set/get/remove 往返 + secure=false、sameSite=lax', async () => {
    const auth = await import('./auth')
    const Cookies = (await import('js-cookie')).default
    setSpy = vi.spyOn(Cookies, 'set')

    auth.setToken('tok-123')
    expect(setSpy).toHaveBeenCalledWith('Admin-Token', 'tok-123', {
      secure: false, // jsdom 默认 http://localhost → secure 必须关闭（否则浏览器拒设 cookie）
      sameSite: 'lax'
    })
    expect(auth.getToken()).toBe('tok-123')

    auth.removeToken()
    expect(auth.getToken()).toBeUndefined()
  })

  it('https 环境：secure=true（模块加载期协议快照）', async () => {
    // auth.ts 在模块加载时读取 window.location.protocol——先改协议再动态 import
    const original = window.location
    Object.defineProperty(window, 'location', {
      value: { ...original, protocol: 'https:' },
      writable: true,
      configurable: true
    })
    try {
      const auth = await import('./auth')
      const Cookies = (await import('js-cookie')).default
      setSpy = vi.spyOn(Cookies, 'set')

      auth.setToken('tok-secure')
      expect(setSpy).toHaveBeenCalledWith('Admin-Token', 'tok-secure', {
        secure: true,
        sameSite: 'lax'
      })
      expect(auth.getToken()).toBe('tok-secure')
    } finally {
      Object.defineProperty(window, 'location', {
        value: original,
        writable: true,
        configurable: true
      })
    }
  })

  it('setToken 返回值携带写入的 cookie 对', async () => {
    const auth = await import('./auth')
    const ret = auth.setToken('abc')
    // js-cookie set 返回完整 cookie 串而非裸值
    expect(ret).toContain('Admin-Token=abc')
    expect(auth.getToken()).toBe('abc')
  })
})
