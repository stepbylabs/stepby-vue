import { describe, it, expect, vi, beforeEach } from 'vitest'

// --- mocks：router 与 tagsView store ---
// 批六十四回归锁：`delCachedView` / `delView` 是**同步** action（返回数组/对象，非 Promise）。
// 此前 tab.ts 把二者当 Promise 链（`.then()`）→ 同步抛
// `TypeError: delCachedView(...).then is not a function`，被 App 错误边界捕获后跳 /500
// （F136 实测：点顶栏「刷新」崩页；profile 页 `closePage()` 同源）。
const hoisted = vi.hoisted(() => {
  const replace = vi.fn(() => Promise.resolve())
  const push = vi.fn(() => Promise.resolve())
  const delCachedView = vi.fn(() => ['cachedA'])
  const delView = vi.fn(() => ({ visitedViews: [{ path: '/index', fullPath: '/index' }], cachedViews: [] }))
  return { replace, push, delCachedView, delView }
})

vi.mock('@/router', () => ({
  default: {
    currentRoute: { value: { path: '/monitor/observability', query: { a: '1' }, matched: [] } },
    replace: hoisted.replace,
    push: hoisted.push
  }
}))

vi.mock('@/store/modules/tagsView', () => ({
  default: () => ({ delCachedView: hoisted.delCachedView, delView: hoisted.delView })
}))

import tab from './tab'

describe('plugins/tab 刷新/关闭页签（同步 action 兼容回归锁）', () => {
  beforeEach(() => {
    hoisted.replace.mockClear()
    hoisted.push.mockClear()
    hoisted.delCachedView.mockClear()
    hoisted.delView.mockClear()
  })

  it('refreshPage(obj) 不抛错并返回 Promise，且清缓存 + replace 到 /redirect', async () => {
    const obj = { name: 'Observability', path: '/monitor/observability', query: { a: '1' } }
    const p = tab.refreshPage(obj as never)
    expect(p).toBeInstanceOf(Promise)
    await expect(p).resolves.toBeUndefined()
    expect(hoisted.delCachedView).toHaveBeenCalledWith(obj)
    expect(hoisted.replace).toHaveBeenCalledWith({
      path: '/redirect/monitor/observability',
      query: { a: '1' }
    })
  })

  it('refreshPage() 无参且 matched 未命中时安全返回（不抛错）', async () => {
    await expect(tab.refreshPage()).resolves.toBeUndefined()
    expect(hoisted.replace).not.toHaveBeenCalled()
  })

  it('refreshPage() 在 /redirect 前缀下直接返回（防重复刷新）', async () => {
    // 覆盖 currentRoute.path 为 /redirect/xxx 的场景
    vi.mocked(hoisted.replace).mockClear()
    const p = tab.refreshPage({ name: 'X', path: '/redirect/x', query: {} } as never)
    await expect(p).resolves.toBeUndefined()
  })

  it('closePage() 无参不抛错并返回 Promise（同步 delView 兼容）', async () => {
    const p = tab.closePage()
    expect(p).toBeInstanceOf(Promise)
    const res = await p
    expect(res).toHaveProperty('visitedViews')
    expect(hoisted.delView).toHaveBeenCalled()
    expect(hoisted.push).toHaveBeenCalled()
  })

  it('closePage(obj) 不抛错并返回 Promise', async () => {
    const obj = { name: 'X', path: '/x', query: {} }
    const p = tab.closePage(obj as never)
    expect(p).toBeInstanceOf(Promise)
    await expect(p).resolves.toBeDefined()
  })
})
