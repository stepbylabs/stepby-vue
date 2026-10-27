/**
 * utils/sessionExpiry（b101）：WS 会话到期的统一结局。
 *
 * 覆盖：提示文案 / 清会话 / 回登录页（带回跳）/ 幂等（并发期间只执行一次）/
 * logOut 失败仍跳转 / 复位后可再次执行。业务模块全部 mock，断言针对真实函数体。
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 从本文件位置反推仓根：vitest 的 cwd 只有一种，但静态引用扫描按仓根解析字面量路径，
// 写成 readFileSync('src/...') 会被 recovery_gap 的代码级悬挂判据当成"文件不在"。
const VUE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const hoisted = vi.hoisted(() => ({
  warning: vi.fn(),
  logOut: vi.fn(),
  goLogin: vi.fn(),
  fullPath: '/system/user',
  isRelogin: { show: false }
}))

vi.mock('element-plus', () => ({ ElMessage: { warning: hoisted.warning } }))
vi.mock('@/i18n', () => ({
  default: { global: { t: (k: string) => `T:${k}` } }
}))
vi.mock('@/router', () => ({
  default: { currentRoute: { value: { fullPath: hoisted.fullPath } } }
}))
vi.mock('@/utils/navigation', () => ({ goLogin: hoisted.goLogin }))
vi.mock('@/utils/request', () => ({ isRelogin: hoisted.isRelogin }))
vi.mock('@/store/modules/user', () => ({
  default: () => ({ logOut: hoisted.logOut })
}))

describe('utils/sessionExpiry（WS 会话到期结局）', () => {
  beforeEach(() => {
    vi.resetModules()
    hoisted.warning.mockReset()
    hoisted.logOut.mockReset()
    hoisted.goLogin.mockReset()
    hoisted.fullPath = '/system/user'
    hoisted.isRelogin.show = false
  })

  it('提示 + 清会话 + 回登录页（带回跳与原因）', async () => {
    hoisted.logOut.mockResolvedValue(undefined)
    const { handleSessionExpired } = await import('@/utils/sessionExpiry')
    await handleSessionExpired()
    expect(hoisted.warning).toHaveBeenCalledWith('T:common.sessionExpired')
    expect(hoisted.logOut).toHaveBeenCalledTimes(1)
    expect(hoisted.goLogin).toHaveBeenCalledWith({ redirect: '/system/user', reason: 'session-expired' })
    // 登出请求若撞 401，拦截器不得再弹一次"重新登录？"对话框
    expect(hoisted.isRelogin.show).toBe(true)
  })

  it('并发/重复推送只执行一次（幂等闸）', async () => {
    let release: (() => void) | undefined
    hoisted.logOut.mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          release = resolve
        })
    )
    const { handleSessionExpired } = await import('@/utils/sessionExpiry')
    const first = handleSessionExpired()
    await handleSessionExpired()
    await handleSessionExpired()
    expect(hoisted.logOut).toHaveBeenCalledTimes(1)
    expect(hoisted.goLogin).not.toHaveBeenCalled()
    release?.()
    await first
    expect(hoisted.goLogin).toHaveBeenCalledTimes(1)
    expect(hoisted.warning).toHaveBeenCalledTimes(1)
  })

  it('logOut 抛错时不得逸出，仍要回登录页', async () => {
    hoisted.logOut.mockRejectedValue(new Error('network down'))
    const { handleSessionExpired } = await import('@/utils/sessionExpiry')
    await expect(handleSessionExpired()).resolves.toBeUndefined()
    expect(hoisted.goLogin).toHaveBeenCalledTimes(1)
  })

  it('复位后允许下一次会话到期再次执行（闸不是永久锁死）', async () => {
    hoisted.logOut.mockResolvedValue(undefined)
    const { handleSessionExpired, resetSessionExpiry } = await import('@/utils/sessionExpiry')
    await handleSessionExpired()
    await handleSessionExpired()
    expect(hoisted.goLogin).toHaveBeenCalledTimes(1)
    resetSessionExpiry()
    await handleSessionExpired()
    expect(hoisted.goLogin).toHaveBeenCalledTimes(2)
    expect(hoisted.warning).toHaveBeenCalledTimes(2)
  })

  it('复位点必须真的接线：登录后的路由守卫与布局层（写了没接线=没写）', () => {
    const layout = readFileSync(resolve(VUE_ROOT, 'src/layout/index.vue'), 'utf8')
    expect(layout).toContain("from '@/utils/sessionExpiry'")
    expect(layout).toContain("wsService.on('sessionExpired', handleSessionExpired)")
    expect(layout).toContain("wsService.off('sessionExpired', handleSessionExpired)")
    // 登录是 SPA 跳转：复位点若缺失，第二次到期会被闸静默吞掉（本批修复的缺陷形状）
    const permission = readFileSync(resolve(VUE_ROOT, 'src/permission.ts'), 'utf8')
    expect(permission).toContain("import { resetSessionExpiry } from '@/utils/sessionExpiry'")
    expect(permission).toContain('resetSessionExpiry()')
    // 复位必须与 isRelogin 复位同一处（同一"新会话已建立"事实），不得散落第二处
    expect(permission).toMatch(/isRelogin\.show = false[\s\S]{0,400}resetSessionExpiry\(\)/)
    expect(permission.match(/resetSessionExpiry\(\)/g)).toHaveLength(1)
  })
})
