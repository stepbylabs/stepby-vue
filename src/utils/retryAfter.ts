/**
 * `Retry-After` 的解析（从 `utils/request` 迁出的零依赖实现，b138）。
 *
 * 迁出原因：b138 新增的直连原语 `utils/blobRequest` 也要解析同一个响应头，
 * 而它不能反向导入 `utils/request`（那里在模块顶层的 `axios.create` + 拦截器注册
 * 会被拖进每一条直连通道，测试也必须为它准备整套 mock）。本模块只依赖语言内置，
 * `utils/request` 再 re-export 保持既有导入路径（`request.retryAfter.test.ts` 不受影响）。
 *
 * 解析口径不变：接受 delta-seconds 与 HTTP-date，返回**剩余秒数**；缺失、非字符串、
 * 非数字非日期、已过期、超过上限一律 `undefined`——不得让界面拿到 `NaN`/`0` 去显示
 * "0 秒后再试"（`Number(null) === 0` 这一族本仓判据踩过三次：b79/b82/b129）。
 */

/** `Retry-After` 头名（RFC 9110）；axios 把响应头键统一转小写。 */
export const RETRY_AFTER_HEADER = 'retry-after'

/** 采信上限：一天的退避提示已属可疑，超过一律不采信——否则一个畸形大数会把按钮锁到刷新为止。 */
export const RETRY_AFTER_MAX_SECONDS = 86400

export function parseRetryAfterSeconds(raw: unknown, nowMs: number = Date.now()): number | undefined {
  if (typeof raw !== 'string') return undefined
  const text = raw.trim()
  if (!text) return undefined
  if (/^\d+$/.test(text)) {
    const secs = Number(text)
    return Number.isSafeInteger(secs) && secs > 0 ? Math.min(secs, RETRY_AFTER_MAX_SECONDS) : undefined
  }
  const at = Date.parse(text)
  if (Number.isNaN(at)) return undefined
  const secs = Math.ceil((at - nowMs) / 1000)
  if (!Number.isFinite(secs) || secs <= 0) return undefined
  return Math.min(secs, RETRY_AFTER_MAX_SECONDS)
}
