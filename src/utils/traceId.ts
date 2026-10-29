/**
 * 请求追踪 ID 的读取与归一（b124）。
 *
 * ## 立的案
 *
 * 后端 G-13a 起，**错误响应**同时带两处同源同值的东西：响应头 `X-Request-Id`
 * 与响应体 `trace_id`（`src/common/response.rs` 的注释写明用途："用户报障时直接贴给
 * 运维 grep 结构化日志即可定位整条请求链路"）。但前端**从未读过它**（实测 `src/`
 * 里 `trace_id`/`x-request-id` 除可观测页自己的 `requestId` 列外零消费点）——
 * 契约发出去了，用户看到的仍是一句"服务器内部错误"，报障时贴不出任何可检索的东西。
 * 这正是 AGENTS ⑮"写了没接线等于没写"的同族：后端多写了一个字段，前端一个字节没接。
 *
 * ## 取向
 *
 * - **只读不造**：ID 只能来自响应（体或头），绝不本地生成。生成一个假 ID 会让用户
 *   报出一个"日志里永远搜不到"的号，比没有更坏（⑯(c) 的同一取向）。
 * - **归一而不是校验格式**：后端当前是 UUID v4，但格式校验会把"后端换 ID 方案"
 *   变成一次静默失效。这里只剔**不可能安全显示**的形状：非字符串、空白、超长、
 *   含控制字符/空白（ID 会被拼进 toast 与日志，不做这层等于给注入留口）。
 * - **两处来源取先到**：体优先、头兜底。HTTP 层失败（如 502 由网关产生）时体可能不是
 *   JSON，头仍在；而业务码失败（HTTP 200 + `code!=200`）只有体。
 */

/** 响应头名字（axios 的 AxiosHeaders 键名大小写不敏感，取值时按小写优先） */
export const TRACE_ID_HEADER = 'x-request-id'

/** ID 的最大可显示长度：再长就不是一个能让人抄下来的东西了 */
export const TRACE_ID_MAX_LEN = 128

/**
 * 归一条候选 ID：合法返回去空白后的原值，否则 `undefined`。
 *
 * 注意这里是"取不到 ⇒ undefined"而不是空串——空串会被 UI 当成"有 ID"渲染出
 * 一个空标签，正是 `Number(null) === 0` 那一族（取不到被读成有值）。
 */
export function normalizeTraceId(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined
  }
  const id = value.trim()
  if (id === '' || id.length > TRACE_ID_MAX_LEN) {
    return undefined
  }
  // 控制字符与空白：拼进 toast / 日志前必须挡住（ID 不是富文本）。
  // 逐字符判码点而不是写字符类范围——`eslint no-control-regex` 拦的正是这种误用，
  // 而且逐个判能把"为什么拒"写在这一行上。
  for (const ch of id) {
    const code = ch.codePointAt(0) ?? 0
    if (code <= 0x1f || code === 0x7f || /\s/.test(ch)) {
      return undefined
    }
  }
  return id
}

/** 从响应体读 `trace_id`（业务码失败路径只有这一处来源） */
export function readTraceIdFromBody(body: unknown): string | undefined {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return undefined
  }
  return normalizeTraceId((body as { trace_id?: unknown }).trace_id)
}

/**
 * 从响应头读 `X-Request-Id`。
 *
 * 兼容两种形状：axios 的 `AxiosHeaders`（有 `get()`）与普通对象（单测/桩适配器）。
 * 取不到时返回 `undefined`，**不回落到任何本地值**。
 */
export function readTraceIdFromHeaders(headers: unknown): string | undefined {
  if (headers === null || typeof headers !== 'object') {
    return undefined
  }
  const h = headers as Record<string, unknown> & { get?: (name: string) => unknown }
  if (typeof h.get === 'function') {
    const viaGet = normalizeTraceId(h.get(TRACE_ID_HEADER))
    if (viaGet) {
      return viaGet
    }
  }
  return normalizeTraceId(h[TRACE_ID_HEADER] ?? h['X-Request-Id'])
}

/** 体优先、头兜底 */
export function pickTraceId(body: unknown, headers?: unknown): string | undefined {
  return readTraceIdFromBody(body) ?? readTraceIdFromHeaders(headers)
}

/** 带追踪 ID 的错误：调用方（登录页/锁屏页/监控面板）据此展示或归档 */
export type TracedError = Error & { traceId?: string }

/**
 * 把 ID 挂到错误对象上（没有就不挂）。
 *
 * 挂载点固定在 `error.traceId`：页面只读这一个字段，不需要知道它是从体还是头来的。
 */
export function attachTraceId<T extends Error>(err: T, traceId: string | undefined): T & TracedError {
  if (traceId) {
    ;(err as T & TracedError).traceId = traceId
  }
  return err as T & TracedError
}
