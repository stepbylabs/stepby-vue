/**
 * 直连（不走 `service` 拦截器）的二进制请求**单一实现**（b138）。
 *
 * ## 为什么需要这一层
 *
 * 下载与导出族不能用 `service`：它把成功响应当 JSON 处理，也会把 blob 错误体读成
 * `undefined`。于是本仓长期存在"第二条通道"，而它的**每一项纪律都要单独补一遍**：
 * - b99 补超时（`FILE_DOWNLOAD_TIMEOUT`）——但只补在 `src/api/**`，`src/plugins/download`
 *   三处仍写着 `timeout: 60000`（统一口径是 600_000，差 10 倍）；
 * - b125 补错误文案与追踪号——补在 `plugins/download`；
 * - b124 的追踪号闭环、b137 给导出端点新加的独立限流（5/s）带来的 429 语义，
 *   `views/monitor/aiHistory` 的裸 `fetch` 一项都没有（连超时都没有，`fetch` 默认无超时）。
 *
 * 这一层的职责就是把这四项收成一份实现：**显式超时 + 后端理由优先的文案 + 追踪号 +
 * 会话失效（401）**。新增任何 blob 直连通道都走它，别再各写一份。
 *
 * ## 口径
 * - `timeout` 必填且调用点必须引用 `utils/timeouts` 的常量（`FILE_DOWNLOAD_TIMEOUT`）。
 *   守卫 `src/api/blobTimeout.guard.test.ts` 按"含 `responseType: 'blob'` 的对象字面量"
 *   扫全 `src/**`（含 `.vue`），缺声明或写字面量即红。
 * - 失败一律返回 `failure` 而不是抛：调用方要 `finally` 关 loading，抛错会让收尾分叉。
 * - 401 逐个通道语义不同：用户会话过期要走统一重新登录；`/metrics` 的运维令牌不匹配
 *   绝不能把用户踢下线（那条通道因此改走后端鉴权端点，见 b138 台账）。
 */
import axios from 'axios'
import i18n from '@/i18n'
import { getToken } from '@/utils/auth'
import { readBlobErrorBody } from '@/utils/blobError'
import { resolveApiErrorMessage } from '@/utils/apiError'
import { pickTraceId } from '@/utils/traceId'
import { parseRetryAfterSeconds, RETRY_AFTER_HEADER } from '@/utils/retryAfter'

const baseURL = String(import.meta.env.VITE_APP_BASE_API || '')

export interface BlobFailure {
  /** HTTP 状态码；网络中断/超时（无响应）为 `null` */
  status: number | null
  /** 用户可见文案：后端 `msg` 优先，其次按码映射，最后通用"下载失败" */
  message: string
  /** 故障追踪号（响应体 `trace_id` 或响应头 `X-Request-Id`） */
  traceId?: string
  /** 仅当响应带合法的 `Retry-After` 时给出（429 退避） */
  retryAfterSeconds?: number
}

export type BlobResult =
  { ok: true; data: Blob; headers: Record<string, unknown> } | { ok: false; failure: BlobFailure }

export interface BlobRequestInit {
  /** 不含 `VITE_APP_BASE_API` 前缀的路径（由本函数统一拼基址） */
  url: string
  params?: Record<string, string | number>
  /** 让调用点显式声明响应类型，守卫才能按对象字面量识别到这条通道 */
  responseType: 'blob'
  /** 必须引用 `FILE_DOWNLOAD_TIMEOUT` 一类常量，禁止字面量 */
  timeout: number
}

type AxiosFailure = {
  response?: { status?: number; data?: unknown; headers?: unknown }
  message?: string
}

/**
 * 把任意失败归一成可展示的 `BlobFailure`（`plugins/download` 与 `blobRequest` 共用）。
 *
 * 优先级与主通道一致（b125）：后端 `msg` 比按码写的通用文案具体——b137 新增的
 * 外带限流会回"该入口繁忙，请 N 秒后重试"，按码只能映射成"请求过于频繁"。
 */
export async function resolveBlobFailure(error: unknown): Promise<BlobFailure> {
  const response = (error as AxiosFailure)?.response
  const body = await readBlobErrorBody(response?.data)
  const traceId = pickTraceId(body ?? response?.data, response?.headers)
  const hasBodyDetail = body?.code !== undefined || body?.msg !== undefined
  const message =
    hasBodyDetail || response?.status
      ? resolveApiErrorMessage(body?.code ?? response?.status, body?.msg)
      : i18n.global.t('common.downloadError')
  const retryAfterSeconds = parseRetryAfterSeconds(
    (response?.headers as Record<string, unknown> | undefined)?.[RETRY_AFTER_HEADER]
  )
  return { status: response?.status ?? null, message, traceId, retryAfterSeconds }
}

/**
 * 用户可见文案：429 且带合法 `Retry-After` 时补上"多少秒后重试"。
 *
 * 后端限流的 `msg` 是固定的 `error.rate_limit.too_many_requests`（不含秒数），
 * 剩余时长只在响应头里（`middleware/rate_limit.rs` 实测：429 + `Retry-After: N`）。
 * 不补这一句，用户只看到"请求过于频繁"而不知道要等 1 秒还是 10 分钟。
 */
export function failureText(failure: BlobFailure): string {
  if (failure.status === 429 && failure.retryAfterSeconds !== undefined) {
    return `${failure.message}（${i18n.global.t('common.retryAfterSeconds', { seconds: failure.retryAfterSeconds })}）`
  }
  return failure.message
}

/**
 * 会话失效走主通道同一条链路（对话框 + 并发合并 + 登出动作注册）。
 *
 * 动态导入是刻意的：`utils/request` 在模块顶层建 axios 实例并注册拦截器，静态导入会把
 * 这整套拖进每一条直连通道（连 `plugins/download` 的单测都要为它准备 mock）。
 * 只有真的 401 才需要它。
 */
async function notifySessionExpired(): Promise<void> {
  try {
    const { notifySessionExpired: notify } = await import('@/utils/request')
    await notify()
  } catch {
    // 会话失效链路自身不可用（极早 401 / 模块加载失败）不得吞掉失败结局：
    // 调用方仍会拿到 401 的 failure 并提示，用户刷新后自然落回登录页。
  }
}

/** 直连 GET 一份二进制响应。失败返回 `{ ok: false }`（不抛，调用方负责收尾）。 */
export async function blobRequest(init: BlobRequestInit): Promise<BlobResult> {
  try {
    const res = await axios({
      method: 'get',
      url: baseURL + init.url,
      params: init.params,
      responseType: init.responseType,
      timeout: init.timeout,
      headers: { Authorization: 'Bearer ' + (getToken() ?? '') }
    })
    return { ok: true, data: res.data as Blob, headers: (res.headers ?? {}) as Record<string, unknown> }
  } catch (error) {
    const failure = await resolveBlobFailure(error)
    if (failure.status === 401) {
      // 用户会话过期：与主通道同一个"是否重新登录"对话框，而不是一句"下载失败"。
      void notifySessionExpired()
    }
    return { ok: false, failure }
  }
}
