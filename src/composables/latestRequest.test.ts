/**
 * 「只让最后一次请求的结局生效」原语的回归锁（b119）。
 *
 * 判据全部是行为判据：用可控的 deferred 让两次请求重叠，再逐字段核对
 * 「旧响应落地了没有」——数据、错误态、loading 三处分别断，因为手写实现
 * 最常见的坏法正是"判了数据、没判 finally"（旧请求把新请求的加载态摘掉）。
 *
 * 每条正向判据都配一条**反证**：把同一夹具换成裸计数器（不判票），
 * 断言旧响应确实会写进去——否则"没写"可能只是夹具根本没造出重叠。
 */
import { describe, it, expect } from 'vitest'
import { createLatestGuard } from './latestRequest'

interface Deferred<T> {
  promise: Promise<T>
  resolve: (v: T) => void
  reject: (e: unknown) => void
}

function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void
  let reject!: (e: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 页面形态夹具：loading + rows + error 三处落地，与手写列表页同形 */
function pageHarness(guarded: boolean) {
  const state = { loading: false, rows: [] as string[], error: false, tickets: [] as number[] }
  let bare = 0
  const guard = createLatestGuard()
  function getList(p: Promise<string[]>) {
    const ticket = guarded ? guard.begin() : ++bare
    // 反证组是"根本没有守卫"，不是"换一种计数器"——否则反证会替被测实现说话
    const current = () => (guarded ? guard.isCurrent(ticket) : true)
    state.tickets.push(ticket)
    state.loading = true
    return p
      .then((rows) => {
        if (!current()) return
        state.error = false
        state.rows = rows
      })
      .catch(() => {
        if (!current()) return
        state.error = true
        state.rows = []
      })
      .finally(() => {
        if (current()) state.loading = false
      })
  }
  return { state, guard, getList }
}

describe('createLatestGuard（b119 单一实现）', () => {
  it('① begin 单调递增，isCurrent 只认最新票据', () => {
    const guard = createLatestGuard()
    const first = guard.begin()
    expect(guard.isCurrent(first)).toBe(true)
    const second = guard.begin()
    expect(second).toBeGreaterThan(first)
    expect(guard.isCurrent(first)).toBe(false)
    expect(guard.isCurrent(second)).toBe(true)
    // 未申请过的票号（0 / 负数 / 未来号）一律不是最新——外来的 ticket 不得借道
    expect(guard.isCurrent(0)).toBe(false)
    expect(guard.isCurrent(-1)).toBe(false)
    expect(guard.isCurrent(second + 1)).toBe(false)
  })

  it('② 后发先回：旧响应不得写数据/错误态/loading 任一处', async () => {
    const { state, getList } = pageHarness(true)
    const slow = deferred<string[]>()
    const fast = deferred<string[]>()
    const firstRun = getList(slow.promise)
    const secondRun = getList(fast.promise)
    fast.resolve(['新条件'])
    await secondRun
    expect(state.rows).toEqual(['新条件'])
    expect(state.loading).toBe(false)
    // 旧响应此刻才回来：三处都不得被改写
    slow.resolve(['旧条件'])
    await firstRun
    expect(state.rows).toEqual(['新条件'])
    expect(state.error).toBe(false)
    expect(state.loading).toBe(false)
  })

  it('③ 旧请求失败也不得污染新请求的成功态', async () => {
    const { state, getList } = pageHarness(true)
    const slow = deferred<string[]>()
    const fast = deferred<string[]>()
    const firstRun = getList(slow.promise)
    const secondRun = getList(fast.promise)
    fast.resolve(['新条件'])
    await secondRun
    slow.reject(new Error('旧请求超时'))
    await firstRun
    expect(state.error).toBe(false)
    expect(state.rows).toEqual(['新条件'])
  })

  it('④ 反证：同一夹具去掉守卫后，旧响应确实会写进去（夹具能造出重叠）', async () => {
    const { state, getList } = pageHarness(false)
    const slow = deferred<string[]>()
    const fast = deferred<string[]>()
    const firstRun = getList(slow.promise)
    const secondRun = getList(fast.promise)
    fast.resolve(['新条件'])
    await secondRun
    slow.resolve(['旧条件'])
    await firstRun
    expect(state.rows).toEqual(['旧条件'])
    // 并且旧请求的 finally 把 loading 提前摘掉了 —— 这正是"判数据不判收尾"的形态
    // （此处 loading 本就该是 false；下面单独造一条"新请求仍在飞"的断面）
    const third = deferred<string[]>()
    const thirdRun = getList(third.promise)
    expect(state.loading).toBe(true)
    const fourth = deferred<string[]>()
    const fourthRun = getList(fourth.promise)
    third.resolve(['第三'])
    await thirdRun
    expect(state.loading).toBe(false) // 未被守卫拦住：第三个请求的收尾关了第四个请求的 loading
    fourth.resolve(['第四'])
    await fourthRun
    expect(state.rows).toEqual(['第四'])
  })

  it('⑤ invalidate：在飞请求立即失去写权，且下一次 begin 仍是最新', async () => {
    const { guard } = pageHarness(true)
    const inFlight = deferred<string[]>()
    const run = (() => {
      const ticket = guard.begin()
      return { ticket, done: inFlight.promise.then(() => ticket) }
    })()
    guard.invalidate()
    expect(guard.isCurrent(run.ticket)).toBe(false)
    const next = guard.begin()
    expect(guard.isCurrent(next)).toBe(true)
    expect(guard.isCurrent(run.ticket)).toBe(false)
    inFlight.resolve([])
    await run.done
  })

  it('⑥ 每个 guard 实例互不影响（按 tab 分键时每个键一个实例）', () => {
    const tabA = createLatestGuard()
    const tabB = createLatestGuard()
    const a1 = tabA.begin()
    const b1 = tabB.begin()
    tabA.begin()
    expect(tabA.isCurrent(a1)).toBe(false)
    expect(tabB.isCurrent(b1)).toBe(true)
  })
})
