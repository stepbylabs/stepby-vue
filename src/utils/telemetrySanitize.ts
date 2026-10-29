/**
 * 遥测文本脱敏（b132）。
 *
 * 缺陷形态（真机取证）：`sys_frontend_error.page_url` 直接存 `location.href`，
 * 而列表页的筛选值会被 b131 的 `syncUrlQuery` 写进地址栏 ⇒ 「按用户名/手机号搜索时
 * 恰巧发生一次 JS 错误」就把**别人的 PII** 持久化进管理端可查、可按天统计的遥测表。
 * 开发库实测 178,386 行里有 **39,039 行**带查询串，其中 `userName=` 命中 **2,112 行**
 * （如 `.../system/user?pageNum=1&pageSize=10&userName=e2e_view_xxx`），另有 b131 修掉
 * 之前留下的 `params=[object Object]` 垃圾 20 行。错误 `message`/`stack` 里嵌入的
 * 请求 URL 同理。
 *
 * 口径（与 AGENTS C.9「判据是未认证者能推断出什么」同源）：
 * - **pageUrl 只保留 origin + path + 参数名**，值一律换成 `***`；凭据类参数
 *   （`code`/`state`/`token`/`ticket`/`secret` 等）连同键一起丢弃。hash 整段丢弃
 *   （前端路由不用 hash，留下只会多一个未审查的数据通道）。
 * - **任意文本里的查询对**（`?k=v` / `&k=v`）只遮蔽值，保留键名便于定位是哪条链路。
 * - 解析失败（畸形 href）时退化为"去掉 `?` 与 `#` 之后的部分"，绝不抛错——
 *   遥测链路的职责是上报，不是校验 URL。
 *
 * 刻意**不做长度截断**（pageUrl 除外）：后端 `opt_truncate` 已按字符截断，
 * 前端再截一次会让"超长 message 必须改走非 keepalive 请求"这条既有判据失去输入。
 */

/** 凭据类查询键：值不进遥测，键本身也不保留 */
const SENSITIVE_QUERY_KEYS = new Set([
  'code',
  'state',
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'ticket',
  'password',
  'passwd',
  'secret',
  'client_secret',
  'api_key',
  'apikey',
  'authorization',
  'auth',
  'session',
  'sessionid',
  'sid',
  'sig',
  'signature'
])

export const MAX_TELEMETRY_PAGE_URL_CHARS = 512

function truncateChars(value: string, maxChars: number): string {
  if (maxChars <= 0) return ''
  const chars = Array.from(value)
  if (chars.length <= maxChars) return value
  return `${chars.slice(0, maxChars - 1).join('')}…`
}

function isSensitiveQueryKey(key: string): boolean {
  return SENSITIVE_QUERY_KEYS.has(key.toLowerCase())
}

/**
 * 遥测用的页面地址：origin + pathname + 参数名（值遮蔽），凭据类参数整体丢弃。
 * 相对地址（测试/异常调用）只保留 path，不虚构 origin。
 */
export function sanitizePageUrl(href: string | undefined | null, maxChars = MAX_TELEMETRY_PAGE_URL_CHARS): string {
  const raw = (href ?? '').trim()
  if (!raw) return ''
  let out: string
  try {
    const u = new URL(raw, 'http://telemetry.invalid')
    const absolute = /^[a-z][a-z0-9+.-]*:/i.test(raw)
    const base = absolute ? `${u.protocol}//${u.host}${u.pathname}` : u.pathname
    const kept: string[] = []
    u.searchParams.forEach((value, key) => {
      if (!value) return
      if (isSensitiveQueryKey(key)) return
      kept.push(`${key}=***`)
    })
    out = kept.length ? `${base}?${kept.join('&')}` : base
  } catch {
    out = raw.split('?')[0].split('#')[0]
  }
  return truncateChars(out, maxChars)
}

/** 文本中的查询对：`?k=v` / `&k=v`，值到分隔符为止 */
const QUERY_PAIR_RE = /([?&])([A-Za-z0-9_.\-[\]]+)=([^&\s"'<>`#]*)/g

/**
 * 任意文本（错误 message / stack）里的查询值脱敏；无查询对时原样返回。
 * 不在“值里再脱敏一次”，避免把已遮蔽的 `***` 反复改写。
 */
export function redactTelemetryText(text: string | undefined | null): string {
  const raw = text ?? ''
  if (!raw) return raw
  return raw.replace(QUERY_PAIR_RE, (_match, sep: string, key: string) => `${sep}${key}=***`)
}

export const __testables = { SENSITIVE_QUERY_KEYS, truncateChars, isSensitiveQueryKey }
