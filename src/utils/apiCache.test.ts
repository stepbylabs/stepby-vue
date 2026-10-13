import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

import {
  cachedApi,
  invalidateApiCache,
  clearAllApiCache,
  refreshCachedApi,
  invalidateByPrefix,
  DEFAULT_API_CACHE_TTL
} from '@/utils/apiCache'

// ============================================================================
// apiCache API 响应缓存工具
// ============================================================================
// 由于 cacheMap / pendingMap 是模块级私有状态，每个用例前通过 clearAllApiCache 重置。
// TTL 通过 vi.useFakeTimers + advanceTimersByTime 控制，避免真实等待。
// ============================================================================

describe('apiCache', () => {
  beforeEach(() => {
    clearAllApiCache()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  // ==========================================================================
  // cachedApi 基本行为
  // ==========================================================================
  describe('cachedApi', () => {
    it('返回的数据与原函数一致', async () => {
      const mockFn = vi.fn().mockResolvedValue({ id: 1, name: 'stepby' })
      const cached = cachedApi('test:basic', mockFn)

      const result = await cached()

      expect(result).toEqual({ id: 1, name: 'stepby' })
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('支持字符串参数透传给原函数', async () => {
      const mockFn = vi.fn().mockResolvedValue('ok')
      const cached = cachedApi('test:args', mockFn)

      await cached('a', 1, true)

      expect(mockFn).toHaveBeenCalledWith('a', 1, true)
    })

    it('key 为函数时按入参动态生成 cacheKey', async () => {
      const mockFn = vi.fn().mockResolvedValue('ok')
      const cached = cachedApi((...args) => `k:${args.join('-')}`, mockFn)

      await cached('x', 'y')
      await cached('x', 'y') // 命中缓存，不再调用
      await cached('z') // 不同 key，再次调用

      expect(mockFn).toHaveBeenCalledTimes(2)
      expect(mockFn).toHaveBeenNthCalledWith(1, 'x', 'y')
      expect(mockFn).toHaveBeenNthCalledWith(2, 'z')
    })

    // --------------------------------------------------------------------------
    // TTL 缓存命中
    // --------------------------------------------------------------------------
    it('TTL 缓存命中 - 同 key 第二次调用不发请求', async () => {
      const mockFn = vi.fn().mockResolvedValue('value-1')
      const cached = cachedApi('test:hit', mockFn)

      await cached()
      // 第二次调用：应命中缓存，不再触发 mockFn
      const second = await cached()

      expect(second).toBe('value-1')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    // --------------------------------------------------------------------------
    // TTL 过期后重新请求
    // --------------------------------------------------------------------------
    it('TTL 过期后重新请求', async () => {
      let count = 0
      const mockFn = vi.fn().mockImplementation(() => Promise.resolve(`value-${++count}`))
      const ttl = 1000
      const cached = cachedApi('test:expire', mockFn, ttl)

      const first = await cached()
      expect(first).toBe('value-1')
      expect(mockFn).toHaveBeenCalledTimes(1)

      // 推进时间至 TTL 之前 - 仍命中缓存
      vi.advanceTimersByTime(ttl - 10)
      const beforeExpire = await cached()
      expect(beforeExpire).toBe('value-1')
      expect(mockFn).toHaveBeenCalledTimes(1)

      // 推进时间超过 TTL - 缓存失效，重新请求
      vi.advanceTimersByTime(20)
      const afterExpire = await cached()
      expect(afterExpire).toBe('value-2')
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('使用默认 TTL（DEFAULT_API_CACHE_TTL）时也能在过期后重新请求', async () => {
      let count = 0
      const mockFn = vi.fn().mockImplementation(() => Promise.resolve(`v-${++count}`))
      const cached = cachedApi('test:defaultTtl', mockFn)

      await cached()
      expect(mockFn).toHaveBeenCalledTimes(1)

      // 推进到默认 TTL 之前
      vi.advanceTimersByTime(DEFAULT_API_CACHE_TTL - 1)
      await cached()
      expect(mockFn).toHaveBeenCalledTimes(1)

      // 推进到默认 TTL 之后
      vi.advanceTimersByTime(2)
      await cached()
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('TTL 定时器自动过期回调会清理缓存条目（setEntry 内部 removeEntry）', async () => {
      let count = 0
      const mockFn = vi.fn().mockImplementation(() => Promise.resolve(`v-${++count}`))
      const ttl = 1000
      const cached = cachedApi('test:timerExpire', mockFn, ttl)

      await cached()
      expect(mockFn).toHaveBeenCalledTimes(1)

      // 推进超过 ttl + 100，触发 setTimeout 自动清理回调
      vi.advanceTimersByTime(ttl + 200)
      await cached()
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('真实定时器（jsdom 返回数字句柄）时跳过 unref 分支', async () => {
      // 默认 beforeEach 启用了 fake timers（其 setTimeout 返回带 unref 的对象）；
      // 切换到真实定时器后 jsdom 的 setTimeout 返回数字，覆盖 unref 守卫的 false 分支。
      vi.useRealTimers()
      const mockFn = vi.fn().mockResolvedValue('ok')
      const cached = cachedApi('test:realTimer', mockFn, 60_000)
      const result = await cached()
      expect(result).toBe('ok')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    // --------------------------------------------------------------------------
    // 并发去重
    // --------------------------------------------------------------------------
    it('并发去重 - 同 key 并发调用只发一次请求，结果共享', async () => {
      let resolveFn!: (v: string) => void
      const mockFn = vi.fn().mockImplementation(
        () =>
          new Promise<string>((resolve) => {
            resolveFn = resolve
          })
      )
      const cached = cachedApi('test:concurrent', mockFn)

      // 同时发起三个并发调用
      const p1 = cached()
      const p2 = cached()
      const p3 = cached()

      // 三个 Promise 应该是同一个（共享 pending）
      expect(mockFn).toHaveBeenCalledTimes(1)

      // resolve 后所有调用拿到相同结果
      resolveFn('shared-result')
      const [r1, r2, r3] = await Promise.all([p1, p2, p3])

      expect(r1).toBe('shared-result')
      expect(r2).toBe('shared-result')
      expect(r3).toBe('shared-result')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('并发请求完成后，后续调用命中缓存而非复用 pending', async () => {
      const mockFn = vi.fn().mockResolvedValue('done')
      const cached = cachedApi('test:afterPending', mockFn)

      await cached()
      await cached()

      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    // --------------------------------------------------------------------------
    // 请求失败不写缓存
    // --------------------------------------------------------------------------
    it('请求失败时不写缓存，下次调用重新请求', async () => {
      const error = new Error('network')
      const mockFn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('recovered')

      const cached = cachedApi('test:fail', mockFn)

      // 第一次调用失败
      await expect(cached()).rejects.toThrow('network')

      // 第二次调用：因失败未写缓存，应再次发请求并拿到成功结果
      const second = await cached()
      expect(second).toBe('recovered')
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('请求失败后不会卡住后续同 key 并发调用', async () => {
      const error = new Error('boom')
      const mockFn = vi.fn().mockRejectedValueOnce(error).mockResolvedValueOnce('ok')

      const cached = cachedApi('test:failConcurrent', mockFn)

      // 第一次失败
      await expect(cached()).rejects.toThrow('boom')

      // 立即并发两次调用 - 都应该能拿到第二次请求的结果
      const [a, b] = await Promise.all([cached(), cached()])
      expect(a).toBe('ok')
      expect(b).toBe('ok')
      // 失败 1 次 + 成功 1 次（第二次的并发去重）
      expect(mockFn).toHaveBeenCalledTimes(2)
    })
  })

  // ==========================================================================
  // invalidateApiCache 失效指定 key
  // ==========================================================================
  describe('invalidateApiCache', () => {
    it('清除指定 key 后下次调用重新请求', async () => {
      let count = 0
      const mockFn = vi.fn().mockImplementation(() => Promise.resolve(`v-${++count}`))
      const cached = cachedApi('test:invalidate', mockFn)

      await cached()
      expect(mockFn).toHaveBeenCalledTimes(1)

      // 命中缓存
      await cached()
      expect(mockFn).toHaveBeenCalledTimes(1)

      // 显式失效
      invalidateApiCache('test:invalidate')

      // 应重新请求
      const result = await cached()
      expect(result).toBe('v-2')
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('清除不存在的 key 不会抛错', () => {
      expect(() => invalidateApiCache('not-exist-key')).not.toThrow()
    })

    it('只清除指定 key，不影响其他 key', async () => {
      const mockA = vi.fn().mockResolvedValue('a')
      const mockB = vi.fn().mockResolvedValue('b')
      const cachedA = cachedApi('test:invalidate:a', mockA)
      const cachedB = cachedApi('test:invalidate:b', mockB)

      await cachedA()
      await cachedB()
      expect(mockA).toHaveBeenCalledTimes(1)
      expect(mockB).toHaveBeenCalledTimes(1)

      // 只失效 A
      invalidateApiCache('test:invalidate:a')

      await cachedA() // 重新请求
      await cachedB() // 命中缓存

      expect(mockA).toHaveBeenCalledTimes(2)
      expect(mockB).toHaveBeenCalledTimes(1)
    })
  })

  // ==========================================================================
  // invalidateByPrefix 按前缀批量失效
  // ==========================================================================
  describe('invalidateByPrefix', () => {
    it('按前缀批量失效，命中前缀的 key 重新请求，其他 key 仍命中缓存', async () => {
      let countA = 0
      let countB = 0
      let countC = 0
      const mockA = vi.fn().mockImplementation(() => Promise.resolve(`a-${++countA}`))
      const mockB = vi.fn().mockImplementation(() => Promise.resolve(`b-${++countB}`))
      const mockC = vi.fn().mockImplementation(() => Promise.resolve(`c-${++countC}`))
      const cachedA = cachedApi('pre:a', mockA)
      const cachedB = cachedApi('pre:b', mockB)
      const cachedC = cachedApi('other:c', mockC)

      await cachedA()
      await cachedB()
      await cachedC()
      expect(mockA).toHaveBeenCalledTimes(1)
      expect(mockB).toHaveBeenCalledTimes(1)
      expect(mockC).toHaveBeenCalledTimes(1)

      invalidateByPrefix('pre:')

      await cachedA()
      await cachedB()
      await cachedC()

      // 命中前缀的两个 key 被失效后重新请求
      expect(mockA).toHaveBeenCalledTimes(2)
      expect(mockB).toHaveBeenCalledTimes(2)
      // 未命中前缀的 key 仍命中缓存
      expect(mockC).toHaveBeenCalledTimes(1)
    })

    it('对不存在的前缀调用不抛错', async () => {
      await cachedApi('pre:noop', vi.fn().mockResolvedValue('x'))()
      expect(() => invalidateByPrefix('never-used-prefix:')).not.toThrow()
    })
  })

  // ==========================================================================
  // clearAllApiCache 清空所有缓存
  // ==========================================================================
  describe('clearAllApiCache', () => {
    it('清空所有缓存，所有 key 下次调用都重新请求', async () => {
      const mockA = vi.fn().mockResolvedValue('a')
      const mockB = vi.fn().mockResolvedValue('b')
      const cachedA = cachedApi('test:clear:a', mockA)
      const cachedB = cachedApi('test:clear:b', mockB)

      await cachedA()
      await cachedB()
      expect(mockA).toHaveBeenCalledTimes(1)
      expect(mockB).toHaveBeenCalledTimes(1)

      // 命中缓存
      await cachedA()
      await cachedB()
      expect(mockA).toHaveBeenCalledTimes(1)
      expect(mockB).toHaveBeenCalledTimes(1)

      // 清空全部
      clearAllApiCache()

      await cachedA()
      await cachedB()
      expect(mockA).toHaveBeenCalledTimes(2)
      expect(mockB).toHaveBeenCalledTimes(2)
    })

    it('清空后再调用不会返回旧的缓存数据', async () => {
      let count = 0
      const mockFn = vi.fn().mockImplementation(() => Promise.resolve(`v-${++count}`))
      const cached = cachedApi('test:clearStale', mockFn)

      const first = await cached()
      expect(first).toBe('v-1')

      clearAllApiCache()

      const second = await cached()
      expect(second).toBe('v-2')
    })
  })

  // ==========================================================================
  // refreshCachedApi 强制刷新
  // ==========================================================================
  describe('refreshCachedApi', () => {
    it('强制刷新 - 即使缓存未过期也重新请求', async () => {
      let count = 0
      const mockFn = vi.fn().mockImplementation(() => Promise.resolve(`v-${++count}`))
      const refresh = refreshCachedApi('test:refresh', mockFn, 60_000)

      const first = await refresh()
      expect(first).toBe('v-1')
      expect(mockFn).toHaveBeenCalledTimes(1)

      // 立即再次调用 refreshCachedApi - 即使 TTL 内也强制刷新
      const second = await refresh()
      expect(second).toBe('v-2')
      expect(mockFn).toHaveBeenCalledTimes(2)
    })

    it('refreshCachedApi 后改用 cachedApi 可命中新缓存', async () => {
      let count = 0
      const mockFn = vi.fn().mockImplementation(() => Promise.resolve(`v-${++count}`))
      const refresh = refreshCachedApi('test:refreshThenHit', mockFn, 60_000)
      const cached = cachedApi('test:refreshThenHit', mockFn, 60_000)

      // 强制刷新一次
      const refreshed = await refresh()
      expect(refreshed).toBe('v-1')
      expect(mockFn).toHaveBeenCalledTimes(1)

      // cachedApi 应命中 refresh 写入的缓存
      const hit = await cached()
      expect(hit).toBe('v-1')
      expect(mockFn).toHaveBeenCalledTimes(1)
    })

    it('refreshCachedApi 支持函数型 key', async () => {
      let count = 0
      const mockFn = vi.fn().mockImplementation(() => Promise.resolve(`v-${++count}`))
      const keyFn = (...args: unknown[]) => `rk:${args.join('-')}`
      const refresh = refreshCachedApi(keyFn, mockFn, 60_000)

      const a1 = await refresh('x')
      const a2 = await refresh('x') // 强制刷新同 key
      const b1 = await refresh('y') // 不同 key

      expect(a1).toBe('v-1')
      expect(a2).toBe('v-2')
      expect(b1).toBe('v-3')
      expect(mockFn).toHaveBeenCalledTimes(3)
    })
  })
})
