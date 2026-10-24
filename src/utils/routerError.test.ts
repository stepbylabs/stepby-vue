import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { isChunkLoadError, reloadOnChunkError, shouldSuppressAutoReload } from '@/utils/routerError'

/** 与实现同源的窗口值（改窗口必须同时改这里 ⇒ 由断言而非注释约束） */
const GUARD_MS = 60_000

describe('isChunkLoadError', () => {
  it('识别 "Failed to fetch dynamically imported module"', () => {
    expect(isChunkLoadError(new Error('Failed to fetch dynamically imported module ./src/views/x.js'))).toBe(true)
  })

  it('识别 "Loading chunk ... failed"', () => {
    expect(isChunkLoadError(new Error('Loading chunk 123 failed'))).toBe(true)
  })

  it('识别 "Importing a module script failed"', () => {
    expect(isChunkLoadError(new Error('Importing a module script failed'))).toBe(true)
  })

  it('非 chunk 错误的消息返回 false', () => {
    expect(isChunkLoadError(new Error('Network Error'))).toBe(false)
    expect(isChunkLoadError(new Error(''))).toBe(false)
  })

  it('非 Error 类型（string / null / undefined）返回 false', () => {
    expect(isChunkLoadError('Failed to fetch dynamically imported module')).toBe(false)
    expect(isChunkLoadError(null)).toBe(false)
    expect(isChunkLoadError(undefined)).toBe(false)
    expect(isChunkLoadError({ message: 'Loading chunk 1 failed' })).toBe(false)
  })
})

// ============================================================================
// shouldSuppressAutoReload —— 纯判定，先把尺本身钉住
// ============================================================================
describe('shouldSuppressAutoReload', () => {
  const NOW = 1_700_000_000_000

  it('没有任何标记 ⇒ 不抑制（首次失败必须能自动刷新）', () => {
    expect(shouldSuppressAutoReload([], NOW)).toBe(false)
    expect(shouldSuppressAutoReload([null, undefined, ''], NOW)).toBe(false)
  })

  it('窗口内的标记 ⇒ 抑制', () => {
    expect(shouldSuppressAutoReload([String(NOW - 1000)], NOW)).toBe(true)
  })

  it('过窗的标记 ⇒ 放行（旧实现是"整个会话永久只刷一次"，第二次发版就再也恢复不了）', () => {
    expect(shouldSuppressAutoReload([String(NOW - GUARD_MS - 1)], NOW)).toBe(false)
  })

  it('恰好等于窗口边界 ⇒ 放行（边界抖动不得变成永久卡死）', () => {
    expect(shouldSuppressAutoReload([String(NOW - GUARD_MS)], NOW)).toBe(false)
  })

  it('不可解析的标记按"刚刷过"处理（fail-closed：少刷一次可以手动救，多刷是自我 DDoS）', () => {
    expect(shouldSuppressAutoReload(['not-a-number'], NOW)).toBe(true)
    expect(shouldSuppressAutoReload([String(NOW - 1000), '垃圾'], NOW)).toBe(true)
  })

  it('多通道标记按**最新**那条判，与传入顺序无关', () => {
    // 为什么这组断言不是冗余：实现若写成"取数组第一条"（各通道可用性随环境变，
    // 顺序就是随机的），那么 [旧, 新] 这一支会放行 ⇒ 无限刷新，[新, 旧] 这一支会抑制。
    // 因此两种顺序都必须给出**同一个**结论，且该结论由较新的那条决定。
    const fresh = String(NOW - 5)
    const stale = String(NOW - GUARD_MS * 5)
    expect(shouldSuppressAutoReload([stale, fresh], NOW)).toBe(true)
    expect(shouldSuppressAutoReload([fresh, stale], NOW)).toBe(true)
    // 全过期 ⇒ 两种顺序都必须放行
    expect(shouldSuppressAutoReload([stale, String(NOW - GUARD_MS * 9)], NOW)).toBe(false)
    expect(shouldSuppressAutoReload([String(NOW - GUARD_MS * 9), stale], NOW)).toBe(false)
  })

  it('未来时间戳按"刚刷过"处理（时钟回拨 / 另一标签页超前，都不能变成循环）', () => {
    expect(shouldSuppressAutoReload([String(NOW + GUARD_MS * 3)], NOW)).toBe(true)
  })
})

// ============================================================================
// reloadOnChunkError 整页刷新兜底
// ============================================================================
describe('reloadOnChunkError', () => {
  let reloadSpy: ReturnType<typeof vi.fn>
  const originalName = window.name

  beforeEach(() => {
    sessionStorage.clear()
    window.name = ''
    reloadSpy = vi.fn()
    // 替换 location.reload（jsdom 默认 not implemented）
    Object.defineProperty(window, 'location', {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
      configurable: true
    })
  })

  afterEach(() => {
    // 顺序即判据：先解桩再清库。反过来写时 `sessionStorage.clear()` 会在"仍被 stub 成
    // undefined"的状态下抛，把后面那句 `unstubAllGlobals` 一起带走 ⇒ 桩泄漏给后续用例，
    // 于是一处失败连锁成三条（本文件第一版就踩在这个顺序上）。
    vi.unstubAllGlobals()
    sessionStorage.clear()
    window.name = originalName
  })

  it('首次调用写入时间戳标记并触发整页刷新', () => {
    const before = Date.now()
    const reloaded = reloadOnChunkError()
    const raw = sessionStorage.getItem('__router_chunk_reload__')
    expect(reloaded).toBe(true)
    expect(reloadSpy).toHaveBeenCalledTimes(1)
    // 标记必须是**可判定的时间戳**而不是常量 '1'：没有时刻就没有窗口
    const stamp = Number(raw)
    expect(Number.isFinite(stamp)).toBe(true)
    expect(stamp).toBeGreaterThanOrEqual(before)
  })

  it('标记在窗口内时不重复刷新（防循环刷新）', () => {
    expect(reloadOnChunkError()).toBe(true)
    expect(reloadOnChunkError()).toBe(false)
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('标记已过窗后必须再给一次自动刷新（旧实现永久只刷一次是缺陷）', () => {
    const now = 1_700_000_000_000
    sessionStorage.setItem('__router_chunk_reload__', String(now - GUARD_MS - 1))
    expect(reloadOnChunkError(now)).toBe(true)
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('主通道被禁时走 window.name 兜底，并且兜底真的被读', () => {
    const now = 1_700_000_000_000
    vi.stubGlobal('sessionStorage', undefined)
    expect(reloadOnChunkError(now)).toBe(true)
    expect(reloadSpy).toHaveBeenCalledTimes(1)
    expect(window.name).toBe(String(now))
    // 兜底通道必须**参与判定**：只看 sessionStorage 的话，这里会再刷一次 = 无限循环
    expect(reloadOnChunkError(now + 1000)).toBe(false)
    expect(reloadSpy).toHaveBeenCalledTimes(1)
  })

  it('两条通道都不可写时不得刷新（没有跨刷新的记忆 = 刷出去就是无界循环）', () => {
    vi.stubGlobal('sessionStorage', undefined)
    Object.defineProperty(window, 'name', {
      get() {
        throw new Error('blocked')
      },
      set() {
        throw new Error('blocked')
      },
      configurable: true
    })
    try {
      expect(reloadOnChunkError()).toBe(false)
      expect(reloadSpy).not.toHaveBeenCalled()
    } finally {
      Object.defineProperty(window, 'name', {
        value: '',
        writable: true,
        configurable: true
      })
    }
  })

  it('sessionStorage 里的脏标记不得让兜底逻辑抛（原实现在隐私模式下直接炸在 onError 里）', () => {
    sessionStorage.setItem('__router_chunk_reload__', '{not-a-timestamp')
    expect(() => reloadOnChunkError()).not.toThrow()
    expect(reloadSpy).not.toHaveBeenCalled()
  })
})
