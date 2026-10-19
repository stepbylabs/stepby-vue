/**
 * 全局导航守卫单测（b72）。
 *
 * `src/permission.ts` 是全站唯一的鉴权入口，此前**零测试**（b71 终值实测）。它承担四类
 * 安全语义，任何一类静默回归都不会报错、只会"看起来能用"：
 * ① 锁屏绕过防线（锁屏时任何 URL 都必须回 /lock，P0-62）；
 * ② 强制改密拦截（标志置位时只放行改密页签）；
 * ③ 未登录重定向的 redirect 参数编码（多参深链不得被拆成 /login 自己的 query）；
 * ④ 冷加载失败的 5 路分类（网络 / 403 / 5xx / 401 登出 / 未知），错一路就是把用户
 *    踢下线或把已登出用户留在假登录态。
 * 本测把四类的**决策表**钉死。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

/** 守卫入参的最小路由形状：只声明本文件用到的字段（不引 vue-router 类型，避免与 mock 边界打架） */
type RouteLike = {
  path: string
  fullPath: string
  query: Record<string, unknown>
  hash: string
  meta: Record<string, unknown>
}
/** 动态路由记录的最小形状（permission store 的返回值只需 path 字段即可被断言） */
type RouteRecord = { path: string }
/** 守卫返回值：true=放行 / 字符串=重定向 URL / 对象=重定向目标 / undefined=已处理 */
type GuardResult = string | (Partial<RouteLike> & { replace?: boolean }) | boolean | void
type GuardFn = (to: RouteLike, from: Partial<RouteLike>) => Promise<GuardResult>
/** 冷加载失败时注入的错误形状（对应 AxiosError 的本测所需子集） */
type ErrLike = { response?: { status?: number }; message?: string; code?: string }

const mocks = vi.hoisted(() => {
  const hooks: GuardFn[] = []
  return {
    hooks,
    router: {
      beforeEach: (fn: GuardFn) => hooks.push(fn),
      afterEach: (_fn: () => void) => undefined,
      addRoute: (_route: RouteRecord) => undefined,
      push: (_p: string | Partial<RouteLike>) => undefined
    },
    getToken: { value: '' as string },
    user: {
      roles: [] as string[],
      mustChangePassword: false,
      getInfo: vi.fn(async () => undefined),
      logOut: vi.fn(async () => undefined)
    },
    lock: { isLock: false },
    settings: { setTitle: vi.fn() },
    permission: { generateRoutes: vi.fn(async () => [] as RouteRecord[]) },
    isRelogin: { show: false },
    errorReport: vi.fn(),
    doneProgress: vi.fn(),
    startProgress: vi.fn()
  }
})

vi.mock('./router', () => ({ default: mocks.router }))
vi.mock('@/utils/auth', () => ({ getToken: () => mocks.getToken.value }))
vi.mock('@/utils/validate', () => ({
  isHttp: (p: string) => /^https?:\/\//.test(p),
  // 与生产 isPathMatch 的**测试所需子集**等价：精确相等（白名单里没有通配项）
  isPathMatch: (pattern: string, path: string) => pattern === path
}))
vi.mock('@/utils/request', () => ({ isRelogin: mocks.isRelogin }))
vi.mock('@/utils/errorHub', () => ({ errorHub: { report: mocks.errorReport } }))
vi.mock('@/utils/progress', () => ({ startProgress: mocks.startProgress, doneProgress: mocks.doneProgress }))
vi.mock('@/store/modules/user', () => ({ default: () => mocks.user }))
vi.mock('@/store/modules/lock', () => ({ default: () => mocks.lock }))
vi.mock('@/store/modules/settings', () => ({ default: () => mocks.settings }))
vi.mock('@/store/modules/permission', () => ({ default: () => mocks.permission }))
vi.mock('@/i18n', () => ({ default: { global: { t: (k: string) => k } } }))
vi.mock('@/composables/useMenuTitle', () => ({
  translateTitle: (m: { title?: string; i18nKey?: string }) => m.title ?? ''
}))

const to = (path: string, extra: Partial<RouteLike> = {}): RouteLike => ({
  path,
  fullPath: path,
  query: {},
  hash: '',
  meta: {},
  ...extra
})

let guardFn: GuardFn | null = null

/** 守卫只在模块首次求值时注册一次（`import` 被缓存），故取回后复用 */
async function guard() {
  if (!guardFn) {
    await import('./permission')
    expect(mocks.hooks.length, 'beforeEach 必须恰好注册一次').toBe(1)
    guardFn = mocks.hooks[0]
  }
  return guardFn
}

beforeEach(() => {
  mocks.getToken.value = ''
  mocks.user.roles = []
  mocks.user.mustChangePassword = false
  mocks.user.getInfo.mockClear()
  mocks.user.logOut.mockClear()
  mocks.lock.isLock = false
  mocks.permission.generateRoutes.mockClear()
  mocks.permission.generateRoutes.mockResolvedValue([])
  mocks.isRelogin.show = true
  mocks.errorReport.mockClear()
})

describe('① 锁屏绕过防线（P0-62）', () => {
  it('锁屏时任何非 /lock 路径（含免登录白名单 /register）一律回 /lock', async () => {
    mocks.getToken.value = 't'
    mocks.user.roles = ['admin']
    mocks.lock.isLock = true
    const g = await guard()
    for (const path of ['/register', '/privacy', '/system/user', '/oauth-login']) {
      await expect(g(to(path), {})).resolves.toEqual({ path: '/lock' })
    }
  })

  it('锁屏中访问 /lock 本身放行（否则会自死循环）', async () => {
    mocks.getToken.value = 't'
    mocks.user.roles = ['admin']
    mocks.lock.isLock = true
    const g = await guard()
    await expect(g(to('/lock'), {})).resolves.toBe(true)
  })

  it('未锁屏访问 /lock 回首页', async () => {
    mocks.getToken.value = 't'
    mocks.user.roles = ['admin']
    const g = await guard()
    await expect(g(to('/lock'), {})).resolves.toEqual({ path: '/' })
  })
})

describe('② 强制改密拦截', () => {
  it('标志置位且用户信息已加载：非改密页一律转 /user/profile?activeTab=resetPwd', async () => {
    mocks.getToken.value = 't'
    mocks.user.roles = ['admin']
    mocks.user.mustChangePassword = true
    const g = await guard()
    await expect(g(to('/system/user'), {})).resolves.toEqual({
      path: '/user/profile',
      query: { activeTab: 'resetPwd' }
    })
  })

  it('改密页签本身放行', async () => {
    mocks.getToken.value = 't'
    mocks.user.roles = ['admin']
    mocks.user.mustChangePassword = true
    const g = await guard()
    await expect(g(to('/user/profile'), {})).resolves.toBe(true)
  })

  it('冷加载（roles 尚空）不得误拦——先取用户信息再判定', async () => {
    mocks.getToken.value = 't'
    mocks.user.mustChangePassword = true
    const g = await guard()
    const res = await g(to('/system/user'), {})
    expect(res).toEqual({ path: '/system/user', query: {}, hash: '', replace: true })
    expect(mocks.user.getInfo).toHaveBeenCalled()
  })
})

describe('③ 未登录重定向', () => {
  it('白名单直进', async () => {
    const g = await guard()
    for (const path of ['/login', '/register', '/privacy', '/403', '/500', '/network-error']) {
      await expect(g(to(path), {})).resolves.toBe(true)
    }
  })

  it('非白名单 ⇒ /login?redirect=…，且多参深链整体编码不丢参', async () => {
    const g = await guard()
    const res = await g({ ...to('/system/user'), fullPath: '/system/user?deptId=3&pageSize=50' }, {})
    expect(res).toBe(`/login?redirect=${encodeURIComponent('/system/user?deptId=3&pageSize=50')}`)
    // 反证：若不整体编码，`&pageSize=50` 会变成 /login 自己的顶层参数（历史缺陷形态）。
    // 整体编码后整串只剩一层 query，故**不允许出现裸 &**（split 结果必须为 1 段）。
    expect(String(res).split('&').length, 'redirect 内的 & 必须被转义，不能出现裸 &').toBe(1)
    // 正向可逆性：解码后深链参数完整回来（丢参即回归）
    expect(new URLSearchParams(String(res).slice('/login?'.length)).get('redirect'))
      .toBe('/system/user?deptId=3&pageSize=50')
  })
})

describe('④ 冷加载失败的 5 路分类', () => {
  const cases: Array<[string, ErrLike, Record<string, unknown> | true, boolean]> = [
    ['网络异常', Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' }), { path: '/network-error' }, false],
    ['超时', Object.assign(new Error('timeout of 0ms exceeded'), { code: 'ECONNABORTED' }), { path: '/network-error' }, false],
    ['403 不登出', { response: { status: 403 }, message: 'forbidden' }, { path: '/403' }, false],
    ['500 不登出', { response: { status: 500 }, message: 'boom' }, { path: '/500' }, false],
    ['502/503/504 同样不登出', { response: { status: 502 }, message: 'gw' }, { path: '/500' }, false],
    ['401 必须登出', { response: { status: 401 }, message: 'expired' }, { path: '/' }, true],
    ['未知错误保留登录态跳 500', { message: 'weird' }, { path: '/500' }, false]
  ]

  it.each(cases)('%s', async (_label, err, expected, shouldLogout) => {
    mocks.getToken.value = 't'
    mocks.user.getInfo.mockRejectedValueOnce(err)
    const g = await guard()
    await expect(g(to('/system/user'), {})).resolves.toEqual(expected)
    if (shouldLogout) expect(mocks.user.logOut).toHaveBeenCalledTimes(1)
    else expect(mocks.user.logOut).not.toHaveBeenCalled()
    // finally 复位：残留 true 会让后续 401 不再弹"重新登录"框（历史缺陷）
    expect(mocks.isRelogin.show, 'isRelogin.show 必须在 finally 复位').toBe(false)
  })

  it('成功冷加载：动态路由逐条 addRoute，http 外链不注册', async () => {
    mocks.getToken.value = 't'
    mocks.permission.generateRoutes.mockResolvedValueOnce([
      { path: '/system/user' },
      { path: 'https://example.com/ext' }
    ])
    const addRoute = vi.spyOn(mocks.router, 'addRoute')
    const g = await guard()
    await g(to('/system/user?tab=2', { query: { tab: '2' } }), {})
    expect(addRoute).toHaveBeenCalledTimes(1)
    addRoute.mockRestore()
  })

  it('登录态访问 /login ⇒ 直接回首页，不再拉取用户信息', async () => {
    mocks.getToken.value = 't'
    mocks.user.roles = ['admin']
    const g = await guard()
    await expect(g(to('/login'), {})).resolves.toEqual({ path: '/' })
    expect(mocks.user.getInfo).not.toHaveBeenCalled()
  })
})
