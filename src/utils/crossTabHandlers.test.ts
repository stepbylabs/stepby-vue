/**
 * 跨标签页事件的消费侧（b122）。
 *
 * 三类事件的处置各自有"不能做错"的一侧：会话结束必须**本地**收尾（再发远程
 * logout 只会 401）、换身份必须整页重载（SPA 内重登残留旧权限树）、
 * 未登录页收到会话事件不得把人踢来踢去。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  getToken: vi.fn(),
  router: { currentRoute: { value: { path: '/index', fullPath: '/index' } } },
  user: { clearLocalSession: vi.fn(), id: '' as string | number, token: '' as string | undefined },
  goLogin: vi.fn(),
  warning: vi.fn(),
  applyExternalLanguage: vi.fn(async () => true)
}))

vi.mock('@/utils/auth', () => ({ getToken: h.getToken }))
vi.mock('@/router', () => ({ default: h.router }))
vi.mock('@/store/modules/user', () => ({ default: () => h.user }))
vi.mock('@/utils/navigation', () => ({ goLogin: h.goLogin }))
vi.mock('@/i18n', () => ({
  default: { global: { t: (k: string) => k } },
  applyExternalLanguage: h.applyExternalLanguage
}))
vi.mock('element-plus', () => ({ ElMessage: { warning: h.warning } }))

import { handleCrossTabEvent } from './crossTabHandlers'

describe('utils/crossTabHandlers', () => {
  beforeEach(() => {
    h.getToken.mockReturnValue('tok')
    h.router.currentRoute.value = { path: '/index', fullPath: '/index?tab=1' }
    h.user.clearLocalSession.mockClear()
    h.user.id = 'u-1'
    h.user.token = 'mem-token'
    h.goLogin.mockClear()
    h.warning.mockClear()
    h.applyExternalLanguage.mockClear().mockResolvedValue(true)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('session-ended：清本地会话 + 提示 + 回登录页（带当前地址回跳）', () => {
    handleCrossTabEvent({ type: 'session-ended', at: 1, reason: 'logout' })
    expect(h.user.clearLocalSession).toHaveBeenCalledTimes(1)
    expect(h.warning).toHaveBeenCalledWith('common.crossTabLogout')
    expect(h.goLogin).toHaveBeenCalledWith({ redirect: '/index?tab=1', reason: 'cross-tab-logout' })
  })

  it('session-ended：本来就没有会话时什么都不做（未登录页不被另一标签页踢走）', () => {
    h.user.token = ''
    handleCrossTabEvent({ type: 'session-ended', at: 1, reason: 'logout' })
    expect(h.user.clearLocalSession).not.toHaveBeenCalled()
    expect(h.goLogin).not.toHaveBeenCalled()
  })

  it('session-ended：Cookie 已被对方删除、但本页内存仍是登录态 ⇒ 必须照常收场（b122 首轮实测缺陷）', () => {
    // 共享 Cookie 在广播前就被写方删掉了：此时 getToken() 为 undefined，
    // 但本页界面仍显示已登录。若按 Cookie 判"有无会话"，这条事件会被静默吞掉。
    h.getToken.mockReturnValue(undefined)
    h.user.token = 'mem-token'
    handleCrossTabEvent({ type: 'session-ended', at: 1, reason: 'logout' })
    expect(h.user.clearLocalSession).toHaveBeenCalledTimes(1)
    expect(h.goLogin).toHaveBeenCalledWith({ redirect: '/index?tab=1', reason: 'cross-tab-logout' })
  })

  it('session-ended：已站在免登录页时不重复导航', () => {
    h.router.currentRoute.value = { path: '/login', fullPath: '/login' }
    handleCrossTabEvent({ type: 'session-ended', at: 1, reason: 'logout' })
    expect(h.user.clearLocalSession).not.toHaveBeenCalled()
    expect(h.goLogin).not.toHaveBeenCalled()
  })

  it('language-changed：即使未登录也要应用（登录页同样跟随语言）', () => {
    h.getToken.mockReturnValue(undefined)
    handleCrossTabEvent({ type: 'language-changed', at: 1, locale: 'en-US' })
    expect(h.applyExternalLanguage).toHaveBeenCalledWith('en-US')
    expect(h.user.clearLocalSession).not.toHaveBeenCalled()
  })

  it('identity-changed：同 id 不重载；不同 id 整页重载；本页还没取到身份时不重载', () => {
    const reload = vi.fn()
    vi.stubGlobal('window', { location: { reload } })

    handleCrossTabEvent({ type: 'identity-changed', at: 1, userId: 'u-1' })
    expect(reload).not.toHaveBeenCalled()

    handleCrossTabEvent({ type: 'identity-changed', at: 2, userId: 'u-2' })
    expect(reload).toHaveBeenCalledTimes(1)

    h.user.id = ''
    handleCrossTabEvent({ type: 'identity-changed', at: 3, userId: 'u-3' })
    expect(reload).toHaveBeenCalledTimes(1)
  })
})
