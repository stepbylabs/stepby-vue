/**
 * b83：`Retry-After` 的 UI 消费点（锁定/限流态的倒计时闸门）。
 *
 * 存在理由：后端从本批起在锁定与限流的 429 上发 `Retry-After`（真实剩余 TTL，
 * 见 `stepby-axum` 的 `common::error::AppError::retry_after` 与 `SharedStore::ttl`）。
 * 头发了却没人读，等于把契约留在空气里——用户看到"请 10 分钟后再试"仍然可以
 * 无限制地点"确定"，每次都换回一个 429 与一条失败审计。本 composable 把那个数
 * 变成一个真的闸门：**没有 Retry-After 时行为与改造前逐字节一致**（locked 恒 false）。
 *
 * 用法：
 * ```ts
 * const retry = useRetryAfterLock()
 * // 提交失败分支里：retry.startFrom(err)     ← 只有 429 带提示时才进入锁定
 * // 按钮：:disabled="retry.locked.value"，文案里显示 retry.remaining.value
 * ```
 *
 * 口径三条：
 * - 只接受正整数秒（`request.ts::parseRetryAfterSeconds` 已把 HTTP-date、
 *   非数字、已过期、超上限都归一成 undefined）；取不到 ⇒ **不锁**，不猜一个数。
 * - 倒计时按秒自减到 0 自动解锁；`stop()` 供"后端又放行了一次"之类的外部复原。
 * - 卸载/作用域销毁清定时器：漏掉这一步的倒计时会在组件销毁后继续写 ref，
 *   并在下一个挂载实例上叠出一个更快的时钟（两处 tick 抢同一个 ref）。
 */
import { computed, onScopeDispose, ref, type Ref } from 'vue'

/** 与 `request.ts` 的上限口径一致（1 天）；这里只是防御性地再夹一次。 */
const MAX_LOCK_SECONDS = 86400

export interface RetryAfterLock {
  /** 剩余秒数（0 = 未锁定） */
  remaining: Ref<number>
  /** 是否处于锁定窗口（模板侧直接绑到 `:disabled`） */
  locked: Ref<boolean>
  /** 从一次请求失败的 error 上取 `retryAfterSeconds` 并起闸；返回是否真的起了锁 */
  startFrom: (err: unknown) => boolean
  /** 同上，但入参是裸秒数（`startFrom` 的唯一实现，导出是为了单测能直接喂畸形值） */
  startSeconds: (secs: number | undefined) => boolean
  /** 显式解锁（成功路径或页面重置时调用） */
  stop: () => void
}

export function useRetryAfterLock(): RetryAfterLock {
  const remaining = ref(0)
  const locked = computed(() => remaining.value > 0)
  let timer: ReturnType<typeof setInterval> | null = null

  const clearTimer = () => {
    if (timer !== null) {
      clearInterval(timer)
      timer = null
    }
  }
  const stop = () => {
    clearTimer()
    remaining.value = 0
  }

  /** 与 `startFrom` 同一判据的裸秒数入口（单测与"后端直接给秒数"的形态用它）。 */
  const startSeconds = (secs: number | undefined): boolean => {
    // `Number(null) === 0`、`Number.isFinite(NaN) === false`：先归一再判，方向不能反
    if (secs === undefined || !Number.isFinite(secs) || secs <= 0) return false
    remaining.value = Math.min(Math.ceil(secs), MAX_LOCK_SECONDS)
    if (timer === null) {
      timer = setInterval(() => {
        remaining.value -= 1
        if (remaining.value <= 0) clearTimer()
      }, 1000)
    }
    return true
  }

  const startFrom = (err: unknown): boolean => {
    const secs = (err as { retryAfterSeconds?: unknown } | null | undefined)?.retryAfterSeconds
    return startSeconds(typeof secs === 'number' ? secs : undefined)
  }

  onScopeDispose(clearTimer)

  return { remaining, locked, startFrom, startSeconds, stop }
}
