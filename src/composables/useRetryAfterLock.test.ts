/**
 * `useRetryAfterLock` 契约测试（b83）
 *
 * 这个 composable 是 `Retry-After` 的**唯一消费点**。两条判据方向相反，缺一不可：
 * ① 给了提示必须真的锁住（否则头白发，用户继续把 429 刷成审计流水）；
 * ② **没给提示必须完全不锁**（`remaining` 恒 0 ⇒ `locked` 恒 false ⇒ 登录/TOTP 表单
 *    的行为与改造前逐字段一致）。只测 ① 的实现可以"所有失败都锁 60 秒"，
 *    那是把限流提示做成新的 DoS 面——与 b79"对照组真受约束"同一条纪律。
 *
 * 另外钉死三条时钟自身的形态：到 0 自动解锁、重复起闸不叠表、作用域销毁清定时器
 * （漏掉第三条会让下一个实例以双倍速度倒数，两个 tick 抢同一个 ref）。
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { effectScope, nextTick } from 'vue'
import { useRetryAfterLock, type RetryAfterLock } from '@/composables/useRetryAfterLock'

/** 在真实 effect scope 里建锁（`onScopeDispose` 在 scope 外会打警告，测试不该靠警告活着） */
function createLock(): { lock: RetryAfterLock; dispose: () => void } {
  const scope = effectScope()
  const lock = scope.run(() => useRetryAfterLock())!
  return { lock, dispose: () => scope.stop() }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('① 给了 Retry-After 必须真的锁住', () => {
  it('正数秒 ⇒ locked，剩余秒数可绑文案', () => {
    vi.useFakeTimers()
    const { lock, dispose } = createLock()
    expect(lock.startSeconds(120)).toBe(true)
    expect(lock.locked.value).toBe(true)
    expect(lock.remaining.value).toBe(120)
    dispose()
  })

  it('从 error 上取值（拦截器挂载的形状）', () => {
    vi.useFakeTimers()
    const { lock, dispose } = createLock()
    expect(lock.startFrom({ retryAfterSeconds: 57 })).toBe(true)
    expect(lock.remaining.value).toBe(57)
    dispose()
  })

  it('按秒自减，到 0 自动解锁且不再继续减成负数', () => {
    vi.useFakeTimers()
    const { lock, dispose } = createLock()
    lock.startSeconds(2)
    vi.advanceTimersByTime(1000)
    expect(lock.remaining.value).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(lock.remaining.value).toBe(0)
    expect(lock.locked.value).toBe(false)
    vi.advanceTimersByTime(5000)
    expect(lock.remaining.value).toBe(0)
    dispose()
  })

  it('重复起闸不叠表：第二次以新值为准，且一跳只减 1', () => {
    vi.useFakeTimers()
    const { lock, dispose } = createLock()
    lock.startSeconds(30)
    lock.startSeconds(10)
    expect(lock.remaining.value).toBe(10)
    vi.advanceTimersByTime(1000)
    // 两条 setInterval 抢同一个 ref 时这里会变成 8（各减 1）——那是"倒计时快一倍"的根因
    expect(lock.remaining.value).toBe(9)
    dispose()
  })

  it('上限夹到 86400，畸形大数不得把按钮锁死', () => {
    vi.useFakeTimers()
    const { lock, dispose } = createLock()
    lock.startSeconds(99_999_999)
    expect(lock.remaining.value).toBe(86400)
    dispose()
  })
})

describe('② 没给提示必须完全不锁（改造前行为等价面）', () => {
  it.each([undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])('startSeconds(%s) ⇒ 不起闸', (secs) => {
    vi.useFakeTimers()
    const { lock, dispose } = createLock()
    expect(lock.startSeconds(secs)).toBe(false)
    expect(lock.locked.value).toBe(false)
    expect(lock.remaining.value).toBe(0)
    dispose()
  })

  it('error 上没有该字段 / 是 null / 是字符串 ⇒ 一律不起闸', () => {
    vi.useFakeTimers()
    const { lock, dispose } = createLock()
    expect(lock.startFrom(new Error('普通失败'))).toBe(false)
    expect(lock.startFrom(null)).toBe(false)
    expect(lock.startFrom({ retryAfterSeconds: null })).toBe(false)
    // '120' 这种字符串不是本入口的契约（解析在 request.ts 完成）；这里必须拒绝而不是隐式转换
    expect(lock.startFrom({ retryAfterSeconds: '120' })).toBe(false)
    expect(lock.locked.value).toBe(false)
    dispose()
  })

  it('stop() 立即解锁（成功路径复原）', () => {
    vi.useFakeTimers()
    const { lock, dispose } = createLock()
    lock.startSeconds(60)
    lock.stop()
    expect(lock.locked.value).toBe(false)
    vi.advanceTimersByTime(1000)
    expect(lock.remaining.value).toBe(0)
    dispose()
  })

  it('作用域销毁后定时器不再写 ref（组件卸载不该留下第二个时钟）', async () => {
    vi.useFakeTimers()
    const { lock, dispose } = createLock()
    lock.startSeconds(30)
    dispose()
    await nextTick()
    vi.advanceTimersByTime(5000)
    expect(lock.remaining.value).toBe(30)
  })
})
