/**
 * `utils/blobRequest` 的契约（b138）。
 *
 * 这一层是"第二条请求通道"的**唯一实现**，四项纪律缺一条就会退回 b138 立案件里的形状：
 * ① 显式超时（`fetch` 默认无超时 / 裸 axios 默认 `timeout: 0`）；
 * ② 后端理由优先的文案（按码映射会把"该入口繁忙，请 7 秒后重试"压成"请求过于频繁"）；
 * ③ 追踪号（响应体 `trace_id` 与响应头 `X-Request-Id` 同值，体优先）；
 * ④ 401 走主通道同一个会话失效链路。
 *
 * 夹具形状取**生产码真实产出的形状**：错误体是 blob（`responseType: 'blob'` 下 axios 对
 * JSON 错误体同样按 Blob 返回），所以断言里一律构造 Blob 而不是普通对象——用对象做夹具
 * 会让 `readBlobErrorBody` 走不到真实分支，单测绿着而线上仍读不到 msg（b86 同族）。
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'

const h = vi.hoisted(() => ({
  axiosMock: vi.fn(),
  notifySessionExpired: vi.fn().mockResolvedValue(undefined)
}))

vi.mock('axios', () => ({ default: h.axiosMock }))
vi.mock('@/utils/auth', () => ({ getToken: () => 'test-token' }))
vi.mock('@/utils/request', () => ({ notifySessionExpired: h.notifySessionExpired }))

const { blobRequest, failureText, resolveBlobFailure } = await import('@/utils/blobRequest')
const i18n = (await import('@/i18n')).default

const BASE = String(import.meta.env.VITE_APP_BASE_API || '')

/** 构造 axios 拒绝值：`responseType: 'blob'` 下错误体是 Blob */
function axiosFailure(status: number, body: unknown, headers: Record<string, string> = {}) {
  const data =
    body === undefined
      ? undefined
      : new Blob([typeof body === 'string' ? body : JSON.stringify(body)], { type: 'application/json' })
  return { response: { status, data, headers }, message: `Request failed with status code ${status}` }
}

beforeEach(() => {
  vi.clearAllMocks()
  h.notifySessionExpired.mockResolvedValue(undefined)
})

describe('blobRequest · 成功通道', () => {
  it('带上 baseURL / params / 显式 timeout / Bearer，并把 Blob 与响应头交回调用方', async () => {
    const payload = new Blob(['file-bytes'], { type: 'application/octet-stream' })
    h.axiosMock.mockResolvedValueOnce({ data: payload, headers: { 'download-filename': 'a.txt' } })

    const res = await blobRequest({
      url: '/common/download',
      params: { fileName: 'a.txt' },
      responseType: 'blob',
      timeout: 1234
    })

    expect(h.axiosMock).toHaveBeenCalledTimes(1)
    const config = h.axiosMock.mock.calls[0][0] as Record<string, unknown>
    expect(config.url).toBe(BASE + '/common/download')
    expect(config.params).toEqual({ fileName: 'a.txt' })
    expect(config.responseType).toBe('blob')
    // 超时是必填项：缺了它会退回"无超时"的形状，而这一层存在的第一理由就是它
    expect(config.timeout).toBe(1234)
    expect(config.headers).toEqual({ Authorization: 'Bearer test-token' })

    expect(res.ok).toBe(true)
    if (res.ok) {
      expect(res.data).toBe(payload)
      expect(res.headers['download-filename']).toBe('a.txt')
    }
  })
})

describe('blobRequest · 失败通道', () => {
  it('403：后端 msg 优先（不被按码映射顶掉），追踪号从响应体取', async () => {
    h.axiosMock.mockRejectedValueOnce(
      axiosFailure(403, { code: 403, msg: '没有该文件的下载权限', trace_id: 'trace-b138-403' })
    )

    const res = await blobRequest({ url: '/common/download', responseType: 'blob', timeout: 10 })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.failure.status).toBe(403)
      expect(res.failure.message).toBe('没有该文件的下载权限')
      expect(res.failure.traceId).toBe('trace-b138-403')
      expect(failureText(res.failure)).toBe('没有该文件的下载权限')
    }
    // 403 不是会话失效：绝不能把用户踢下线
    expect(h.notifySessionExpired).not.toHaveBeenCalled()
  })

  it('429 + Retry-After：给出退避秒数，文案由 failureText 统一补', async () => {
    h.axiosMock.mockRejectedValueOnce(
      axiosFailure(429, { code: 429, msg: '导出任务繁忙（export:excel）' }, { 'retry-after': '7' })
    )

    const res = await blobRequest({ url: '/x/export', responseType: 'blob', timeout: 10 })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.failure.retryAfterSeconds).toBe(7)
      expect(res.failure.message).toBe('导出任务繁忙（export:excel）')
      expect(failureText(res.failure)).toContain('7')
    }
  })

  it('429 但没有合法 Retry-After：不得编一个秒数出来（对照组）', async () => {
    h.axiosMock.mockRejectedValueOnce(axiosFailure(429, { code: 429, msg: '请求过于频繁' }))

    const res = await blobRequest({ url: '/x/export', responseType: 'blob', timeout: 10 })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.failure.retryAfterSeconds).toBeUndefined()
      // 不给后缀，而不是补一个猜出来的等待时长（与后端"冷启动不发头"同一条口径）
      expect(failureText(res.failure)).toBe('请求过于频繁')
    }
  })

  it('网络中断（无响应）：status=null 且落通用文案，不冒充某个 HTTP 码', async () => {
    h.axiosMock.mockRejectedValueOnce({ message: 'Network Error' })

    const failure = await resolveBlobFailure({ message: 'Network Error' })
    expect(failure.status).toBeNull()
    expect(failure.message).toBe(i18n.global.t('common.downloadError'))

    const res = await blobRequest({ url: '/common/download', responseType: 'blob', timeout: 10 })
    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.failure.status).toBeNull()
  })

  it('401：走主通道同一个会话失效链路，但失败结局照常交回调用方', async () => {
    h.axiosMock.mockRejectedValueOnce(axiosFailure(401, { code: 401, msg: '登录状态已过期' }))

    const res = await blobRequest({ url: '/common/download', responseType: 'blob', timeout: 10 })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.failure.status).toBe(401)
    // 动态 import 的通知是 `void` 调用的：等它落地再判，否则断言跑在派发之前（假红/假绿都常见）
    await vi.waitFor(() => expect(h.notifySessionExpired).toHaveBeenCalledTimes(1))
  })

  it('会话失效链路自身抛错：必须吞掉，不能让"提示会话过期"覆盖掉 401 的失败结局', async () => {
    h.notifySessionExpired.mockRejectedValueOnce(new Error('request module unavailable'))
    h.axiosMock.mockRejectedValueOnce(axiosFailure(401, { code: 401, msg: '登录状态已过期' }))

    const res = await blobRequest({ url: '/common/download', responseType: 'blob', timeout: 10 })

    expect(res.ok).toBe(false)
    if (!res.ok) expect(res.failure.status).toBe(401)
    await vi.waitFor(() => expect(h.notifySessionExpired).toHaveBeenCalled())
  })

  it('非 JSON 错误体（网关 HTML 页）：追踪号回落到响应头，文案落通用档', async () => {
    h.axiosMock.mockRejectedValueOnce(
      axiosFailure(502, '<html>Bad Gateway</html>', { 'x-request-id': 'trace-b138-gateway' })
    )

    const res = await blobRequest({ url: '/common/download', responseType: 'blob', timeout: 10 })

    expect(res.ok).toBe(false)
    if (!res.ok) {
      expect(res.failure.status).toBe(502)
      expect(res.failure.traceId).toBe('trace-b138-gateway')
      expect(res.failure.message.trim()).not.toBe('')
    }
  })
})
