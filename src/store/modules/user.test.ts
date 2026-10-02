import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'

// ---- Mock collaborators so only the user store's own logic runs ----
const { api, auth, cacheSessionSet, setPwdChrType, clearAllApiCache, elConfirm, routerPush, i18nT, collaborators } =
  vi.hoisted(() => {
    const lockStore = { unlockScreen: vi.fn() }
    const notifStore = { init: vi.fn(), disconnect: vi.fn(), clearAll: vi.fn() }
    const permissionStore = { resetRoutes: vi.fn() }
    const dictStore = { cleanDict: vi.fn() }
    const tagsViewStore = { delAllViews: vi.fn() }
    const noticeStore = { clearAll: vi.fn() }
    return {
      api: {
        login: vi.fn(),
        logout: vi.fn(),
        getInfo: vi.fn()
      },
      auth: { getToken: vi.fn(), setToken: vi.fn(), removeToken: vi.fn() },
      cacheSessionSet: vi.fn(),
      setPwdChrType: vi.fn(),
      clearAllApiCache: vi.fn(),
      elConfirm: vi.fn(() => Promise.resolve()),
      routerPush: vi.fn(),
      i18nT: vi.fn((k: string) => k),
      collaborators: { lockStore, notifStore, permissionStore, dictStore, tagsViewStore, noticeStore }
    }
  })

vi.mock('@/api/login', () => api)
vi.mock('@/utils/auth', () => auth)
vi.mock('@/utils/passwordRule', () => ({ setPwdChrType }))
vi.mock('@/utils/apiCache', () => ({ clearAllApiCache }))
vi.mock('@/plugins/cache', () => ({ default: { session: { set: cacheSessionSet } } }))
vi.mock('element-plus', () => ({ ElMessageBox: { confirm: elConfirm } }))
vi.mock('@/router', () => ({ default: { push: routerPush } }))
vi.mock('@/i18n', () => ({ default: { global: { t: i18nT } } }))
vi.mock('@/assets/images/profile.webp', () => ({ default: '/default-avatar.png' }))

vi.mock('@/store/modules/lock', () => ({
  default: () => collaborators.lockStore,
  useLockStore: () => collaborators.lockStore
}))
vi.mock('@/store/modules/notification', () => ({
  default: () => collaborators.notifStore,
  useNotificationStore: () => collaborators.notifStore
}))
vi.mock('@/store/modules/permission', () => ({
  default: () => collaborators.permissionStore,
  usePermissionStore: () => collaborators.permissionStore
}))
vi.mock('@/store/modules/dict', () => ({
  default: () => collaborators.dictStore,
  useDictStore: () => collaborators.dictStore
}))
vi.mock('@/store/modules/tagsView', () => ({
  default: () => collaborators.tagsViewStore,
  useTagsViewStore: () => collaborators.tagsViewStore
}))
vi.mock('@/store/modules/notice', () => ({
  default: () => collaborators.noticeStore,
  useNoticeStore: () => collaborators.noticeStore
}))

import useUserStore from './user'

function flush() {
  return new Promise((r) => setTimeout(r, 0))
}

describe('store/modules/user', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    auth.getToken.mockReturnValue('')
    api.login.mockReset()
    api.logout.mockReset()
    api.getInfo.mockReset()
    auth.setToken.mockClear()
    auth.removeToken.mockClear()
    cacheSessionSet.mockClear()
    setPwdChrType.mockClear()
    clearAllApiCache.mockClear()
    elConfirm.mockClear().mockImplementation(() => Promise.resolve())
    routerPush.mockClear()
    collaborators.lockStore.unlockScreen.mockClear()
    collaborators.notifStore.init.mockClear()
    collaborators.notifStore.disconnect.mockClear()
    collaborators.notifStore.clearAll.mockClear()
    collaborators.permissionStore.resetRoutes.mockClear()
    collaborators.dictStore.cleanDict.mockClear()
    collaborators.tagsViewStore.delAllViews.mockClear()
    collaborators.noticeStore.clearAll.mockClear()
    vi.stubEnv('VITE_APP_BASE_API', '/dev-api')
  })

  it('token state is seeded from getToken() at store creation', () => {
    auth.getToken.mockReturnValue('seed-token')
    const store = useUserStore()
    expect(store.token).toBe('seed-token')
  })

  it('login trims username, dispatches api, persists token, unlocks screen and inits notifications', async () => {
    api.login.mockResolvedValue({ token: 'abc123' })
    const store = useUserStore()
    await store.login({ username: '  admin  ', password: 'pw', code: '9', uuid: 'u1' })
    // P0-4：第 5 个参数是 totpCode（本次未提供 ⇒ undefined；见下一条用例）
    expect(api.login).toHaveBeenCalledWith('admin', 'pw', '9', 'u1', undefined)
    expect(auth.setToken).toHaveBeenCalledWith('abc123')
    expect(store.token).toBe('abc123')
    expect(collaborators.lockStore.unlockScreen).toHaveBeenCalled()
    expect(collaborators.notifStore.init).toHaveBeenCalled()
  })

  // P0-4 回归（第十八批）：TOTP 第二步必须把 `totpCode` 透传到 api.login，
  // 否则后端恒返回 1003（且该码不弹 Toast）⇒ 用户"点了登录没反应"。
  it('login forwards totpCode to api.login (TOTP 二次验证链路)', async () => {
    api.login.mockResolvedValue({ token: 'totp-token' })
    const store = useUserStore()
    await store.login({ username: 'admin', password: 'pw', code: '9', uuid: 'u1', totpCode: '123456' })
    expect(api.login).toHaveBeenCalledWith('admin', 'pw', '9', 'u1', '123456')
    expect(store.token).toBe('totp-token')
  })

  it('login rejects upward when the api call fails (no silent swallow)', async () => {
    api.login.mockRejectedValue(new Error('bad creds'))
    const store = useUserStore()
    await expect(store.login({ username: 'a', password: 'b', code: 'c', uuid: 'd' })).rejects.toThrow('bad creds')
    expect(auth.setToken).not.toHaveBeenCalled()
  })

  it('getInfo stores non-empty roles + permissions and returns res', async () => {
    api.getInfo.mockResolvedValue({
      user: { userId: 7, userName: 'bob', nickName: 'Bobby', avatar: '' },
      roles: ['admin'],
      permissions: ['a:b'],
      pwdChrtype: '2'
    })
    const store = useUserStore()
    const res = await store.getInfo()
    expect(res.permissions).toEqual(['a:b'])
    expect(store.roles).toEqual(['admin'])
    expect(store.permissions).toEqual(['a:b'])
    expect(store.id).toBe(7)
    expect(store.name).toBe('bob')
    expect(store.nickName).toBe('Bobby')
    // empty avatar -> local default asset
    expect(store.avatar).toBe('/default-avatar.png')
    expect(cacheSessionSet).toHaveBeenCalledWith('pwdChrtype', '2')
    expect(setPwdChrType).toHaveBeenCalledWith('2')
  })

  // 多租户 Phase 3 / F-6：[ui].show_tenant_column 的展示决策由后端算好下发，
  // store 只做落库；缺字段必须视为 false（fail-safe，宁可不显示归属列）
  it('getInfo maps showTenantColumn from the server decision (missing -> false)', async () => {
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], showTenantColumn: true })
    const store = useUserStore()
    await store.getInfo()
    expect(store.showTenantColumn).toBe(true)

    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'] })
    await store.getInfo()
    expect(store.showTenantColumn).toBe(false)

    // 非布尔真值不得被当成 true（严格 === true）
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], showTenantColumn: 'true' })
    await store.getInfo()
    expect(store.showTenantColumn).toBe(false)
  })

  // 多租户 Phase 3：[ui].tenant_filter 的「按租户筛选」入口同样由后端算好下发，
  // store 只做落库；缺字段必须视为 false（fail-safe，宁可不显示入口）
  it('getInfo maps showTenantFilter from the server decision (missing -> false)', async () => {
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], showTenantFilter: true })
    const store = useUserStore()
    await store.getInfo()
    expect(store.showTenantFilter).toBe(true)

    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'] })
    await store.getInfo()
    expect(store.showTenantFilter).toBe(false)

    // 非布尔真值不得被当成 true（严格 === true）
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], showTenantFilter: 1 })
    await store.getInfo()
    expect(store.showTenantFilter).toBe(false)
  })

  // GDPR 用户匿名化：能力位 privacy.user_erasure + 平台归属由后端算好后随 getInfo 下发，
  // store 只做落库；缺字段必须视为 false（fail-safe，宁可不显示入口），
  // 并断言 reset 会清理它（避免切换账号后残留入口）
  it('getInfo maps showUserErasure from the server decision (missing -> false) and reset clears it', async () => {
    const store = useUserStore()
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], showUserErasure: true })
    await store.getInfo()
    expect(store.showUserErasure).toBe(true)

    // reset 必须清理（否则切换账号后仍显示"匿名化"入口）
    await store.logOut()
    expect(store.showUserErasure).toBe(false)

    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'] })
    await store.getInfo()
    expect(store.showUserErasure).toBe(false)

    // 非布尔真值不得被当成 true（严格 === true）
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], showUserErasure: 'yes' })
    await store.getInfo()
    expect(store.showUserErasure).toBe(false)
  })

  // 通行密钥（Passkey）：能力位 auth.webauthn 由后端算好后随 getInfo 下发，
  // store 只做落库；缺字段必须视为 false（fail-safe ⇒ 不显示页签、不探测端点），
  // 并断言 reset 会清理它（避免切换账号后残留页签）
  it('getInfo maps showPasskey from the server decision (missing -> false) and reset clears it', async () => {
    const store = useUserStore()
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], showPasskey: true })
    await store.getInfo()
    expect(store.showPasskey).toBe(true)

    // reset 必须清理（否则切换账号后仍显示通行密钥页签 ⇒ 端点 404 假入口）
    await store.logOut()
    expect(store.showPasskey).toBe(false)

    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'] })
    await store.getInfo()
    expect(store.showPasskey).toBe(false)

    // 非布尔真值不得被当成 true（严格 === true）
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], showPasskey: 1 })
    await store.getInfo()
    expect(store.showPasskey).toBe(false)
  })

  it('getInfo falls back to ROLE_DEFAULT when roles empty (and skips permissions)', async () => {
    api.getInfo.mockResolvedValue({ user: {}, roles: [], permissions: undefined })
    const store = useUserStore()
    await store.getInfo()
    expect(store.roles).toEqual(['ROLE_DEFAULT'])
    expect(store.permissions).toEqual([])
    expect(store.id).toBe('')
    expect(store.name).toBe('')
    // no pwdChrtype -> default '0'
    expect(cacheSessionSet).toHaveBeenCalledWith('pwdChrtype', '0')
    expect(setPwdChrType).toHaveBeenCalledWith('0')
  })

  it('getInfo keeps an absolute http avatar untouched', async () => {
    api.getInfo.mockResolvedValue({
      user: { avatar: 'https://cdn/x.png' },
      roles: ['r']
    })
    const store = useUserStore()
    await store.getInfo()
    expect(store.avatar).toBe('https://cdn/x.png')
  })

  it('getInfo does not double-prefix an avatar that already carries baseApi', async () => {
    api.getInfo.mockResolvedValue({ user: { avatar: '/dev-api/uploads/pic.png' }, roles: ['r'] })
    const store = useUserStore()
    await store.getInfo()
    expect(store.avatar).toBe('/dev-api/uploads/pic.png')
  })

  it('getInfo prefixes a relative avatar with baseApi', async () => {
    api.getInfo.mockResolvedValue({ user: { avatar: '/uploads/pic.png' }, roles: ['r'] })
    const store = useUserStore()
    await store.getInfo()
    expect(store.avatar).toBe('/dev-api/uploads/pic.png')
  })

  it('getInfo prompts for initial-password change and routes to reset on confirm', async () => {
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], isDefaultModifyPwd: true })
    const store = useUserStore()
    await store.getInfo()
    expect(elConfirm).toHaveBeenCalled()
    await flush()
    expect(routerPush).toHaveBeenCalledWith({ name: 'Profile', params: { activeTab: 'resetPwd' } })
  })

  it('getInfo warns on expired password only when initial-password flag is false', async () => {
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], isDefaultModifyPwd: false, isPasswordExpired: true })
    const store = useUserStore()
    await store.getInfo()
    expect(elConfirm).toHaveBeenCalledTimes(1)
    await flush()
    expect(routerPush).toHaveBeenCalledWith({ name: 'Profile', params: { activeTab: 'resetPwd' } })
  })

  it('getInfo shows no prompt when password is fine', async () => {
    api.getInfo.mockResolvedValue({ user: {}, roles: ['r'], isDefaultModifyPwd: false, isPasswordExpired: false })
    const store = useUserStore()
    await store.getInfo()
    expect(elConfirm).not.toHaveBeenCalled()
  })

  it('getInfo rejects upward when the api call fails', async () => {
    api.getInfo.mockRejectedValue(new Error('401'))
    const store = useUserStore()
    await expect(store.getInfo()).rejects.toThrow('401')
  })

  it('logOut clears all session state even when the api succeeds', async () => {
    api.logout.mockResolvedValue({})
    const store = useUserStore()
    Object.assign(store, {
      token: 't',
      roles: ['admin'],
      permissions: ['p'],
      id: 3,
      name: 'n',
      nickName: 'nn',
      avatar: 'a'
    })
    await store.logOut()
    expect(api.logout).toHaveBeenCalled()
    expect(collaborators.notifStore.disconnect).toHaveBeenCalled()
    expect(collaborators.notifStore.clearAll).toHaveBeenCalled()
    expect(collaborators.noticeStore.clearAll).toHaveBeenCalled()
    expect(collaborators.permissionStore.resetRoutes).toHaveBeenCalled()
    expect(collaborators.dictStore.cleanDict).toHaveBeenCalled()
    expect(clearAllApiCache).toHaveBeenCalled()
    expect(collaborators.tagsViewStore.delAllViews).toHaveBeenCalled()
    expect(auth.removeToken).toHaveBeenCalled()
    expect(store.token).toBe('')
    expect(store.roles).toEqual([])
    expect(store.permissions).toEqual([])
    expect(store.id).toBe('')
    expect(store.name).toBe('')
    expect(store.nickName).toBe('')
    expect(store.avatar).toBe('')
  })

  it('logOut still cleans up when the logout api rejects', async () => {
    api.logout.mockRejectedValue(new Error('network'))
    const store = useUserStore()
    store.token = 'keep'
    await store.logOut()
    expect(store.token).toBe('')
    expect(auth.removeToken).toHaveBeenCalled()
    expect(collaborators.permissionStore.resetRoutes).toHaveBeenCalled()
  })
})
